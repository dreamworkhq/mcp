import { z } from "zod";
import type { ActionDefinition } from "../action.js";
import { withCommandIntent } from "./intent.js";

export type JsonSchemaObject = Record<string, unknown>;

export class ToolGenerationError extends Error {}

/**
 * Convert one action schema to JSON Schema for a model provider.
 *
 * `io: "input"` so defaults and coercions are described as the model must send
 * them, not as they come back parsed. Unrepresentable constructs throw with
 * the action's id attached rather than silently emitting a schema that accepts
 * anything — a tool a model cannot call correctly is worse than a missing one.
 */
export function toToolJsonSchema(
  schema: z.ZodType,
  context: string,
): JsonSchemaObject {
  let converted: JsonSchemaObject;
  try {
    converted = z.toJSONSchema(schema, {
      target: "draft-2020-12",
      io: "input",
      unrepresentable: "throw",
      cycles: "throw",
      reused: "inline",
    }) as JsonSchemaObject;
  } catch (err) {
    throw new ToolGenerationError(
      `[${context}] schema is not representable: ${(err as Error).message}`,
    );
  }
  const { $schema: _dialect, $id: _id, ...rest } = converted;
  return rest;
}

/** A function tool entry for the OpenAI Responses API `tools` array. */
export interface OpenAiTool {
  type: "function";
  name: string;
  description: string;
  parameters: JsonSchemaObject;
  /**
   * Structured Outputs' strict mode requires every property to be required and
   * `additionalProperties: false` throughout. Actions have genuinely optional
   * arguments, so strict is off and the executor validates with the Zod schema
   * the tool was generated from — the same check, one layer later.
   */
  strict: false;
}

export function toOpenAiTools(
  actions: readonly ActionDefinition[],
): OpenAiTool[] {
  return actions.map((action) => ({
    type: "function",
    name: action.id,
    description: action.description,
    parameters: withCommandIntent(
      action,
      toToolJsonSchema(action.input, `${action.id}.input`),
    ),
    strict: false,
  }));
}
