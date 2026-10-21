import type {
  ActionAuthorization,
  ActionDefinition,
  ActionRisk,
  McpHiddenReason,
  OpenAiHiddenReason,
} from "../action.js";

/**
 * One row of the capability map. Flat and free of Zod, like `DocsCatalogRow`:
 * the renderer turns it into a table cell and nothing compiles against the
 * schemas through here.
 */
export interface CapabilityMapRow {
  id: string;
  title: string;
  /** The model-facing brief, verbatim. The renderer takes its first sentence. */
  description: string;
  risk: ActionRisk;
  /** False for a `read` action, true for anything that changes a record. */
  writes: boolean;
  authorization: ActionAuthorization;
}

/** A capability only the web client can carry out, and why. */
export interface WithheldCapabilityRow extends CapabilityMapRow {
  reason: McpHiddenReason;
  note: string | null;
}

/** A capability on MCP that the OpenAI distribution leaves out, and why. */
export interface OpenAiWithheldCapabilityRow extends CapabilityMapRow {
  reason: OpenAiHiddenReason;
  note: string | null;
}

/**
 * The two channels, side by side.
 *
 * `overMcp` is what a person's own agent can call while holding their key;
 * `inAppOnly` is everything else, each entry carrying the declared reason it
 * is not in the first list. Every action in the registry lands in exactly one
 * of them, so the map is a partition rather than a selection.
 * `notOnOpenAi` is the subset of `overMcp` the OpenAI distribution omits.
 */
export interface CapabilityMap {
  overMcp: CapabilityMapRow[];
  inAppOnly: WithheldCapabilityRow[];
  notOnOpenAi: OpenAiWithheldCapabilityRow[];
}

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function base(action: ActionDefinition): CapabilityMapRow {
  return {
    id: action.id,
    title: action.title,
    description: action.description,
    risk: action.risk,
    writes: action.risk !== "read",
    authorization: action.authorization,
  };
}

/** Sorted by id inside each channel, so the rendered order is data, not code. */
export function toCapabilityMap(
  actions: readonly ActionDefinition[],
): CapabilityMap {
  const overMcp: CapabilityMapRow[] = [];
  const inAppOnly: WithheldCapabilityRow[] = [];
  const notOnOpenAi: OpenAiWithheldCapabilityRow[] = [];

  for (const action of actions) {
    if (action.mcp.expose) {
      overMcp.push(base(action));
      if (action.mcp.openai) {
        notOnOpenAi.push({
          ...base(action),
          reason: action.mcp.openai.reason,
          note: action.mcp.openai.note ?? null,
        });
      }
      continue;
    }
    inAppOnly.push({
      ...base(action),
      reason: action.mcp.reason,
      note: action.mcp.note ?? null,
    });
  }

  return {
    overMcp: overMcp.sort(byId),
    inAppOnly: inAppOnly.sort(byId),
    notOnOpenAi: notOnOpenAi.sort(byId),
  };
}
