/**
 * @jobless/assistant-contracts — the one registry of assistant capabilities.
 *
 * Every action the on-site assistant, the MCP server, and the agent docs offer
 * is defined here once. The definitions carry their own Zod input and output
 * schemas, their authorization requirements, and their MCP behaviour hints;
 * the generators under `src/generate/` turn them into provider tool lists. No
 * hand-written tool definition lives anywhere else.
 *
 * The package holds contracts, not behaviour: it imports nothing from `apps/*`
 * and contains no handlers, no engine calls, and no database access. Handlers
 * are bound in the API against `Record<DataActionId, Handler>` and in the web
 * against `Record<ViewActionId, ViewHandler>`, both exhaustive, so a
 * capability added here without a handler fails to compile.
 */

export type {
  Anchor,
  ActionAuthorization,
  ActionDefinition,
  ActionKind,
  ActionMcpExposed,
  ActionMcpExposure,
  ActionMcpHidden,
  ActionRisk,
  InvalidationKey,
  McpHiddenReason,
} from "./action.js";
export {
  INVALIDATION_KEYS,
  MCP_HIDDEN_REASONS,
  defineAction,
} from "./action.js";

export { ASSISTANT_EVENTS, type AssistantEventName } from "./events.js";
export { openAiMcpResource, mcpResourceAllowed, MCP_RESOURCE_HEADER } from "./mcp-resources.js";

export {
  contextEnvelopeSchema,
  type ContextEnvelope,
} from "./envelope.js";
export {
  RESOLVABLE_FILTER_KEYS,
  resolveFilterArguments,
  resolveFilterValue,
  type FilterArgumentResolution,
  type FilterDimension,
  type FilterValueMatch,
  type ResolvableFilterKey,
} from "./filterVocabulary.js";
export {
  openDestinationSchema,
  openParamsSchema,
  type OpenDestination,
} from "./destinations.js";
export {
  HANDOFF_REASONS,
  handoffReasonSchema,
  handoffSchema,
  type Handoff,
  type HandoffReason,
} from "./handoff.js";
export {
  JOB_FUNCTIONS,
  canonicalJobFunction,
  type JobFunction,
} from "./jobFunctions.js";
export {
  LISTING_INDUSTRIES,
  MATCH_SENIORITIES,
  WORK_SETTINGS,
  canonicalListingIndustry,
  canonicalMatchSeniority,
  type ListingIndustry,
  type MatchSeniority,
  type WorkSetting,
} from "./listingFilters.js";
export { receiptSchema, type Receipt } from "./receipt.js";
export {
  TURN_ERROR_CODES,
  turnRequestSchema,
  type Option,
  type TurnErrorCode,
  type TurnEvent,
  type TurnRequest,
} from "./turn.js";

export {
  ACTIONS,
  CONSEQUENTIAL_ACTION_IDS,
  actionById,
  dataActions,
  isActionId,
  viewActions,
  type Action,
  type ActionId,
  type DataAction,
  type DataActionId,
  type ViewAction,
  type ViewActionId,
} from "./registry.js";

export { pipelineStatusSchema } from "./actions/pipeline.js";
export {
  diffSummarySchema,
  editScopeSchema,
  packAssetSchema,
  type DiffSummary,
  type EditScope,
} from "./actions/materials.js";
export { autopilotStateSchema } from "./actions/autopilot.js";
export { DEFAULT_MATCH_OVERLAP_HOURS } from "./actions/digest.js";
export { applicationTruthSchema } from "./actions/status.js";
export { setFiltersInput } from "./actions/view.js";
export {
  MATCH_FILTER_COST,
  matchFilterRebuildKeys,
  type MatchFilterCost,
} from "./matchFilterCost.js";

export {
  ToolGenerationError,
  toOpenAiTools,
  toToolJsonSchema,
  type JsonSchemaObject,
  type OpenAiTool,
} from "./generate/openai.js";
export { toAnthropicTools, type AnthropicTool } from "./generate/anthropic.js";
export {
  toGeminiSchema,
  toGeminiTools,
  type GeminiFunctionDeclaration,
  type GeminiTool,
} from "./generate/gemini.js";
export {
  COMMAND_INTENT_PROPERTY,
  withCommandIntent,
} from "./generate/intent.js";
export {
  toMcpToolDefinitions,
  type McpToolDefinition,
} from "./generate/mcp.js";
export { toDocsCatalog, type DocsCatalogRow } from "./generate/docs.js";
export {
  toCapabilityMap,
  type CapabilityMap,
  type CapabilityMapRow,
  type WithheldCapabilityRow,
} from "./generate/capabilityMap.js";
