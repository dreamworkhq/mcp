/** Append to the path of an already canonical MCP resource from validated configuration. */
export function openAiMcpResource(resource: string): string {
  const queryAt = resource.indexOf("?");
  const path = queryAt === -1 ? resource : resource.slice(0, queryAt);
  const query = queryAt === -1 ? "" : resource.slice(queryAt);
  return `${path.replace(/\/$/u, "")}/openai${query}`;
}

export function mcpResourceAllowed(resource: string, configuredResource: string): boolean {
  return resource === configuredResource || resource === openAiMcpResource(configuredResource);
}

export const MCP_RESOURCE_HEADER = "x-dreamwork-mcp-resource";

/**
 * Starts the id the hosted MCP server sends as `x-dreamwork-mcp-session` for a
 * guest: one caller, stable across connections. Stdio install ids and user ids
 * are UUIDs, which never start with it. The API records the header as
 * `properties.mcp_session_id` on hosted `mcp_request` events while keeping
 * `distinct_id` on `hosted-guest:<client>`; analytics distinguishes per-caller
 * `hg-` ids from earlier per-connection UUIDs in `mcp_session_id` by this
 * prefix. Hyphen only: the API keeps `[A-Za-z0-9-]` of a session id.
 */
export const HOSTED_GUEST_ID_PREFIX = "hg-";
