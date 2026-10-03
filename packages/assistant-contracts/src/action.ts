import type { z } from "zod";
import type { AssistantEventName } from "./events.js";

/**
 * `data` actions change records and execute on the server through the same
 * engine functions and guards the HTTP routes use. `view` actions change what
 * the user sees and execute only in an attached browser session; MCP never
 * receives one.
 */
export type ActionKind = "data" | "view";

/**
 * How much an action can cost the user if the brain is wrong, weakest first.
 * The executor's authorization ladder reads this, not the action's name.
 *
 * - `read`          — returns facts, writes nothing.
 * - `cheap`         — a write the user can undo or repeat without cost.
 * - `async`         — a write that enqueues durable work and settles later.
 * - `consequential` — a write the user cannot take back: it sends something
 *                     on their behalf, spends an allowance, or takes money.
 */
export type ActionRisk = "read" | "cheap" | "async" | "consequential";

/**
 * What the executor requires before it runs the action.
 *
 * - `none`    — run it.
 * - `receipt` — run it and write a receipt row; `undoWindowMs` declares how
 *               long the inverse action stays offered.
 * - `command` — run it only when every named requirement holds; otherwise emit
 *               `needs_input` with a confirmation token and wait for the next
 *               turn to carry `pendingConfirmation.accepted`.
 */
export type ActionAuthorization =
  | { mode: "none" }
  | { mode: "receipt"; undoWindowMs?: number }
  | {
      mode: "command";
      requires: ReadonlyArray<
        "explicit_verb" | "unambiguous_target" | "reviewed_revision"
      >;
    };

/**
 * Where the presence layer points while the action runs. `target` names a
 * `data-dw-anchor` attribute in the web app; the literal `<id>` inside one is
 * replaced with the resolved object id from the action's receipt. `route` is a
 * client route template whose `:params` the browser fills from the same
 * receipt.
 */
export interface Anchor {
  route?: string;
  target: string;
}

/**
 * React Query key prefixes the browser invalidates after the action succeeds.
 * A closed set: an action cannot invalidate a cache the dock does not know how
 * to reach.
 */
export const INVALIDATION_KEYS = [
  "me",
  "matches",
  "shortlist",
  "pipeline",
  "autopilot",
  "application-materials",
  "pack-usage",
  "application-usage",
  "relay-threads",
  "analysis",
] as const;

export type InvalidationKey = (typeof INVALIDATION_KEYS)[number];

/**
 * Why a capability is withheld from MCP.
 *
 * An enum rather than free text, so the withheld set stays comparable: "which
 * capabilities are absent only because there is no screen" is then a question
 * the data answers. A bare `expose: false` records a decision without the
 * ground for it, which a year later is indistinguishable from an oversight.
 *
 * - `needs_attached_browser` — it only means something with a live page and a
 *   person looking at it. Nothing durable changes, so a caller with no screen
 *   would hold a tool that silently does nothing.
 * - `duplicate_of_mcp_tool` — a hand-written tool in `apps/mcp/src/mcp.ts`
 *   carries the capability under the same name. Two tools cannot share a name,
 *   and if they could they would drift.
 * - `internal_step` — it composes other actions and is not a capability a
 *   caller asks for by name.
 * - `unsafe_unattended` — it must not run without a person present to see it.
 *
 * Extend the list only through review: a new value is a new class of reason to
 * keep something out of other people's agents' hands.
 */
export const MCP_HIDDEN_REASONS = [
  "needs_attached_browser",
  "duplicate_of_mcp_tool",
  "internal_step",
  "unsafe_unattended",
] as const;

export type McpHiddenReason = (typeof MCP_HIDDEN_REASONS)[number];

/**
 * Behaviour hints carried into every generated tool definition.
 * `readOnlyHint` and `openWorldHint` are mandatory so each action states them
 * deliberately instead of inheriting a client default, matching the
 * first-party convention in `apps/mcp/src/mcp.ts`.
 */
export interface ActionMcpExposed {
  expose: true;
  /** Factual operation description for external MCP clients, without model instructions. */
  description: string;
  readOnlyHint: boolean;
  openWorldHint: boolean;
  destructiveHint?: boolean;
}

/**
 * A capability the MCP catalog does not offer, and the ground for that.
 *
 * The behaviour hints are absent by construction: no tool is generated, so
 * there is nothing for them to annotate. `note` carries the one line of
 * specifics the enum cannot, and `docs/CAPABILITY_MAP.md` renders both.
 */
export interface ActionMcpHidden {
  expose: false;
  reason: McpHiddenReason;
  note?: string;
}

/**
 * A discriminated union, so the compiler asks for the reason. `expose: false`
 * without one does not type-check, which is what keeps a withheld capability
 * from reaching `main` unexplained.
 */
export type ActionMcpExposure = ActionMcpExposed | ActionMcpHidden;

/**
 * One assistant capability. This definition — not a hand-written tool list —
 * is what the site assistant, the MCP server, and the agent docs are generated
 * from.
 *
 * `input` and `output` are objects because every consumer requires one: MCP
 * tool schemas, OpenAI function parameters, and Anthropic `input_schema` are
 * all JSON Schema objects.
 */
export interface ActionDefinition<
  I extends z.ZodObject = z.ZodObject,
  O extends z.ZodObject = z.ZodObject,
> {
  /** snake_case, stable; also the MCP tool name. Never renamed once published. */
  id: string;
  kind: ActionKind;
  risk: ActionRisk;
  title: string;
  /**
   * Written for a model, not for a changelog: preconditions, what the result
   * contains, and when NOT to use it. This is the entire brief the brain gets
   * about the action, so an omission here is a behaviour bug.
   */
  description: string;
  input: I;
  output: O;
  authorization: ActionAuthorization;
  anchor?: Anchor;
  invalidates: ReadonlyArray<InvalidationKey>;
  event: AssistantEventName;
  mcp: ActionMcpExposure;
}

/**
 * Identity that preserves each definition's literal types, so `ACTIONS` is a
 * tuple whose member `id`s form a union and the API and web handler maps are
 * exhaustive `Record`s the compiler can check.
 */
export function defineAction<const Definition extends ActionDefinition>(
  definition: Definition,
): Definition {
  return definition;
}
