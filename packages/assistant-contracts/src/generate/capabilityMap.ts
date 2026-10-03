import type {
  ActionAuthorization,
  ActionDefinition,
  ActionRisk,
  McpHiddenReason,
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

/**
 * The two channels, side by side.
 *
 * `overMcp` is what a person's own agent can call while holding their key;
 * `inAppOnly` is everything else, each entry carrying the declared reason it
 * is not in the first list. Every action in the registry lands in exactly one
 * of them, so the map is a partition rather than a selection.
 */
export interface CapabilityMap {
  overMcp: CapabilityMapRow[];
  inAppOnly: WithheldCapabilityRow[];
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

  for (const action of actions) {
    if (action.mcp.expose) {
      overMcp.push(base(action));
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
  };
}
