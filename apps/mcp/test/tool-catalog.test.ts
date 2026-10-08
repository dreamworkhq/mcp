import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { dataActions, toMcpToolDefinitions } from "@jobless/assistant-contracts";
import { ApiClient } from "../src/client.js";
import { createMcpServer } from "../src/mcp.js";
import { REPO_ROOT, renderAll } from "../scripts/tool-docs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");
const repoRoot = resolve(pkgRoot, "..", "..");

/**
 * Every tool that is NOT generated from the assistant registry.
 *
 * The registry half of the catalog is derived, so it cannot be pinned here
 * without restating it — adding an action to `packages/assistant-contracts`
 * adds its tool, and that is the point. This list is the remainder: the guest
 * tools and the product routes no registry action covers yet.
 *
 * The three application-material tools are here for a different reason. Their
 * registry twins carry the same names and deliberately LESS — no document
 * bodies on the read, no free-text writes on the update — so those twins are
 * `mcp.expose: false` and these keep the capability for an agent whose caller
 * is a person reading and editing their own documents.
 */
const HAND_WRITTEN_TOOLS = [
  "add_contact",
  "add_jobs",
  "browse_listings",
  "generate_outreach",
  "generate_resume",
  "get_application_materials",
  "get_generated_resumes",
  "get_listing",
  "get_platform_context",
  "get_profile",
  "get_stats",
  "get_upgrade_link",
  "list_contacts",
  "list_interviews",
  "reopen_application_materials",
  "update_application_materials",
  "update_profile",
  "upload_resume",
];

const EXPECTED_TOOLS = [
  ...toMcpToolDefinitions(dataActions).map((definition) => definition.name),
  ...HAND_WRITTEN_TOOLS,
].sort();

async function listRegisteredTools() {
  const api = new ApiClient("https://api.example.test", "");
  const server = createMcpServer(api);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "catalog-test", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  const { tools } = await client.listTools();
  await client.close();
  await server.close();
  return tools;
}

test("registered tool catalog is the registry's exposed actions plus the hand-written set", async () => {
  const tools = await listRegisteredTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), EXPECTED_TOOLS);
});

test("every tool declares a title, description, and deliberate annotations", async () => {
  const tools = await listRegisteredTools();
  for (const tool of tools) {
    assert.ok(tool.title && tool.title.length > 0, `${tool.name}: no title`);
    assert.ok(
      tool.description && tool.description.length > 0,
      `${tool.name}: no description`,
    );
    assert.ok(tool.annotations, `${tool.name}: no annotations`);
    assert.equal(
      tool.annotations.destructiveHint,
      !tool.annotations.readOnlyHint,
      `${tool.name}: mutations require explicit permission`,
    );
    assert.equal(
      tool.annotations.title,
      tool.title,
      `${tool.name}: annotation title must name the tool`,
    );
    assert.equal(
      typeof tool.annotations?.readOnlyHint,
      "boolean",
      `${tool.name}: readOnlyHint must be explicitly declared`,
    );
    assert.equal(
      typeof tool.annotations?.openWorldHint,
      "boolean",
      `${tool.name}: openWorldHint must be explicitly declared`,
    );
    assert.equal(
      tool.inputSchema.type,
      "object",
      `${tool.name}: input schema must be an object schema`,
    );
  }
});

test("read-only tools never carry a destructive hint", async () => {
  const tools = await listRegisteredTools();
  for (const tool of tools) {
    if (tool.annotations?.readOnlyHint) {
      assert.notEqual(
        tool.annotations?.destructiveHint,
        true,
        `${tool.name}: readOnlyHint and destructiveHint conflict`,
      );
    }
  }
});

test("get_platform_context declares an output schema (structured content contract)", async () => {
  const tools = await listRegisteredTools();
  const tool = tools.find((t) => t.name === "get_platform_context");
  assert.ok(tool?.outputSchema, "expected an outputSchema on the tools/list entry");
  assert.equal(tool?.outputSchema?.type, "object");
});

/**
 * The hand-written API-backed tools whose responses are covered by a canonical
 * wire contract in `@jobless/api-contracts`. Each must advertise the contract
 * as an `outputSchema` so agents get a typed result, not just serialized text.
 * Widening this list means a new runtime-validated operation. Registry tools
 * carry their own output contract and are checked below.
 */
const STRUCTURED_API_TOOLS = [
  "get_application_materials",
  "update_application_materials",
  "reopen_application_materials",
  "get_profile",
  "get_stats",
  "browse_listings",
];

test("contract-covered API tools declare an output schema", async () => {
  const tools = await listRegisteredTools();
  for (const name of STRUCTURED_API_TOOLS) {
    const tool = tools.find((t) => t.name === name);
    assert.ok(tool, `${name}: not registered`);
    assert.ok(tool?.outputSchema, `${name}: expected an outputSchema`);
    assert.equal(
      tool?.outputSchema?.type,
      "object",
      `${name}: output schema must be an object schema`,
    );
  }
});

test("every structured API tool is in the reviewed catalog", () => {
  for (const name of STRUCTURED_API_TOOLS) {
    assert.ok(
      EXPECTED_TOOLS.includes(name),
      `${name}: structured tools must also be reviewed catalog entries`,
    );
  }
});

/**
 * A registry action that can be HELD answers with a confirmation request:
 * status `held`, no output, and `isError` unset. The SDK requires
 * `structuredContent` from every tool advertising an `outputSchema` unless the
 * result is an error, so advertising one on a holdable tool would turn every
 * confirmation into a protocol failure.
 */
test("a holdable registry tool advertises no output schema and takes a confirmation token", async () => {
  const tools = await listRegisteredTools();
  for (const definition of toMcpToolDefinitions(dataActions)) {
    const action = dataActions.find((entry) => entry.id === definition.name);
    if (action?.authorization.mode !== "command") continue;
    const tool = tools.find((t) => t.name === definition.name);
    assert.ok(tool, `${definition.name}: not registered`);
    assert.equal(
      tool?.outputSchema,
      undefined,
      `${definition.name}: a holdable tool must not advertise an output schema`,
    );
    assert.ok(
      (tool?.inputSchema.properties as Record<string, unknown> | undefined)
        ?.confirmationToken,
      `${definition.name}: a holdable tool must accept a confirmationToken`,
    );
  }
});

// ── Documented-catalog drift checks ─────────────────────────────────────

/**
 * The README's catalog is the generated block and nothing else. Scanning the
 * whole `## Tools` section instead would read the prose around it, where
 * `read`, `write`, and `apply` name scopes rather than tools.
 */
function toolNamesFromReadme(): string[] {
  const readme = readFileSync(resolve(pkgRoot, "README.md"), "utf8");
  const block = readme
    .split("<!-- generated:mcp-tools:start -->")[1]
    ?.split("<!-- generated:mcp-tools:end -->")[0];
  assert.ok(block, "README.md must have a generated tool-catalog block");
  const names = new Set<string>();
  for (const match of block.matchAll(/`([a-z0-9_]+)`/g)) names.add(match[1]);
  return [...names].sort();
}

function toolNamesFromMcpToolsDoc(): string[] {
  const doc = readFileSync(resolve(repoRoot, "docs", "MCP_TOOLS.md"), "utf8");
  const names = new Set<string>();
  // Tool names sit in the first column of the reference tables.
  for (const match of doc.matchAll(/^\|\s*`([a-z0-9_]+)`\s*\|/gm)) {
    names.add(match[1]);
  }
  return [...names].sort();
}

test("apps/mcp/README.md tool catalog matches the registered catalog", () => {
  assert.deepEqual(toolNamesFromReadme(), EXPECTED_TOOLS);
});

test("docs/MCP_TOOLS.md tool catalog matches the registered catalog", () => {
  assert.deepEqual(toolNamesFromMcpToolsDoc(), EXPECTED_TOOLS);
});

test("the generated documentation blocks are the ones checked in", async () => {
  for (const { path, contents } of await renderAll()) {
    const name = relative(REPO_ROOT, path).replaceAll("\\", "/");
    // A CRLF checkout (core.autocrlf=true) reads back with \r\n while the
    // rendered block is joined with \n, so the comparison is
    // newline-insensitive; on LF checkouts (and CI) it is the identity and
    // still catches every content drift.
    assert.equal(
      readFileSync(path, "utf-8").replaceAll("\r\n", "\n"),
      contents.replaceAll("\r\n", "\n"),
      `${name} is stale. Run \`pnpm --filter @dreamworkhq/mcp docs\`.`,
    );
  }
});
