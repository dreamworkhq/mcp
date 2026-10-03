import type { ActionDefinition } from "./action.js";
import { applyActions } from "./actions/apply.js";
import { autopilotActions } from "./actions/autopilot.js";
import { digestActions } from "./actions/digest.js";
import { matchesActions } from "./actions/matches.js";
import { materialsActions } from "./actions/materials.js";
import { pipelineActions } from "./actions/pipeline.js";
import { profileActions } from "./actions/profile.js";
import { statusActions } from "./actions/status.js";
import { viewActions as viewActionDefinitions } from "./actions/view.js";

/**
 * Every assistant capability, in one tuple.
 *
 * The tuple is the point: because it is `readonly` and each member keeps its
 * literal types, `ActionId` is a union rather than `string`, and the handler
 * maps the API and the web bind against are exhaustive `Record`s. A capability
 * added here without a handler is a type error in the surface that owes one,
 * which is the only mechanism that keeps three surfaces agreeing about what
 * the assistant can do.
 */
export const ACTIONS = [
  ...matchesActions,
  ...pipelineActions,
  ...materialsActions,
  ...profileActions,
  ...autopilotActions,
  ...statusActions,
  ...digestActions,
  ...applyActions,
  ...viewActionDefinitions,
] as const;

export type Action = (typeof ACTIONS)[number];

/** Stable snake_case identifier of any action; also its MCP tool name. */
export type ActionId = Action["id"];

/** Actions that change records. They execute on the server, never in a tab. */
export type DataAction = Extract<Action, { kind: "data" }>;
export type DataActionId = DataAction["id"];

/** Actions that change what is on screen. They execute only in the browser. */
export type ViewAction = Extract<Action, { kind: "view" }>;
export type ViewActionId = ViewAction["id"];

export const dataActions: readonly ActionDefinition[] = ACTIONS.filter(
  (action) => action.kind === "data",
);

export const viewActions: readonly ActionDefinition[] = ACTIONS.filter(
  (action) => action.kind === "view",
);

/**
 * The acts a person cannot take back, as a literal.
 *
 * It exists to be COMPARED against the set derived from `ACTIONS`
 * (`test/registry.test.ts`), because two consumers outside TypeScript's reach
 * restate it and would otherwise drift silently: the live eval
 * (`scripts/assistant-live-eval.mjs`, which refuses to let one of these
 * complete in a hold case) and the Slack-routed `Assistant: consequential
 * actions are failing` alert, whose PostHog filter names the same four
 * (`docs/runbooks/assistant.md`). Adding a fifth consequential action fails
 * that assertion, and its message names both.
 */
export const CONSEQUENTIAL_ACTION_IDS = [
  "apply",
  "reply_to_recruiter",
  "set_autopilot",
  "start_checkout",
  "update_autopilot_settings",
] as const;

const BY_ID: ReadonlyMap<string, ActionDefinition> = new Map(
  ACTIONS.map((action) => [action.id, action]),
);

/**
 * Look one up by an id that came from a model, so the caller handles the
 * unknown-tool case instead of indexing into a record with a string.
 */
export function actionById(id: string): ActionDefinition | undefined {
  return BY_ID.get(id);
}

export function isActionId(id: string): id is ActionId {
  return BY_ID.has(id);
}
