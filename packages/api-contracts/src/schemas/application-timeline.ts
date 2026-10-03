import { z } from "zod";
import { responseComponent, sharedComponent } from "../registry.js";
import { isoDateTime, uuidString } from "./common.js";
import { submissionStatusSchema } from "./pipeline.js";

/**
 * The closed vocabulary of timeline facts. Each member names a row that
 * exists, not an interpretation of one: `submitted` comes from the application
 * status vocabulary, `employer_confirmed` from `employer_confirmed_at`, and
 * the three mail kinds from a user-facing `inbound_emails` classification.
 * Adding a member means naming the row it reads.
 */
export const applicationTimelineEventKindSchema = sharedComponent(
  z.enum([
    "apply_requested",
    "submitted",
    "manual_confirmed",
    "employer_confirmed",
    "ats_confirmation",
    "recruiter_reply",
    "rejection",
    "interview_detected",
    "interview_marked",
    "escalation",
    "failed",
    "cancelled",
  ]),
  {
    id: "ApplicationTimelineEventKind",
    description:
      "What happened. Every member is backed by a stored row or column; none is inferred from another event.",
  },
);

/** Which table the event was read from, so a caller can audit the claim. */
export const applicationTimelineEventSourceSchema = sharedComponent(
  z.enum([
    "application",
    "inbound_email",
    "interview",
    "escalation",
    "pipeline",
  ]),
  {
    id: "ApplicationTimelineEventSource",
    description:
      "The record that produced the event: the applications row, a user-facing inbound email, the interview row, an escalation, or the pipeline projection.",
  },
);

export const applicationTimelineEventSchema = responseComponent(
  z.object({
    at: isoDateTime,
    kind: applicationTimelineEventKindSchema,
    source: applicationTimelineEventSourceSchema,
    /** One sentence of user-facing copy. Never quotes employer prose. */
    summary: z.string(),
    /**
     * Plain-text preview of an employer email, at most 200 characters. Never
     * HTML and never a full body; omitted entirely when there is nothing safe
     * to show.
     */
    detail: z.string().max(200).optional(),
  }),
  {
    id: "ApplicationTimelineEvent",
    description:
      "One dated fact about an application. Events are sorted by `at` ascending.",
  },
);

/**
 * What the read could see. A status answer that omits its coverage invites the
 * reader to treat silence as "nothing happened"; these two fields say how far
 * the inspection reached and which mailboxes it reached into.
 */
export const applicationTimelineCoverageSchema = responseComponent(
  z.object({
    /** The instant this answer was computed; relay mail is current to here. */
    relayInspectedThrough: isoDateTime,
    personalInboxConnected: z.boolean(),
    sources: z.array(z.enum(["relay", "personal_inbox"])),
  }),
  {
    id: "ApplicationTimelineCoverage",
    description:
      "How far the timeline read could see: the instant relay mail was inspected through, and whether a personal inbox is connected.",
  },
);

/**
 * The canonical recovery projection (`deriveApplicationRecoveryState`), the
 * same object `GET /pipeline` carries on each card.
 */
export const applicationRecoveryProjectionSchema = responseComponent(
  z.object({
    state: z.enum([
      "waiting",
      "applying",
      "needs_input",
      "review_required",
      "retry_available",
      "finish_externally",
      "manually_completed",
      "automatically_submitted",
      "terminal_failure",
      "canceled",
      "fallback_in_progress",
    ]),
    actions: z.array(z.string()),
    nonterminal: z.boolean(),
    label: z.string(),
  }),
  {
    id: "ApplicationRecoveryProjection",
    description:
      "PON-3609 recovery state, actions, terminality and label for one application.",
  },
);

/**
 * What the engine entered on the employer's form, for the attempt the
 * outcome ledger proved sent. Each item is one employer question and its
 * final displayed value; `omitted` is `restricted` when the value is
 * withheld by the restricted-data policy (the question is still listed).
 */
export const applicationSubmittedAnswerCaptureSchema = responseComponent(
  z.object({
    attemptId: z.string(),
    capturedAt: isoDateTime,
    coverLetterDelivered: z.boolean().nullable(),
    items: z.array(
      z.object({
        // Stable field identity within the form — the same `id` the
        // ApplicationSubmittedAnswer record uses (the engine's field id).
        id: z.string(),
        order: z.int(),
        label: z.string(),
        kind: z.enum(["text", "choice", "multi_choice", "boolean", "file", "other"]),
        value: z.string().nullable(),
        values: z.array(z.string()).nullable(),
        omitted: z.enum(["restricted"]).nullable(),
      }),
    ),
  }),
  {
    id: "ApplicationSubmittedAnswerCapture",
    description:
      "The screening answers the proven attempt sent: what Dreamwork entered on the employer's form.",
  },
);

export const applicationTimelineResponseSchema = responseComponent(
  z.object({
    applicationId: uuidString,
    jobId: uuidString,
    title: z.string(),
    company: z.string(),
    /**
     * Display status, not the raw column: a `failed` row carrying a
     * user-cancellation marker reads `canceled`, the same remap
     * `deriveDisplaySubmissionStatus` applies on the pipeline board. Reusing
     * `SubmissionStatus` is what keeps the two surfaces from drifting into two
     * spellings of the same state.
     */
    status: submissionStatusSchema,
    /** True only for a status in SUBMITTED_STATUSES. Never inferred from mail. */
    submitted: z.boolean(),
    /** True only when `employer_confirmed_at` is set. Never inferred from status. */
    received: z.boolean(),
    events: z.array(applicationTimelineEventSchema),
    coverage: applicationTimelineCoverageSchema,
    recoveryState: applicationRecoveryProjectionSchema.nullable(),
    /**
     * What the proven attempt entered on the employer's form, so a person
     * can see why a screening decision went the way it did. Null when the
     * application was not submitted, the attempt is unproven, or no
     * capture exists — all honest states, never errors.
     */
    submittedAnswers: applicationSubmittedAnswerCaptureSchema.nullable(),
  }),
  {
    id: "ApplicationTimelineResponse",
    description:
      "`GET /applications/:id/timeline` 200 body: one truthful status read for a single application, with its coverage.",
  },
);
