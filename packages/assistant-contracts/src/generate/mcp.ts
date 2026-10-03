import type { z } from "zod";
import type { ActionDefinition } from "../action.js";

/**
 * A tool definition in the shape `apps/mcp` registers, minus the handler the
 * MCP package binds itself.
 *
 * `readOnlyHint` and `openWorldHint` are required, matching the first-party
 * convention in `apps/mcp/src/mcp.ts`: every tool states its behaviour
 * deliberately instead of inheriting an SDK default.
 */
export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  annotations: {
    readOnlyHint: boolean;
    openWorldHint: boolean;
    destructiveHint?: boolean;
  };
  inputSchema: z.ZodObject;
  outputSchema?: z.ZodObject;
  requiresAuth: boolean;
}

/**
 * Project the registry onto the MCP surface.
 *
 * Only `data` actions with `mcp.expose` come through. A `view` action is
 * dropped because an MCP client has no screen to move, and every data action
 * reads or writes one user's records, so `requiresAuth` is true for all of
 * them — there is no anonymous read in this registry.
 */
export function toMcpToolDefinitions(
  actions: readonly ActionDefinition[],
): McpToolDefinition[] {
  const definitions: McpToolDefinition[] = [];
  // A `for` loop rather than `filter().map()` because the exposure is a
  // discriminated union: only a narrowing branch reaches the behaviour hints,
  // which a withheld action does not carry at all.
  for (const action of actions) {
    if (action.kind !== "data" || !action.mcp.expose) continue;
    definitions.push({
      name: action.id,
      title: action.title,
      description: action.mcp.description,
      annotations: {
        readOnlyHint: action.mcp.readOnlyHint,
        openWorldHint: action.mcp.openWorldHint,
        ...(action.mcp.destructiveHint === undefined
          ? {}
          : { destructiveHint: action.mcp.destructiveHint }),
      },
      inputSchema: action.input,
      outputSchema: action.output,
      requiresAuth: true,
    });
  }
  return definitions;
}
