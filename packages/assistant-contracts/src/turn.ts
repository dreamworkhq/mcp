import { z } from "zod";
import type { Anchor } from "./action.js";
import type { DiffSummary } from "./actions/materials.js";
import { contextEnvelopeSchema } from "./envelope.js";
import type { Receipt } from "./receipt.js";
import type { ViewActionId } from "./registry.js";

/**
 * One turn of the conversation, posted to `POST /assistant/turns`.
 *
 * The envelope travels with the utterance rather than being held server-side,
 * and the utterance names the `envelopeId` that was current when it was spoken
 * or typed, so an action resolves against the screen the user was actually
 * looking at. Transcripts are not stored server-side in v1: the browser keeps
 * them and replays the last forty turns as `history`.
 */
export const turnRequestSchema = z.object({
  /** Client-generated uuid, stable for the life of one conversation. */
  conversationId: z.string(),
  utterance: z.object({
    id: z.string(),
    text: z.string().max(4_000),
    modality: z.enum(["text", "voice"]),
    envelopeId: z.string(),
    /** GPT-Live client delegation id; voice only. */
    delegationId: z.string().nullable(),
  }),
  envelope: contextEnvelopeSchema,
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string(),
      }),
    )
    .max(40),
  /**
   * Carries a held consequential action back after the user answered its
   * confirmation. The token is bound to the user, action, object, and
   * revision it was issued for and expires in two minutes.
   */
  pendingConfirmation: z
    .object({
      actionId: z.string(),
      token: z.string(),
      accepted: z.boolean(),
    })
    .nullable(),
  /**
   * The second half of a turn that yielded to the browser.
   *
   * A view action asks a screen to change and the server cannot see whether it
   * did. The turn therefore ENDS after dispatching one, and the `done` event
   * carries a `continuation` naming the call. The browser runs the view, waits
   * for it to settle, captures a fresh envelope, and posts this — the same
   * ids, plus what actually happened — and the loop resumes from there with
   * the answer in hand instead of narrating a screen nobody looked at.
   *
   * NOTHING SERVER-SIDE IS PERSISTED, and that is the design rather than a
   * shortcut. Transcripts are client-held already, so the messages are rebuilt
   * from what the client sends; there is no row to route to a replica and no
   * state to expire. A forged or replayed continuation can only change what
   * the model SAYS: a view action writes nothing, and any data action a
   * continued turn goes on to call runs through the executor and the
   * authorization ladder exactly as it would in a first turn.
   */
  continuation: z
    .object({
      /** Issued with the `done` event. The client dedupes on it. */
      commandId: z.string(),
      /** The brain's own tool-call id, so the resumed messages match. */
      callId: z.string(),
      toolName: z.string(),
      toolArgs: z.unknown(),
      /**
       * What the brain said in the same step as the view call, echoed back.
       *
       * The resumed conversation has to contain the assistant's own words, or
       * the model reads a tool result answering a call it never made. It comes
       * from the `done` event rather than from the server's memory, so it is
       * client-held like the rest of the transcript — and like the rest of the
       * transcript, forging it changes only what the model believes it said.
       */
      sayText: z.string().max(4_000).optional(),
      /**
       * Loop steps the first half spent. The pair shares one step budget, so
       * a turn that yields three times is bounded like any other; the server
       * clamps this to its own maximum, because a client that sends zero must
       * not be able to buy itself a fresh budget.
       */
      stepsUsed: z.int().min(0),
      /** What the browser actually did. `done: false` names why not. */
      outcome: z.object({
        done: z.boolean(),
        note: z.string().max(200).optional(),
        /**
         * The browser already told the person the view landed, in the moment
         * it settled and before this leg was posted. The model is then owed
         * nothing but the rest of the request: a second "it is open" is the
         * same fact said twice, a beat late.
         */
        told: z.boolean().optional(),
        /**
         * What ended up on screen, when it is not what was asked for: the row
         * that opened, the document that was selected, the group that was
         * revealed. The model needs the difference to say it.
         */
        actual: z
          .object({
            matchId: z.string().optional(),
            doc: z.string().max(40).optional(),
            section: z.string().max(40).optional(),
            /** The recruiter thread whose transcript ended up open. */
            threadId: z.string().optional(),
          })
          .optional(),
      }),
    })
    // Optional on the wire, so a first turn simply omits it. Every turn that
    // is not a continuation carries null after parsing.
    .nullish()
    .default(null),
});

export type TurnRequest = z.infer<typeof turnRequestSchema>;

/** One choice offered by a `needs_input` event. */
export interface Option {
  id: string;
  label: string;
  detail?: string;
}

/**
 * What the turn streams back, one JSON object per `data:` line of a
 * `text/event-stream`. Voice mode forwards `say` as
 * `session.commentary.append` and `thinking` as `session.thinking.append`,
 * both tagged with the utterance's `delegationId`; text mode renders them.
 *
 * `view` events are the only ones the browser executes. UI motion is driven by
 * these events and nothing else — there are no speculative clicks.
 */
export type TurnEvent =
  | { type: "thinking"; text: string }
  | { type: "say"; text: string; final: boolean }
  | {
      type: "action.started";
      taskId: string;
      actionId: string;
      anchor?: Anchor;
      args: unknown;
    }
  | {
      type: "edit.proposed";
      taskId: string;
      asset: "resume" | "cover_letter";
      diff: DiffSummary;
    }
  | {
      type: "action.completed";
      taskId: string;
      receipt: Receipt;
      invalidates: string[];
    }
  /**
   * The action stopped short and the person was handed the step.
   *
   * Deliberately NOT an `action.failed`: nothing broke, and a dock that drew
   * a red row here would tell somebody their request had gone wrong when it
   * had gone as far as the assistant is allowed to take it. Deliberately not
   * an `action.completed` either. It carries a receipt like a completion does,
   * because a handoff IS a thing that happened to a request and belongs in the
   * record; the receipt's status is `handoff` and its `handoff` field holds
   * the destination, the remaining sentence, and whether a draft was kept.
   */
  | {
      type: "action.handoff";
      taskId: string;
      receipt: Receipt;
      /**
       * The navigation the browser was asked to run, when it was asked. Absent
       * when a pending draft kept the person where they were — the destination
       * is still named on the receipt so they can go when they are ready.
       */
      view?: { actionId: ViewActionId; args: unknown };
    }
  | {
      type: "action.failed";
      taskId: string;
      code: string;
      message: string;
      /**
       * A sentence for the PERSON, rendered verbatim by the dock. It names
       * what they can do, in their own vocabulary, and never a tool id: the
       * model's half of the same advice travels as `modelHint` on the tool
       * result and never reaches a turn event.
       */
      nextStep?: string;
    }
  | { type: "view"; actionId: ViewActionId; args: unknown }
  | {
      type: "needs_input";
      kind: "disambiguate" | "confirm" | "missing_fact";
      prompt: string;
      options?: Option[];
      confirmation?: { actionId: string; token: string; summary: string };
    }
  /**
   * The turn itself failed, as opposed to one action inside it: the brain was
   * unreachable, the step budget ran out, the deadline passed. It carries no
   * task id because no task exists — which is exactly why it cannot be an
   * `action.failed`. Every `action.failed` names a real call.
   */
  | {
      type: "error";
      code: string;
      message: string;
      /** For the person, and rendered verbatim. See `action.failed`. */
      nextStep?: string;
    }
  | {
      type: "done";
      usage: {
        brain: string;
        tokensIn: number;
        tokensOut: number;
        /**
         * The share of `tokensIn` the provider served from its prefix cache.
         * Absent when no step reported one, which is a different fact from a
         * cache that missed and is what the discount is computed from.
         */
        tokensCached?: number;
        ms: number;
      };
      /**
       * Present when the turn yielded to the browser rather than finishing.
       *
       * The browser runs the view, waits for it to settle, and posts a new
       * turn carrying `continuation` with the same `commandId` and `callId`
       * plus the outcome. `sayText` is what the brain said in the same step,
       * handed back so the resumed conversation contains its own words rather
       * than a gap where they were.
       */
      continuation?: {
        commandId: string;
        callId: string;
        toolName: ViewActionId;
        toolArgs: unknown;
        sayText: string;
        stepsUsed: number;
      };
    };

/**
 * Failure vocabulary on the turn stream. Each names a distinct cause with a
 * distinct remedy, so the dock can say what to do next instead of apologizing.
 */
export const TURN_ERROR_CODES = [
  "assistant_disabled",
  "assistant_rollout_admin_only",
  "brain_unavailable",
  "action_unknown",
  "action_invalid_args",
  "action_not_authorized",
  /** A revision fence rejected the write (409). */
  "action_conflict",
  /** The plan does not allow it (402). */
  "action_paywalled",
  /** Onboarding is incomplete (409). */
  "action_gated",
  /** A scoped edit changed text outside its scope; nothing was saved. */
  "scope_guard_failed",
  /** Today's spoken minutes are gone (`ASSISTANT_VOICE_DAILY_MINUTES_FREE`). */
  "voice_budget_exhausted",
  /**
   * Today's turns are gone (`ASSISTANT_DAILY_TURN_CAP`). Distinct from
   * `step_limit`, which bounds one turn: this one bounds the day, and the
   * remedy is tomorrow rather than a shorter question.
   */
  "turn_budget_exhausted",
  /** The tool loop hit `ASSISTANT_MAX_STEPS`. */
  "step_limit",
  /** The turn passed `ASSISTANT_TURN_TIMEOUT_MS` and was abandoned. */
  "turn_timeout",
] as const;

export type TurnErrorCode = (typeof TURN_ERROR_CODES)[number];
