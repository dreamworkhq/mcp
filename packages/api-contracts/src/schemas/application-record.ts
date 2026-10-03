import { z } from "zod";
import { responseComponent } from "../registry.js";
import { applicationResumeVariantSchema } from "./application-materials.js";

/**
 * PON-3868: the record of what an attempt actually sent. Every field is a
 * provenance claim the API can stand behind; "prepared" means a document
 * exists for this application without proof that this exact version reached
 * the employer, and it must never be relabelled as sent.
 */
export const applicationSubmittedAnswerSchema = responseComponent(
  z.object({
    /** Stable field identity within the form (the engine's field id). */
    id: z.string(),
    /** Form order, so the list reads the way the form did. */
    order: z.int(),
    /** The employer's question label, as displayed. */
    label: z.string(),
    kind: z.enum(["text", "choice", "multi_choice", "boolean", "file", "other"]),
    /** The final displayed value; null when the field was left blank. */
    value: z.string().nullable(),
    /** Selected option labels for a multi-choice field; null otherwise. */
    values: z.array(z.string()).nullable(),
    /**
     * restricted: a self-identification or protected-characteristic question
     * whose value is withheld from this record under the existing
     * restricted-data policy. The question is still listed.
     */
    omitted: z.enum(["restricted"]).nullable(),
  }),
  {
    id: "ApplicationSubmittedAnswer",
    description:
      "One employer question and the final value the engine entered for it on the proven attempt.",
  },
);

export const applicationSubmittedRecordSchema = responseComponent(
  z.object({
    /** The canonical successful attempt, when the outcome ledger names one. */
    attempt: z
      .object({
        attemptId: z.string().nullable(),
      })
      .nullable(),
    resume: z.object({
      /**
       * submitted: the immutable version the proven attempt used. prepared: a
       * document exists but this exact version is not proven sent.
       */
      provenance: z.enum(["submitted", "prepared", "unavailable"]),
      variant: applicationResumeVariantSchema.nullable(),
    }),
    coverLetter: z.object({
      /**
       * submitted: the engine confirmed it entered or uploaded the letter.
       * included: the frozen letter was part of what the proven attempt sent,
       * without engine confirmation the form accepted it. omitted: the user
       * turned it off. prepared: a letter exists without proof of sending.
       */
      provenance: z.enum([
        "submitted",
        "included",
        "omitted",
        "prepared",
        "unavailable",
      ]),
    }),
    answers: z.object({
      /**
       * recorded: every final value the engine observed. partial: the form
       * had more controls than the capture could hold. no_questions: the
       * engine observed a form with nothing to record. not_recorded: no
       * capture exists for the proven attempt, with the reason.
       */
      status: z.enum(["recorded", "partial", "no_questions", "not_recorded"]),
      reason: z
        .enum(["not_captured", "capture_failed", "attempt_not_proven"])
        .nullable(),
      items: z.array(applicationSubmittedAnswerSchema),
    }),
    /**
     * Whether a candidate-account login exists for this application, to be
     * revealed on demand from `GET /applications/:id/portal-credentials`.
     * available: the apply created an ATS account (DreamBreaker proved it by
     * the ATS's verification email, or the apply partner registered one on an
     * account-based ATS). none: a public-form submission that created nothing.
     * The login itself is never in this record.
     */
    credentials: z.object({
      status: z.enum(["available", "none"]),
    }),
    /**
     * The address the employer has this person on file under, when it is not
     * their Dreamwork address: the apply partner submits under its own proxy
     * domain, so a scheduler or candidate portal knows them by this address.
     * Null for every other lane and before a proven submission.
     */
    employerEmail: z.string().nullable(),
  }),
  {
    id: "ApplicationSubmittedRecord",
    description:
      "Provenance of the resume, cover letter and answers behind an application, resolved from the canonical outcome and the frozen material revision. Prepared documents are never presented as sent.",
  },
);
