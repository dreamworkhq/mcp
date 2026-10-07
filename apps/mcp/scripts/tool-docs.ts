/**
 * The documented tool catalog, rendered from the server itself.
 *
 * Three surfaces described the tools by hand and drifted: the package README,
 * `docs/MCP_TOOLS.md`, and the public agent-docs page. They are generated from
 * one place now: a live `tools/list` against the in-memory server, which is
 * the same catalog an MCP client sees, plus the registry for the risk class
 * behind each action.
 *
 * `scripts/generate-tool-docs.ts` writes the blocks; `test/tool-catalog.test.ts`
 * re-renders them and fails on any difference, so the checked-in docs cannot
 * fall behind the code.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  ACTIONS,
  dataActions,
  toCapabilityMap,
  toDocsCatalog,
  toMcpToolDefinitions,
  type ActionAuthorization,
  type ActionRisk,
  type CapabilityMapRow,
  type WithheldCapabilityRow,
} from "@jobless/assistant-contracts";

import { ApiClient } from "../src/client.js";
import { createMcpServer } from "../src/mcp.js";

const here = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = resolve(here, "..");
export const REPO_ROOT = resolve(PACKAGE_ROOT, "..", "..");

export const README_PATH = resolve(PACKAGE_ROOT, "README.md");
export const MCP_TOOLS_DOC_PATH = resolve(REPO_ROOT, "docs", "MCP_TOOLS.md");
export const CAPABILITY_MAP_PATH = resolve(
  REPO_ROOT,
  "docs",
  "CAPABILITY_MAP.md",
);
export const DOCS_DATA_PATH = resolve(
  REPO_ROOT,
  "apps",
  "web",
  "src",
  "app",
  "agents",
  "docs",
  "docsData.ts",
);

const MARKDOWN_START = "<!-- generated:mcp-tools:start -->";
const MARKDOWN_END = "<!-- generated:mcp-tools:end -->";
const CAPABILITY_MAP_START = "<!-- generated:capability-map:start -->";
const CAPABILITY_MAP_END = "<!-- generated:capability-map:end -->";
const TYPESCRIPT_START = "// generated:mcp-tools:start";
const TYPESCRIPT_END = "// generated:mcp-tools:end";

/**
 * The route each hand-written tool calls, for the agent-docs table.
 *
 * Registry actions need no entry: every one of them is
 * `POST /assistant/actions/<id>`. This map covers what is left, and rendering
 * throws when a hand-written tool is missing from it, so a new one cannot ship
 * undocumented.
 */
const HAND_WRITTEN_ROUTES: Record<string, string> = {
  add_contact: "POST /contacts",
  add_jobs: "POST /jobs",
  browse_listings: "GET /listings",
  generate_outreach: "POST /outreach/generate",
  generate_resume: "POST /applications/:id/resume",
  get_application_materials: "GET /applications/:id/pack",
  get_communication_preferences: "GET /users/me/communication-preferences",
  get_generated_resumes: "GET /applications/:id/resumes",
  get_listing: "GET /listings/:id",
  get_platform_context: "MCP context",
  get_profile: "GET /profile",
  get_stats: "GET /stats",
  get_upgrade_link: "GET /public/billing/upgrade-link",
  list_contacts: "GET /contacts",
  list_escalations: "GET /escalations",
  list_interviews: "GET /interviews",
  reopen_application_materials: "POST /applications/:id/materials/reopen",
  resolve_escalation: "POST /escalations/:id/resolve",
  update_application_materials: "PATCH /applications/:id/materials",
  update_communication_preferences: "PATCH /users/me/communication-preferences",
  update_profile: "PUT /profile",
  upload_resume: "POST /profile/resume",
};

export interface CatalogEntry {
  name: string;
  title: string;
  description: string;
  /** Present only for a tool generated from a registry action. */
  risk: ActionRisk | null;
  requiresAuth: boolean;
  calls: string;
}

interface ListedTool {
  name: string;
  title?: string;
  description?: string;
  annotations?: { readOnlyHint?: boolean };
}

/** Boot the server in memory and ask it what it offers, as a client would. */
async function listRegisteredTools(): Promise<ListedTool[]> {
  const api = new ApiClient("https://api.example.test", "");
  const server = createMcpServer(api);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "tool-docs", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  const { tools } = await client.listTools();
  await client.close();
  await server.close();
  return tools as ListedTool[];
}

/** The tools `src/mcp.ts` registers with `requiresAuth: false`. */
const GUEST_TOOLS = new Set([
  "get_platform_context",
  "browse_listings",
  "get_listing",
  "get_upgrade_link",
]);

/**
 * One sentence a person can read in a table cell. The registry's descriptions
 * are written for a model (preconditions, results, and what not to do), so the
 * opening sentence is the summary and the rest is the brief.
 */
function firstSentence(description: string): string {
  const flattened = description.replace(/\s+/g, " ").trim();
  const end = flattened.search(/\.(\s|$)/);
  const sentence = end === -1 ? flattened : flattened.slice(0, end + 1);
  return sentence.replace(/\|/g, "\\|");
}

export async function buildCatalog(): Promise<CatalogEntry[]> {
  const listed = await listRegisteredTools();
  const registryRisk = new Map(
    toDocsCatalog(dataActions).map((row) => [row.id, row.risk]),
  );
  const generated = new Set(
    toMcpToolDefinitions(dataActions).map((definition) => definition.name),
  );

  return listed
    .map((tool) => {
      const fromRegistry = generated.has(tool.name);
      const calls = fromRegistry
        ? `POST /assistant/actions/${tool.name}`
        : HAND_WRITTEN_ROUTES[tool.name];
      if (!calls) {
        throw new Error(
          `${tool.name} is registered by hand and has no entry in HAND_WRITTEN_ROUTES ` +
            "(apps/mcp/scripts/tool-docs.ts). Add the route it calls.",
        );
      }
      return {
        name: tool.name,
        title: tool.title ?? tool.name,
        description: tool.description ?? "",
        risk: fromRegistry ? (registryRisk.get(tool.name) ?? null) : null,
        requiresAuth: !GUEST_TOOLS.has(tool.name),
        calls,
      };
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

const DO_NOT_EDIT =
  "<!-- Generated by `pnpm --filter @dreamworkhq/mcp docs`. Edit the tool, not this table. -->";

export function renderMcpToolsDoc(entries: readonly CatalogEntry[]): string {
  const registry = entries.filter((entry) => entry.risk !== null);
  const handWritten = entries.filter((entry) => entry.risk === null);

  const lines = [
    MARKDOWN_START,
    DO_NOT_EDIT,
    "",
    "### Assistant actions",
    "",
    "One tool per capability in the assistant registry (`packages/assistant-contracts`), each called through `POST /assistant/actions/<id>`. The same registry drives the on-site assistant, so a tool and a spoken request run identical code: the same argument schema, the same authorization ladder, and one receipt row per act.",
    "",
    "A `consequential` action does not run on the first call. It answers `held` with a summary and a `confirmationToken`; call it again with identical arguments plus that token to carry it out. The token lasts two minutes and is spent once.",
    "",
    "| Tool | Risk | What it does |",
    "|------|------|--------------|",
    ...registry.map(
      (entry) =>
        `| \`${entry.name}\` | ${entry.risk} | ${firstSentence(entry.description)} |`,
    ),
    "",
    "### Additional tools",
    "",
    "Tools that call a product route directly, with no registry action behind them. `get_platform_context`, `browse_listings`, `get_listing`, and `get_upgrade_link` need no key.",
    "",
    "| Tool | Calls | What it does |",
    "|------|-------|--------------|",
    ...handWritten.map(
      (entry) =>
        `| \`${entry.name}\` | \`${entry.calls}\` | ${firstSentence(entry.description)} |`,
    ),
    "",
    MARKDOWN_END,
  ];
  return lines.join("\n");
}

export function renderReadmeTools(entries: readonly CatalogEntry[]): string {
  const registry = entries.filter((entry) => entry.risk !== null);
  const handWritten = entries.filter((entry) => entry.risk === null);
  const guest = handWritten.filter((entry) => !entry.requiresAuth);
  const keyed = handWritten.filter((entry) => entry.requiresAuth);

  const names = (list: readonly CatalogEntry[]) =>
    list.map((entry) => `\`${entry.name}\``).join(", ");

  return [
    MARKDOWN_START,
    DO_NOT_EDIT,
    "",
    "**Public (no key):**",
    "",
    names(guest),
    "",
    "**Assistant actions:** one tool per capability in Dreamwork's assistant registry, each running through the same authorization ladder and receipt ledger the on-site assistant uses. A consequential one holds on its first call, answering with a summary and a confirmationToken; send that token back with identical arguments to go ahead.",
    "",
    names(registry),
    "",
    "**Direct product tools:** routes with no registry action behind them.",
    "",
    names(keyed),
    "",
    MARKDOWN_END,
  ].join("\n");
}

export function renderDocsData(entries: readonly CatalogEntry[]): string {
  const rows = entries.map((entry) =>
    [
      "  {",
      `    name: ${JSON.stringify(entry.name)},`,
      `    purpose: ${JSON.stringify(firstSentence(entry.description).replace(/\\\|/g, "|"))},`,
      `    calls: ${JSON.stringify(entry.calls)},`,
      "  },",
    ].join("\n"),
  );
  return [
    TYPESCRIPT_START,
    "// Generated by `pnpm --filter @dreamworkhq/mcp docs` from the MCP server's",
    "// own tool catalog. Edit the tool, not this array.",
    "export const MCP_TOOLS: McpTool[] = [",
    ...rows,
    "];",
    TYPESCRIPT_END,
  ].join("\n");
}

const CAPABILITY_MAP_DO_NOT_EDIT =
  "<!-- Generated by `pnpm --filter @dreamworkhq/mcp docs` from `packages/assistant-contracts`. Edit the action, not these tables. -->";

/** What the executor demands before it carries the action out, in one cell. */
function authorizationCell(authorization: ActionAuthorization): string {
  if (authorization.mode === "none") return "The key alone";
  if (authorization.mode === "receipt") {
    return authorization.undoWindowMs === undefined
      ? "Receipt"
      : `Receipt, undo for ${Math.round(authorization.undoWindowMs / 1000)}s`;
  }
  return `Confirmation (${authorization.requires.join(", ")})`;
}

function overMcpRow(row: CapabilityMapRow): string {
  const direction = row.writes ? "Writes" : "Reads";
  return `| \`${row.id}\` | ${firstSentence(row.description)} | ${direction} | ${authorizationCell(row.authorization)} |`;
}

function inAppOnlyRow(row: WithheldCapabilityRow): string {
  const why = row.note
    ? `\`${row.reason}\`: ${row.note.replace(/\|/g, "\\|")}`
    : `\`${row.reason}\``;
  return `| \`${row.id}\` | ${firstSentence(row.description)} | ${why} |`;
}

/**
 * The whole registry as two tables, split by whether a person's own agent can
 * reach the capability. Every action appears in exactly one of them.
 */
export function renderCapabilityMap(): string {
  const { overMcp, inAppOnly } = toCapabilityMap(ACTIONS);

  return [
    CAPABILITY_MAP_START,
    CAPABILITY_MAP_DO_NOT_EDIT,
    "",
    "## Over MCP",
    "",
    `${overMcp.length} capabilities any agent holding the person's Dreamwork key can call, each as a tool of the same name in \`@dreamworkhq/mcp\` and as \`POST /assistant/actions/<id>\`. "Authorization" is what the executor demands on top of the key: a receipt is written and can be undone inside the stated window, and a confirmation means the first call answers \`held\` with a summary and a token rather than acting.`,
    "",
    "| Capability | What it does | Reads or writes | Authorization |",
    "|------------|--------------|-----------------|---------------|",
    ...overMcp.map(overMcpRow),
    "",
    "## In our app only",
    "",
    `${inAppOnly.length} capabilities the MCP catalog does not offer. Each declares why in the registry, and the compiler refuses a withheld capability that does not.`,
    "",
    "| Capability | What it does | Why it is not on MCP |",
    "|------------|--------------|----------------------|",
    ...inAppOnly.map(inAppOnlyRow),
    "",
    CAPABILITY_MAP_END,
  ].join("\n");
}

function replaceBlock(
  source: string,
  start: string,
  end: string,
  replacement: string,
  label: string,
): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end);
  if (from === -1 || to === -1 || to < from) {
    throw new Error(
      `${label} has no ${start} … ${end} block for the generated tool catalog.`,
    );
  }
  return source.slice(0, from) + replacement + source.slice(to + end.length);
}

export interface RenderedDocs {
  path: string;
  contents: string;
}

export async function renderAll(): Promise<RenderedDocs[]> {
  const entries = await buildCatalog();
  return [
    {
      path: MCP_TOOLS_DOC_PATH,
      contents: replaceBlock(
        readFileSync(MCP_TOOLS_DOC_PATH, "utf-8"),
        MARKDOWN_START,
        MARKDOWN_END,
        renderMcpToolsDoc(entries),
        "docs/MCP_TOOLS.md",
      ),
    },
    {
      path: README_PATH,
      contents: replaceBlock(
        readFileSync(README_PATH, "utf-8"),
        MARKDOWN_START,
        MARKDOWN_END,
        renderReadmeTools(entries),
        "apps/mcp/README.md",
      ),
    },
    {
      path: CAPABILITY_MAP_PATH,
      contents: replaceBlock(
        readFileSync(CAPABILITY_MAP_PATH, "utf-8"),
        CAPABILITY_MAP_START,
        CAPABILITY_MAP_END,
        renderCapabilityMap(),
        "docs/CAPABILITY_MAP.md",
      ),
    },
    {
      path: DOCS_DATA_PATH,
      contents: replaceBlock(
        readFileSync(DOCS_DATA_PATH, "utf-8"),
        TYPESCRIPT_START,
        TYPESCRIPT_END,
        renderDocsData(entries),
        "apps/web/src/app/agents/docs/docsData.ts",
      ),
    },
  ];
}
