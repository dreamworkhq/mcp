import { z } from "zod";
import { responseComponent, sharedComponent } from "../registry.js";

/**
 * Common wire vocabulary shared across operations.
 *
 * These schemas describe the wire truth of the current API responses — they
 * document existing error variants, they do not normalize endpoint error
 * behavior. All timestamps on the wire are ISO 8601 UTC strings produced by
 * `Date#toISOString()` (Postgres timestamptz serialized by Fastify).
 */

/** ISO 8601 UTC datetime string as emitted by `Date#toISOString()`. */
export const isoDateTime = z.iso.datetime();

/** UUID string (Postgres `uuid` primary keys on the wire). */
export const uuidString = z.uuid();

/**
 * Free-form JSON object (Postgres `jsonb` column surfaced verbatim). The value
 * space is deliberately unconstrained; this is not a silent fallback.
 */
export const freeformJsonObject = z.record(z.string(), z.unknown());

export const accountRoleSchema = sharedComponent(
  z.enum(["user", "staff", "admin"]),
  {
    id: "AccountRole",
    description:
      "Account role ladder: user < staff < admin. Mirrors ACCOUNT_ROLES in @jobless/shared. Staff may read allow-listed admin stats routes; admin may do everything.",
  },
);

export const subscriptionTierSchema = sharedComponent(
  z.enum(["free", "pro", "dreamer"]),
  {
    id: "SubscriptionTier",
    description:
      "Effective subscription plan after expiry resolution. Mirrors SUBSCRIPTION_TIERS in @jobless/shared.",
  },
);

export const billingIntervalSchema = sharedComponent(
  z.enum(["month", "quarter"]),
  {
    id: "BillingInterval",
    description:
      "How often a paid plan invoices. Mirrors BILLING_INTERVALS in @jobless/shared.",
  },
);

export const subscriptionSourceSchema = sharedComponent(
  z.enum([
    "signup",
    "stripe",
    "stripe_invoice_recovery",
    "grandfather",
    "admin",
    "legacy",
    "reply_free_week",
  ]),
  {
    id: "SubscriptionSource",
    description:
      "How the current subscription tier was granted. Unrecognized stored values normalize to \"signup\".",
  },
);

export const generationModelKeySchema = sharedComponent(
  z.enum(["haiku", "opus", "mythos"]),
  {
    id: "GenerationModelKey",
    description:
      "Selectable pack-generation model key. \"mythos\" is reserved and not yet available.",
  },
);

/** Worker-side job/application status enum (`application_status` in Postgres). */
export const jobStatusSchema = sharedComponent(
  z.enum([
    "queued",
    "evaluating",
    "skipped",
    "applying",
    "applied",
    "reply_received",
    "conversing",
    "interview_scheduled",
    "failed",
    "escalated",
    "waiting_for_user_input",
    "human_takeover",
  ]),
  {
    id: "JobStatus",
    description:
      "Worker-facing job/application lifecycle status (Postgres application_status enum).",
  },
);

export const applicationMethodSchema = sharedComponent(
  z.enum(["email", "web", "api", "unknown"]),
  {
    id: "ApplicationMethod",
    description: "How an application can be submitted for a job.",
  },
);

/**
 * Plain handler error: `{ error: string }`. Sent by route handlers for auth
 * probes and not-found reads (e.g. 401 "Not authenticated", 404 "Job not
 * found").
 */
export const errorResponseSchema = responseComponent(
  z.object({
    error: z.string(),
  }),
  {
    id: "ErrorResponse",
    description:
      "Plain handler error message. The `error` field is human-readable, not a stable machine code.",
  },
);

/**
 * Error with a machine-readable code plus human copy, e.g.
 * `{ error: "model_requires_upgrade", message: "..." }`.
 */
export const codedErrorResponseSchema = responseComponent(
  z.object({
    error: z.string(),
    message: z.string(),
  }),
  {
    id: "CodedErrorResponse",
    description:
      "Error with a stable machine-readable `error` code and human-readable `message` copy.",
  },
);

/**
 * One serialized Zod issue as emitted by `parsed.error.issues`. Additional
 * issue-specific keys (expected/received/minimum/...) may be present; the
 * document does not forbid unknown response keys.
 */
export const validationIssueSchema = responseComponent(
  z.looseObject({
    code: z.string(),
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
  }),
  {
    id: "ValidationIssue",
    description:
      "One serialized Zod validation issue. Issue-specific extra keys may accompany code/path/message.",
  },
);

/**
 * Validation failure wire shape used by Zod-validated routes:
 * `{ error: ZodIssue[] }` from `reply.status(400).send({ error: issues })`.
 */
export const validationErrorResponseSchema = responseComponent(
  z.object({
    error: z.array(validationIssueSchema),
  }),
  {
    id: "ValidationErrorResponse",
    description:
      "400 response from Zod-validated routes: `error` carries the serialized issue list.",
  },
);
