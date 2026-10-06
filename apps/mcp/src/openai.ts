import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { profileResponseSchema } from "@jobless/api-contracts";
import { z } from "zod";

export const OPENAI_WITHHELD_TOOLS: ReadonlySet<string> = new Set([
  "start_checkout",
  "get_upgrade_link",
]);

const PRIVATE_KEYS: ReadonlySet<string> = new Set([
  "userId", "profileId", "sessionId", "traceId", "requestId",
  "checkoutUrl", "upgradeUrl", "upgradeLink", "apiKey", "accessToken", "refreshToken",
]);
const ENTITLEMENT_MESSAGE = "This feature is unavailable under the account's current entitlement. No purchase or plan change was started.";

const careerPreferencesSchema = profileResponseSchema.shape.profile.shape.preferences.unwrap().pick({
  roles: true, salaryMin: true, salaryMax: true, preferredLocations: true,
  preferredPlaces: true, functions: true, acceptedWorkModes: true,
  willingToRelocate: true, remotePreference: true, remote: true,
  dealBreakers: true, coverLettersEnabled: true,
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
      .filter(([key]) => !PRIVATE_KEYS.has(key))
      .map(([key, field]) => [key, openAiOutputSchema(field as z.ZodType)]));
    const removed = Object.fromEntries(Object.keys(schema.shape).filter(key => PRIVATE_KEYS.has(key)).map(key => [key, true as const]));
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

function safeText(text: string, errorContext = false): string {
  const urls = text.match(/https?:\/\/[^\s<>"\\]+/giu) ?? [];
  if (urls.some(transactionalUrl) || (errorContext && /\b(upgrade (to (pro|dreamer)|your plan|the plan)|subscribe (to|now)|purchase (credits|a plan))\b/iu.test(text))) return ENTITLEMENT_MESSAGE;
  return text;
}

function project(value: unknown, errorContext = false): unknown {
  if (typeof value === "string") return safeText(value, errorContext);
  if (Array.isArray(value)) return value.map(field => project(field, errorContext));
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
  return Object.fromEntries(Object.entries(object).filter(([key]) => !PRIVATE_KEYS.has(key)).map(([key, field]) => [key, project(field, errorContext || key === "error")]));
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
