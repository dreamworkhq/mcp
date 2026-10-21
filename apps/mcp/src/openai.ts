import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { profileResponseSchema } from "@jobless/api-contracts";
import { ACTIONS, type ActionDefinition, type OpenAiHiddenReason } from "@jobless/assistant-contracts";
import { z } from "zod";

/** Hand-written tools the OpenAI distribution leaves out. Registry tools declare theirs as `mcp.openai`. */
export const OPENAI_WITHHELD_TOOLS: Readonly<Record<string, OpenAiHiddenReason>> = {
  get_upgrade_link: "digital_commerce",
};

/** The task ledger also holds acts started on the site or the default endpoint; these never surface here. */
const registry: readonly ActionDefinition[] = ACTIONS;
const WITHHELD_ACTION_IDS: ReadonlySet<string> = new Set([
  ...registry.flatMap(action => action.mcp.expose && action.mcp.openai ? [action.id] : []),
  ...Object.keys(OPENAI_WITHHELD_TOOLS),
]);
const WITHHELD_ACTIVITY_SUMMARY = "An account step taken outside this connector.";

/** Keys never sent to OpenAI: internal identifiers, credentials, purchase links and the plan tier. */
const OMITTED_KEYS: ReadonlySet<string> = new Set([
  "userId", "profileId", "sessionId", "traceId", "requestId",
  "checkoutUrl", "upgradeUrl", "upgradeLink", "apiKey", "accessToken", "refreshToken",
  "tier",
]);
const ENTITLEMENT_MESSAGE = "The account's current plan does not include this, or the account has used its limit for it. Nothing was purchased and the plan was not changed.";

const careerPreferencesSchema = profileResponseSchema.shape.profile.shape.preferences.unwrap().pick({
  roles: true, salaryMin: true, salaryMax: true, preferredLocations: true,
  preferredPlaces: true, functions: true, acceptedWorkModes: true,
  willingToRelocate: true, remotePreference: true, remote: true,
  dealBreakers: true, excludedCompanies: true, coverLettersEnabled: true,
  tailoredResumesEnabled: true,
}).strip();

const careerProfileSchema = profileResponseSchema.shape.profile.pick({
  name: true, resumeText: true, profileIdentityVersion: true,
  tonePreferences: true, nameStatus: true,
}).extend({ preferences: careerPreferencesSchema.nullable() });

/** Default profile reads need career context and revision authority, not contact or screening records. */
const openAiProfileSchema = profileResponseSchema.extend({ profile: careerProfileSchema });

/** Mirror the response projection in advertised schemas so SDK validation checks the data clients receive. */
export function openAiOutputSchema(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodObject) {
    const kept = Object.fromEntries(Object.entries(schema.shape)
      .filter(([key]) => !OMITTED_KEYS.has(key))
      .map(([key, field]) => [key, openAiOutputSchema(field as z.ZodType)]));
    const removed = Object.fromEntries(Object.keys(schema.shape).filter(key => OMITTED_KEYS.has(key)).map(key => [key, true as const]));
    return schema.omit(removed as Parameters<typeof schema.omit>[0]).extend(kept);
  }
  if (schema instanceof z.ZodArray) return z.array(openAiOutputSchema(schema.element as z.ZodType));
  if (schema instanceof z.ZodOptional) return openAiOutputSchema(schema.unwrap() as z.ZodType).optional();
  if (schema instanceof z.ZodNullable) return openAiOutputSchema(schema.unwrap() as z.ZodType).nullable();
  if (schema instanceof z.ZodUnion) return z.union(schema.options.map(option => openAiOutputSchema(option as z.ZodType)) as [z.ZodType, z.ZodType, ...z.ZodType[]]);
  return schema;
}

export function openAiToolOutputSchema(name: string, schema: z.ZodObject<z.ZodRawShape>): z.ZodObject<z.ZodRawShape> {
  return (name === "get_profile" ? openAiProfileSchema : openAiOutputSchema(schema)) as z.ZodObject<z.ZodRawShape>;
}

function transactionalUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return /(^|\.)(checkout\.stripe\.com|buy\.stripe\.com)$/iu.test(url.hostname) ||
      (/(^|\.)dreamworkhq\.com$/iu.test(url.hostname) &&
        (/\/(billing|checkout|upgrade|subscribe|subscription)(\/|$)/iu.test(url.pathname) ||
          [url.searchParams.get("section"), url.searchParams.get("tab"), url.searchParams.get("action")].some(value => value !== null && /^(billing|checkout|upgrade|subscribe|subscription)$/iu.test(value))));
  } catch { return false; }
}

/**
 * Refusal wording that sells a plan rather than explaining the account's entitlement. Error text only, so career text
 * is never rewritten; plan names count only beside each other or "plan", because errors can echo a place or an industry.
 */
function promotesPurchase(text: string): boolean {
  return /\b(upgrad(e|es|ed|ing)|subscribe (to|now)|purchase (credits|a plan)|free trial)\b/iu.test(text) ||
    /\b(Pro|Dreamer|Ultra) (and|or|plan|plans)\b/u.test(text);
}

function withheldActivity(value: unknown): boolean {
  return value !== null && typeof value === "object" &&
    WITHHELD_ACTION_IDS.has((value as { actionId?: unknown }).actionId as string);
}

function safeText(text: string, errorContext = false): string {
  const urls = text.match(/https?:\/\/[^\s<>"\\]+/giu) ?? [];
  if (urls.some(transactionalUrl) || (errorContext && promotesPurchase(text))) return ENTITLEMENT_MESSAGE;
  return text;
}

function project(value: unknown, errorContext = false): unknown {
  if (typeof value === "string") return safeText(value, errorContext);
  if (Array.isArray(value)) return value.filter(field => !withheldActivity(field)).map(field => project(field, errorContext));
  if (value === null || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  if (object.handoff && typeof object.handoff === "object") {
    const handoff = object.handoff as Record<string, unknown>;
    if (typeof handoff.openUrl === "string" && transactionalUrl(handoff.openUrl)) return { status: "unavailable", message: ENTITLEMENT_MESSAGE };
    const destination = handoff.destination as { destination?: unknown } | undefined;
    if (destination?.destination === "billing" || handoff.reason === "needs_entitlement" || handoff.reason === "needs_payment_details") {
      return project({ ...object, handoff: null, summary: ENTITLEMENT_MESSAGE, ...(Object.hasOwn(object, "webUrl") ? { webUrl: null } : {}) }, errorContext);
    }
  }
  // A plan refusal, whether a failed action or one role of a batch, says so in one fixed sentence: the API's own wording may name plans or upgrades.
  const planRefusal = object.code === "action_paywalled" || object.outcome === "quota_blocked";
  const withheld = withheldActivity(object);
  return Object.fromEntries(Object.entries(object)
    .filter(([key]) => !OMITTED_KEYS.has(key) && !(planRefusal && key === "nextStep"))
    .map(([key, field]) => [key,
      planRefusal && key === "message" ? ENTITLEMENT_MESSAGE
        : withheld && key === "summary" ? WITHHELD_ACTIVITY_SUMMARY
          : project(field, errorContext || key === "error")]));
}

/** Applied only after canonical API decoding; text and structured data undergo the same projection. */
export function openAiToolResult(name: string, result: CallToolResult): CallToolResult {
  const data = (value: unknown): unknown => {
    const projected = name === "get_profile" ? openAiProfileSchema.parse(value) : value;
    return project(projected);
  };
  return {
    ...result,
    content: result.content.map(block => {
      if (block.type !== "text") return block;
      let parsed: unknown;
      try { parsed = JSON.parse(block.text); } catch { return { ...block, text: safeText(block.text, result.isError) }; }
      return { ...block, text: JSON.stringify(result.isError ? project(parsed, true) : data(parsed), null, 2) };
    }),
    ...(result.structuredContent ? { structuredContent: data(result.structuredContent) as Record<string, unknown> } : {}),
  };
}
