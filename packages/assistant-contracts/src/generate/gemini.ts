import type { ActionDefinition } from "../action.js";
import { withCommandIntent } from "./intent.js";
import { type JsonSchemaObject, toToolJsonSchema } from "./openai.js";

/**
 * Gemini function declarations.
 *
 * OpenAI and Anthropic both take JSON Schema as it comes out of Zod. Gemini
 * does not: its `Schema` is an OpenAPI 3.03 subset, and a key outside that
 * subset is rejected by the API rather than ignored — `additionalProperties`
 * and the numeric bounds `z.int()` emits are each enough on their own to make
 * every tool in the registry unusable. So this generator narrows rather than
 * passes through, and the narrowing is an ALLOWLIST: a construct nobody has
 * checked against the API is dropped, never forwarded on the assumption that
 * it is harmless.
 *
 * Dropping a constraint is safe here because the schema is not the
 * enforcement. The executor validates every tool call against the action's own
 * Zod input before anything is dispatched, so a key that does not survive the
 * trip costs the model a hint, not the guard.
 */

/** Keys Gemini's Schema understands. Everything else is dropped. */
const KEPT_KEYS = [
  "type",
  "description",
  "enum",
  "items",
  "properties",
  "required",
  "anyOf",
  "nullable",
  "minItems",
  "maxItems",
] as const;

/**
 * The `format` values Gemini documents per type. A format it does not know —
 * `uri`, `uuid`, `email`, all of which Zod emits — is rejected outright, so an
 * unrecognized one is dropped rather than passed on.
 */
const KEPT_FORMATS = new Set([
  "date-time",
  "enum",
  "int32",
  "int64",
  "float",
  "double",
]);

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  /**
   * Omitted for an action that takes no arguments: Gemini's object schema
   * requires a non-empty `properties`, and the way to say "no parameters" is
   * to send no schema at all.
   */
  parameters?: JsonSchemaObject;
}

/** The single `tools` entry Gemini takes, holding every declaration. */
export interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[];
}

function isRecord(value: unknown): value is JsonSchemaObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An object schema Gemini will not accept, because it describes no keys. */
function isUnrepresentable(node: unknown): boolean {
  return isRecord(node) && node.type === "object" && !("properties" in node);
}

/**
 * Narrow one JSON Schema node to Gemini's subset.
 *
 * Four shapes need rewriting rather than filtering, because Zod's spelling is
 * not Gemini's:
 *
 * - `oneOf` becomes `anyOf`. Zod emits `oneOf` for a discriminated union and
 *   Gemini has no such keyword, so a scoped edit's `scope` argument reached it
 *   as an empty schema — a tool the model could see and could not fill in.
 * - `type: ["string", "null"]` becomes `type: "string"` plus `nullable`.
 * - A union carrying a `{ type: "null" }` member becomes the rest of it plus
 *   `nullable`, collapsing to the single remaining member when one is left. A
 *   `z.nullable()` otherwise arrives as a two-member union whose second member
 *   has no type Gemini accepts.
 * - `const` becomes a one-value `enum`, which is how the discriminant of a
 *   discriminated union survives. Without it every branch of that `scope`
 *   looks the same to the model.
 */
function narrow(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(narrow);
  if (!isRecord(node)) return node;

  const out: JsonSchemaObject = {};
  for (const key of KEPT_KEYS) {
    if (!(key in node)) continue;
    const value = node[key];
    if (key === "properties" && isRecord(value)) {
      const properties: JsonSchemaObject = {};
      for (const [name, child] of Object.entries(value)) {
        const narrowed = narrow(child);
        // A free-form map (`z.record`) narrows to an object with nothing in
        // it, and Gemini rejects an object schema whose `properties` is empty
        // — the whole tool list with it. There is no way to say "any keys" in
        // its subset, so the PARAMETER is dropped rather than the request
        // being made unusable. The model then cannot pass that argument on
        // Gemini; `open`'s `params` is the only one today, which costs it the
        // `:param` half of a route. Say so in docs/ASSISTANT.md when a second
        // one appears.
        if (isUnrepresentable(narrowed)) continue;
        properties[name] = narrowed;
      }
      if (Object.keys(properties).length > 0) out.properties = properties;
      continue;
    }
    if (key === "items" || key === "anyOf") {
      out[key] = narrow(value);
      continue;
    }
    out[key] = value;
  }

  if (!("anyOf" in out) && Array.isArray(node.oneOf)) {
    out.anyOf = narrow(node.oneOf);
  }

  if (typeof node.format === "string" && KEPT_FORMATS.has(node.format)) {
    out.format = node.format;
  }

  if ("const" in node && !("enum" in out)) {
    out.enum = [node.const];
    if (out.type === undefined && typeof node.const === "string") {
      out.type = "string";
    }
  }

  if (Array.isArray(out.type)) {
    const concrete = out.type.filter((entry) => entry !== "null");
    if (out.type.length !== concrete.length) out.nullable = true;
    out.type = concrete[0];
  }

  // A required name whose property was just dropped would name nothing.
  if (Array.isArray(out.required) && isRecord(out.properties)) {
    const properties = out.properties;
    out.required = out.required.filter(
      (name) => typeof name === "string" && name in properties,
    );
  }

  if (Array.isArray(out.anyOf)) {
    const members = out.anyOf.filter(
      (member) => !(isRecord(member) && member.type === "null"),
    );
    if (members.length !== out.anyOf.length) out.nullable = true;
    const only = members[0];
    if (members.length === 1 && isRecord(only)) {
      delete out.anyOf;
      const nullable = out.nullable === true;
      Object.assign(out, only);
      if (nullable) out.nullable = true;
    } else {
      out.anyOf = members;
    }
  }

  return out;
}

/**
 * One action input as Gemini's parameter schema, or `undefined` when the
 * action takes no arguments.
 */
export function toGeminiSchema(
  schema: JsonSchemaObject,
): JsonSchemaObject | undefined {
  const narrowed = narrow(schema);
  if (!isRecord(narrowed)) return undefined;
  if (narrowed.type === "object" && !("properties" in narrowed)) {
    return undefined;
  }
  return narrowed;
}

export function toGeminiTools(
  actions: readonly ActionDefinition[],
): GeminiTool[] {
  const functionDeclarations = actions.map((action) => {
    const parameters = toGeminiSchema(
      withCommandIntent(
        action,
        toToolJsonSchema(action.input, `${action.id}.input`),
      ),
    );
    return {
      name: action.id,
      description: action.description,
      ...(parameters ? { parameters } : {}),
    };
  });
  return [{ functionDeclarations }];
}
