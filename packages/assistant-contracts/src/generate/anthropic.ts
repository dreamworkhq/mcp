import type { ActionDefinition } from "../action.js";
import { withCommandIntent } from "./intent.js";
import { type JsonSchemaObject, toToolJsonSchema } from "./openai.js";

/** A tool entry for the Anthropic Messages API `tools` array. */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: JsonSchemaObject;
}

export function toAnthropicTools(
  actions: readonly ActionDefinition[],
): AnthropicTool[] {
  return actions.map((action) => ({
    name: action.id,
    description: action.description,
    input_schema: withCommandIntent(
      action,
      toToolJsonSchema(action.input, `${action.id}.input`),
    ),
  }));
}
