import type { ActionDefinition } from "../action.js";

/**
 * One row of the public agent-docs capability table. Deliberately flat and
 * free of Zod: the docs page renders it and nothing compiles against the
 * schemas through here.
 */
export interface DocsCatalogRow {
  id: string;
  title: string;
  description: string;
  kind: "data" | "view";
  risk: "read" | "cheap" | "async" | "consequential";
  /** Whether an MCP client can call it. View actions never can. */
  mcpExposed: boolean;
}

/** Sorted by id so the rendered table's order is a property of the data. */
export function toDocsCatalog(
  actions: readonly ActionDefinition[],
): DocsCatalogRow[] {
  return actions
    .map((action) => ({
      id: action.id,
      title: action.title,
      description: action.description,
      kind: action.kind,
      risk: action.risk,
      mcpExposed: action.mcp.expose,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
