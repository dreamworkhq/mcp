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
