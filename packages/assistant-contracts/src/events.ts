/**
 * PostHog event names for the assistant, shared by the API executor and the
 * web dock so one surface cannot invent a second spelling of the other's
 * event. Property contracts are documented on each constant; capture from the
 * browser through `captureClientEvent` and from the API through the usual
 * server-side capture.
 */
export const ASSISTANT_EVENTS = {
  /**
   * API. A turn began. Props: {conversation_id, utterance_id, modality, brain,
   * view, panel}. The envelope's `route` is deliberately absent: it is a
   * resolved path and carries object ids.
   *
   * `utterance_id` is the join key a conversation id cannot be. One
   * conversation holds every turn of a session, so "what did this one request
   * do" was unanswerable off these events; the id is on every server event a
   * single request produces, and it is an id, never the words.
   */
  TURN_STARTED: "assistant_turn_started",
  /**
   * API. A turn finished. Props: {conversation_id, utterance_id, modality,
   * brain, brain_started, escalated, escalation_reason, tool_calls, steps, ms,
   * tokens_in, tokens_out, tokens_cached, say_chars, actions, source}.
   * `modality` is repeated from the start event on purpose: a conversation id
   * names a conversation rather than a turn, so the two events do not join,
   * and latency by modality is the question this event exists to answer.
   *
   * `say_chars` is the LENGTH of what the brain wrote for the person and
   * `actions` the comma-joined ids it called. A spoken turn whose answer never
   * reached the room looks identical to a turn that had nothing to say unless
   * the length is recorded; the text itself is never sent anywhere.
   *
   * `brain` is the model that ANSWERED and `brain_started` the one the turn
   * opened on. They differ when `escalated`, which `escalation_reason` names.
   * That pair is the whole reason the spend is lumpy: the planner costs ten
   * times the dispatcher per token and runs more steps, and labelling an
   * escalated turn with only its finishing brain made the ratio unaskable.
   *
   * `tokens_cached` is the part of `tokens_in` the provider served from its
   * prefix cache, and it is ABSENT rather than zero when no step reported one.
   * Fresh input is `tokens_in - tokens_cached`; the dollars for the same call
   * are in `llm_usage`, which carries the count per call in
   * `context->>'cachedTokens'` and the discount in `cost_micros`.
   */
  TURN_COMPLETED: "assistant_turn_completed",
  /**
   * API. A view action was handed to the attached browser. Props:
   * {action_id, source, conversation_id, utterance_id}.
   *
   * View actions write no ledger row — the ledger records acts against
   * records, and moving a page is not one — so before this event a turn that
   * asked the screen for something left no trace on this side at all: the
   * tokens were spent, the browser was addressed, and the only evidence was a
   * step count with nothing in it. It says the dispatch happened. Whether the
   * browser landed it is the browser's own event.
   */
  VIEW_DISPATCHED: "assistant_view_dispatched",
  /**
   * API. One action succeeded. Props: {action_id, kind, risk, ms,
   * utterance_id, source}.
   */
  ACTION_COMPLETED: "assistant_action_completed",
  /**
   * API. One action failed. Props: {action_id, code, utterance_id, source}.
   * Alerted on.
   */
  ACTION_FAILED: "assistant_action_failed",
  /**
   * API. One action handed the person the step instead of doing it. Props:
   * {action_id, reason, destination, preserved, utterance_id, source}. It is
   * NOT an alert: a handoff is a request ending correctly. It is worth
   * counting, because a reason that spikes is a place the product is asking
   * people to do something it could do for them.
   */
  ACTION_HANDOFF: "assistant_action_handoff",
  /**
   * API. The ladder withheld a consequential action. Props: {action_id,
   * missing, utterance_id}.
   */
  CONFIRMATION_REQUESTED: "assistant_confirmation_requested",
  /** API. The held action resumed or was dropped. Props: {action_id, accepted}. */
  CONFIRMATION_ANSWERED: "assistant_confirmation_answered",
  /**
   * API. A spoken session was created. Props: {conversation_id, modality,
   * source}, where `conversation_id` is the ledger row id the minutes will be
   * finalized against. No transcript, no utterance, no caption ever.
   */
  VOICE_SESSION_STARTED: "assistant_voice_session_started",
  /**
   * API. A spoken session ended. Props: {conversation_id, modality, source,
   * seconds, reported_seconds, cost_micros, reason}. `reason` is
   * `session.closed`'s own word for why.
   *
   * `seconds` is the SERVER's billable figure, not the tab's: wall clock on
   * the open ledger row, capped at the session limit. The tab's number rides
   * beside it as `reported_seconds` and decides nothing, which is also true in
   * the ledger. The two disagreed by 31% over the first month, because a tab
   * that never posts a close sends no event at all. `cost_micros` prices the
   * seconds at the per-minute rate in `llm/pricing.ts`.
   */
  VOICE_SESSION_CLOSED: "assistant_voice_session_closed",
  /**
   * Web. The first words of a spoken session came back as a transcript. Props:
   * {ms_to_started, ms_to_channel, ms_to_transcript, resumed}, each measured
   * from the press that opened the door.
   *
   * It exists because a session that connects and never hears anything is,
   * from this server, indistinguishable from one nobody spoke into: no error
   * is logged on either. Three durations and a boolean; no caption, no
   * transcript, no utterance, ever.
   */
  VOICE_FIRST_TRANSCRIPT: "assistant_voice_first_transcript",
  /**
   * Web. The microphone carried speech and no transcript came back before the
   * deadline. Props: {ms_to_started, ms_to_channel, ms_since_speech,
   * session_started, resumed}. The paired negative of the event above, and the
   * one that names a door that opened onto silence.
   */
  VOICE_NO_TRANSCRIPT: "assistant_voice_no_transcript",
  /**
   * Web. One Lumen seat settled on a way to draw itself, once per mount.
   * Props: {mode, reason}. A renderer that falls back is invisible from here —
   * the character simply stops moving — so this is the only place a production
   * still frame can be counted.
   */
  LUMEN_RENDERER: "assistant_lumen_renderer",

  /** Web. The dock opened. Props: {route, trigger}. */
  OPENED: "assistant_opened",
  /** Web. The user sent a turn. Props: {modality, chars, route}. */
  TURN_SENT: "assistant_turn_sent",
  /** Web. A receipt rendered. Props: {action_id, status, has_undo}. */
  RECEIPT_SHOWN: "assistant_receipt_shown",
  /** Web. The undo line was used. Props: {action_id, ms_since_receipt}. */
  UNDO_CLICKED: "assistant_undo_clicked",
  /** Web. The confirmation card rendered. Props: {action_id, missing}. */
  CONFIRMATION_SHOWN: "assistant_confirmation_shown",
  /** Web. The confirmation card was accepted. Props: {action_id}. */
  CONFIRMATION_ACCEPTED: "assistant_confirmation_accepted",
  /** Web. The confirmation card was declined. Props: {action_id}. */
  CONFIRMATION_DECLINED: "assistant_confirmation_declined",

  /**
   * Shared with the materials station, which already emits both. Generation
   * carries {assets}; refinement carries {asset, scope_kind}. The assistant
   * reuses them so a refine started from the dock and one started from the
   * station land in the same funnel.
   */
  ASSET_GENERATED: "asset_generated",
  ASSET_REFINED: "asset_refined",
} as const;

export type AssistantEventName =
  (typeof ASSISTANT_EVENTS)[keyof typeof ASSISTANT_EVENTS];
