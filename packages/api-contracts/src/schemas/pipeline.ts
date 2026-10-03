import { z } from "zod";
import { responseComponent, sharedComponent } from "../registry.js";
import { isoDateTime, jobStatusSchema, uuidString } from "./common.js";
import { packAssetsSchema } from "./pack.js";

/** User-facing pipeline (kanban) status derived for each card. */
export const productPipelineStatusSchema = responseComponent(
  z.enum([
    "SAVED",
    "APPLIED",
    "CONFIRMED",
    "INTERVIEWING",
    "OFFER_RECEIVED",
    "ACCEPTED",
    "REJECTED",
    "NO_RESPONSE",
    "WITHDRAWN",
  ]),
  {
    id: "ProductPipelineStatus",
    description:
      "Product pipeline board status derived from job, application, and user-set metadata state.",
  },
);

export const pipelineBenefitsSchema = responseComponent(
  z.object({
    equity: z.boolean().nullable(),
    bonus: z.boolean().nullable(),
    healthcare: z.boolean().nullable(),
  }),
  {
    id: "PipelineBenefits",
    description:
      "Tri-state benefit signals: true/false when known, null when the listing did not say.",
  },
);

/**
 * Display submission status: the worker status enum plus the derived
 * "canceled" value (a failed application carrying a user-cancellation marker).
 */
export const submissionStatusSchema = responseComponent(
  z.union([jobStatusSchema, z.literal("canceled")]),
  {
    id: "SubmissionStatus",
    description:
      "Worker status for display, or \"canceled\" when a failed application was user-canceled.",
  },
);


/** PON-3609: the server-derived recovery state and the actions it permits. */
export const applicationRecoveryActionSchema = sharedComponent(
  z.enum([
    "retry",
    "finish_externally",
    "mark_applied",
    "get_help",
    "cancel",
    "view_details",
  ]),
  {
    id: "ApplicationRecoveryAction",
    description:
      "An action the recovery projection permits. Clients render only these; mutations recheck them against current state.",
  },
);

/**
 * PON-3868: what became of the submission, as one server-derived fact set.
 * Worker lifecycle (`submissionStatus`), employer outcome (`status`) and
 * archive visibility stay separate; this says only whether the application
 * reached the employer, how that is known, and when.
 */
export const applicationSubmissionDispositionSchema = sharedComponent(
  z.enum([
    "in_progress",
    "submitted",
    "user_reported",
    "unknown",
    "unconfirmed",
    "not_submitted",
    "canceled",
  ]),
  {
    id: "ApplicationSubmissionDisposition",
    description:
      "in_progress: queued or running. submitted: canonical proof-backed submission. user_reported: the user marked it applied. unknown: an attempt ran and its result is not yet known; a receipt may still arrive. unconfirmed: the receipt window closed with no confirmation either way; the employer may still have it, so never an automatic resubmit. not_submitted: proven not to have reached the employer. canceled: the user stopped it.",
  },
);

export const applicationSubmissionSummarySchema = responseComponent(
  z.object({
    disposition: applicationSubmissionDispositionSchema,
    /** How a submitted disposition is known. Null unless submitted. */
    proof: z
      .enum([
        "browser",
        "employer_email",
        "ats_receipt",
        "vendor_receipt",
        "portal",
        "operator",
        "legacy",
      ])
      .nullable(),
    /** The canonical submission instant, when one is recorded. */
    submittedAt: isoDateTime.nullable(),
    /**
     * What `submittedAt` measures: the evidence-backed send, the employer
     * receipt that confirmed it, or the user's own report. Null when unknown,
     * in which case no elapsed-time claim may be made.
     */
    submittedAtBasis: z.enum(["evidence", "receipt", "user_reported"]).nullable(),
    /** When a post-submission employer email was matched; an arrival fact, not an outcome. */
    receiptAt: isoDateTime.nullable(),
    /** One grounded reason for unconfirmed, not_submitted or canceled; null for the generic case. */
    reason: z
      .enum([
        "missing_information",
        "employer_form_incomplete",
        "role_unavailable",
        "manual_only",
        "not_completed",
        "no_receipt",
        "canceled_before_submit",
        "canceled_while_submitting",
      ])
      .nullable(),
    /** A real action the user can take, or null. Never a generic review. */
    attention: z.enum(["reconnect_email"]).nullable(),
    /** When the last attempt ended, for unknown results; null when not recorded. */
    attemptEndedAt: isoDateTime.nullable(),
  }),
  {
    id: "ApplicationSubmissionSummary",
    description:
      "Server-derived submission disposition, provenance, timing and the one real customer action, if any. Same interpretation on the list and on the detail read.",
  },
);

/**
 * One deduplicated pipeline card from `GET /pipeline`. `listingId` and
 * `sourceUrl` are omitted (not null) when unknown — the handler assigns
 * `undefined`, which JSON serialization drops.
 */
export const pipelineItemSchema = responseComponent(
  z.object({
    matchId: uuidString,
    applicationId: uuidString.nullable(),
    listingId: z.string().optional(),
    /**
     * The recruiter Messages thread attached to this application, when one
     * exists. The pipeline row CTA ("Reply to employer") deep-links to
     * `/messages?thread=<id>` with it; null on a card with no conversation
     * (never applied, or no recruiter mail ever matched).
     */
    threadId: uuidString.nullable(),
    title: z.string(),
    company: z.string(),
    companyDomain: z.string().nullable(),
    companyLogoUrl: z.string().nullable(),
    companyDescription: z.string().nullable(),
    matchScore: z.number(),
    sourceUrl: z.string().optional(),
    salary: z.string().nullable(),
    salaryMin: z.number().nullable(),
    salaryMax: z.number().nullable(),
    salaryCurrency: z.string().nullable(),
    salaryPeriod: z.string().nullable(),
    salaryLocalMin: z.number().nullable(),
    salaryLocalMax: z.number().nullable(),
    location: z.string().nullable(),
    locationType: z.string().nullable(),
    benefits: pipelineBenefitsSchema,
    status: productPipelineStatusSchema,
    addedAt: isoDateTime,
    pipelineUpdatedAt: isoDateTime,
    employerConfirmedAt: isoDateTime.nullable(),
    /**
     * Engine that actually submitted, and only once the row is applied: an
     * in-flight fallback stays null so no client can render a premature
     * "submitted by" claim. Other strategies and legacy rows are null rather
     * than guessed. The raw enum is admin vocabulary — user-facing copy for
     * `simpleapply` is neutral (apps/web/src/lib/pipelineStatusLabel.ts).
     */
    submittedVia: z.enum(["dreambreaker", "simpleapply"]).nullable(),
    interviewCount: z.int(),
    submissionStatus: submissionStatusSchema,
    autoApply: z.enum(["none", "applying", "applied", "failed"]),
    roleExpired: z.boolean(),
    hasPack: z.boolean(),
    packStatus: z
      .enum(["queued", "generating", "ready", "partial", "failed"])
      .nullable(),
    packRequestedAt: z.string().nullable(),
    packStartedAt: z.string().nullable(),
    packCompletedAt: z.string().nullable(),
    /**
     * Per-asset state for a pack generated one asset at a time. `packStatus`
     * stays the submit-ready verdict; a card that labels the resume and the
     * letter separately reads this instead.
     */
    packAssets: packAssetsSchema.nullable(),
    importStatus: z.enum(["pending", "ready", "failed"]).nullable(),
    importFailureReason: z.string().nullable(),
    importedManually: z.boolean(),
    manualApplyOnly: z.boolean(),
    manualApplyReason: z
      .enum([
        "company_blocked",
        "platform_blocked",
        "import",
        "needs_user_action",
      ])
      .nullable(),
    /**
     * PON-3684: allowlisted, user-actionable failure reason for a failed
     * application. A closed enum on purpose — the internal errorCode taxonomy
     * names engines and vendors and must never reach the browser. Extend it
     * together with USER_ACTIONABLE_FAILURE_CODES in
     * apps/api/src/api-lib/pipeline-failure-code.ts.
     */
    failureCode: z.enum(["personal_email_reconnect_required"]).nullable(),
    /** PON-3609: Canonical recovery state for failed/ambiguous applications. */
    recoveryState: z
      .object({
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
        actions: z.array(applicationRecoveryActionSchema),
        nonterminal: z.boolean(),
        label: z.string(),
      })
      .nullable(),
    /**
     * PON-3868: null until an apply has been requested for the row (a saved
     * job with only a prepared pack has no submission to describe).
     */
    submission: applicationSubmissionSummarySchema.nullable(),
    /** Only a manually recorded job with no submission attempt can be reset. */
    canUndoApplied: z.boolean(),
  }),
  {
    id: "PipelineItem",
    description:
      "One pipeline board card: job + latest application + listing hydration, deduplicated per listing/URL/job.",
  },
);

/** `GET /pipeline` 200 body. */
export const pipelineResponseSchema = responseComponent(
  z.object({
    jobs: z.array(pipelineItemSchema),
    count: z.int(),
    total: z.int(),
    activeTotal: z.int(),
    closedTotal: z.int(),
    hasMore: z.boolean(),
  }),
  {
    id: "PipelineResponse",
    description:
      "Deduplicated pipeline cards capped at `limit`: active cards first, then closed ones (REJECTED, WITHDRAWN, NO_RESPONSE, ACCEPTED), each group by pipelineUpdatedAt descending, with a tenth of `limit` held for the most recently closed cards. `activeTotal` and `closedTotal` count every card, shown or not.",
  },
);

/**
 * `GET /pipeline` 500 fallback: the handler catches query failures and returns
 * an empty-but-shaped payload alongside the error message.
 */
export const pipelineErrorResponseSchema = responseComponent(
  z.object({
    error: z.string(),
    jobs: z.array(pipelineItemSchema),
    count: z.int(),
    total: z.int(),
    activeTotal: z.int(),
    closedTotal: z.int(),
    hasMore: z.boolean(),
  }),
  {
    id: "PipelineErrorResponse",
    description:
      "Pipeline query-failure fallback: error message plus an empty, correctly shaped board payload.",
  },
);

/** `GET /pipeline` query parameters (post-coercion domain). */
export const pipelineQuery = {
  limit: z
    .int()
    .min(1)
    .max(500)
    .default(200)
    .describe("Maximum cards returned (coerced from the query string)."),
};
