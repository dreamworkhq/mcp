import type { ActionDefinition } from "../action.js";
import type { JsonSchemaObject } from "./openai.js";

/**
 * The one argument the ladder reads and the action never receives.
 *
 * `explicit_verb` needs both halves: the utterance has to contain an imperative
 * for this action, AND the brain has to say the person meant it as one. Until
 * this shipped the second half was unreachable — `authorize.ts` looks for
 * `intent: "explicit"` on the raw tool call, no generator emitted the property,
 * and no prompt explained it, so every consequential action was held for a
 * confirmation no matter how plainly it had been asked for. Command mode was
 * described in the plan and could not happen.
 *
 * It is added to the TOOL SCHEMA rather than to the action's Zod input on
 * purpose. Intent is a statement about the person, not a parameter of the act:
 * the executor validates against the Zod input, which strips the key, so it
 * never reaches a handler and never enters the arguments digest a confirmation
 * token is bound to. An unchanged request is therefore never re-held because
 * the model changed its mind about the flag.
 *
 * MCP does not get it. `toMcpToolDefinitions` does not call this, so an
 * external agent cannot assert intent on its principal's behalf and every
 * consequential action it asks for is held behind a confirmation token it has
 * to echo back — which is the elicitation shape PR 11 designed for.
 */
export const COMMAND_INTENT_PROPERTY: JsonSchemaObject = {
  type: "string",
  enum: ["explicit"],
  description:
    "Set only when the person named this act and its target in the same breath; omit when they asked a question or gave a hint.",
};

/**
 * Widen one action's parameter schema with `intent`, for a command action.
 *
 * Everything else is returned untouched, so a read or a cheap write never
 * carries a flag that would decide nothing.
 */
export function withCommandIntent(
  action: ActionDefinition,
  parameters: JsonSchemaObject,
): JsonSchemaObject {
  if (action.authorization.mode !== "command") return parameters;
  const properties = parameters.properties;
  return {
    ...parameters,
    type: "object",
    properties: {
      ...(typeof properties === "object" && properties !== null
        ? (properties as Record<string, unknown>)
        : {}),
      intent: COMMAND_INTENT_PROPERTY,
    },
  };
}
