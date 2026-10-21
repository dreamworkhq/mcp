import type { z } from "zod";
import type { ActionDefinition } from "../action.js";

/**
 * A tool definition in the shape `apps/mcp` registers, minus the handler the
 * MCP package binds itself.
 *
 * Hints match `ActionMcpExposed`: a write states `destructiveHint`, and a
 * read does not inherit the SDK's destructive default.
 */
export type McpToolAnnotations =
  | { readOnlyHint: true; openWorldHint: boolean; destructiveHint?: false }
  | { readOnlyHint: false; openWorldHint: boolean; destructiveHint: boolean };

export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  annotations: McpToolAnnotations;
  inputSchema: z.ZodObject;
  outputSchema?: z.ZodObject;
  requiresAuth: boolean;
}

/** `openai` is the catalog served at `/mcp/openai` for the ChatGPT plugin directory. */
export type McpDistribution = "default" | "openai";

/**
 * Project the registry onto the MCP surface.
 *
 * Only `data` actions with `mcp.expose` come through, and for the OpenAI
 * distribution only those without `mcp.openai`. A `view` action is
 * dropped because an MCP client has no screen to move, and every data action
 * reads or writes one user's records, so `requiresAuth` is true for all of
 * them — there is no anonymous read in this registry.
 */
export function toMcpToolDefinitions(
  actions: readonly ActionDefinition[],
  distribution: McpDistribution = "default",
): McpToolDefinition[] {
  const definitions: McpToolDefinition[] = [];
  // A `for` loop rather than `filter().map()` because the exposure is a
  // discriminated union: only a narrowing branch reaches the behaviour hints,
  // which a withheld action does not carry at all.
  for (const action of actions) {
    if (action.kind !== "data" || !action.mcp.expose) continue;
    if (distribution === "openai" && action.mcp.openai) continue;
    definitions.push({
      name: action.id,
      title: action.title,
      description: action.mcp.description,
      annotations: action.mcp.readOnlyHint
        ? {
            readOnlyHint: true,
            openWorldHint: action.mcp.openWorldHint,
            ...(action.mcp.destructiveHint === undefined
              ? {}
              : { destructiveHint: action.mcp.destructiveHint }),
          }
        : {
            readOnlyHint: false,
            openWorldHint: action.mcp.openWorldHint,
            destructiveHint: action.mcp.destructiveHint,
          },
      inputSchema: action.input,
      outputSchema: action.output,
      requiresAuth: true,
    });
  }
  return definitions;
}
