import { z } from "zod";
import { requestComponent, responseComponent, sharedComponent } from "../registry.js";
import { isoDateTime, uuidString, validationErrorResponseSchema } from "./common.js";

export const applicationNeedsInfoStateSchema = sharedComponent(
  z.enum(["waiting", "resuming", "none"]),
  {
    id: "ApplicationNeedsInfoState",
    description:
      "`waiting`: the application is held for the questions listed. `resuming`: every question is answered and the application is back in the apply queue. `none`: nothing is being asked.",
  },
);

export const applicationNeedsInfoQuestionKindSchema = sharedComponent(
  z.enum([
    "text",
    "textarea",
    "boolean",
    "number",
    "date",
    "single_select",
    "multi_select",
  ]),
  {
    id: "ApplicationNeedsInfoQuestionKind",
    description:
      "The control the employer's form uses. A `single_select` or `multi_select` answer must be one of the option values; `boolean` takes true or false; `number` takes a number; every other kind takes a string.",
  },
);

export const applicationNeedsInfoQuestionSchema = responseComponent(
  z.object({
    requestId: uuidString,
    /** Echo this back with the answer; a changed question refuses a stale one. */
    requestRevision: z.number().int().positive(),
    /** The employer's own wording, untrusted text. */
    label: z.string(),
    kind: applicationNeedsInfoQuestionKindSchema,
    options: z.array(z.object({ label: z.string(), value: z.string() })),
    required: z.boolean(),
    validation: z.object({
      minLength: z.number().int().nonnegative().optional(),
      maxLength: z.number().int().nonnegative().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().optional(),
      format: z.enum(["email", "phone", "url", "integer", "decimal"]).optional(),
    }),
  }),
  {
    id: "ApplicationNeedsInfoQuestion",
    description: "One question the application is waiting on, in form order.",
  },
);

export const applicationNeedsInfoResponseSchema = responseComponent(
  z.object({
    state: applicationNeedsInfoStateSchema,
    /** Opaque; send it back with answers. Empty when nothing was ever asked. */
    actionVersion: z.string(),
    /** When an unanswered wait ends and the application is skipped. */
    expiresAt: isoDateTime.nullable(),
    /** Empty unless `state` is `waiting`. */
    questions: z.array(applicationNeedsInfoQuestionSchema),
  }),
  {
    id: "ApplicationNeedsInfoResponse",
    description:
      "What an application is waiting on from the person: the open questions, the version to answer against, and when the wait expires.",
  },
);

export const applicationNeedsInfoAnswerRequestSchema = requestComponent(
  z
    .object({
      actionVersion: z.string().min(1).max(256),
      answers: z
        .array(
          z
            .object({
              requestId: uuidString,
              requestRevision: z.number().int().positive(),
              value: z.union([
                z.string().max(20_000),
                z.number(),
                z.boolean(),
                z.array(z.string().max(2_000)).max(100),
              ]),
            })
            .strict(),
        )
        .min(1)
        .max(50),
    })
    .strict(),
  {
    id: "ApplicationNeedsInfoAnswerRequest",
    description:
      "Answers to some or all of the open questions. Every answer is checked before any is saved; they are then saved in order.",
  },
);

export const applicationNeedsInfoAnswerResponseSchema = responseComponent(
  z.object({
    saved: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    /**
     * `resume_queued`: the application is back in the apply queue.
     * `waiting`: questions remain. `not_ready`: everything is answered but the
     * application cannot apply now (for example the listing closed); the wait
     * then expires on its own.
     */
    resumeState: z.enum(["resume_queued", "waiting", "not_ready"]),
  }),
  {
    id: "ApplicationNeedsInfoAnswerResponse",
    description: "The answers were saved.",
  },
);

export const applicationNeedsInfoConflictSchema = responseComponent(
  z.union([
    z.object({
      code: z.literal("action_changed"),
      /** The questions as they are now, to redraw the form without another read. */
      action: applicationNeedsInfoResponseSchema.nullable(),
    }),
    z.object({ code: z.literal("not_waiting") }),
  ]),
  {
    id: "ApplicationNeedsInfoConflict",
    description:
      "`action_changed`: the questions changed since they were read. `not_waiting`: the application is not waiting on the person.",
  },
);

export const applicationNeedsInfoInvalidAnswersSchema = responseComponent(
  z.object({
    code: z.literal("invalid_answers"),
    fields: z.array(z.object({ requestId: uuidString, message: z.string() })),
  }),
  {
    id: "ApplicationNeedsInfoInvalidAnswers",
    description:
      "One message per answer the form would not accept. Answers are checked before any is saved, so nothing changed unless a question changed during the save, in which case answers before it may be stored.",
  },
);

export const applicationNeedsInfoCodedErrorSchema = responseComponent(
  z.object({ code: z.string() }),
  {
    id: "ApplicationNeedsInfoCodedError",
    description:
      "A stable machine code: `field_not_actionable` (an answer names a question that is not open, or names one twice), `not_waiting`, or a resolve error code.",
  },
);

export const applicationNeedsInfoBadRequestSchema = responseComponent(
  z.union([validationErrorResponseSchema, applicationNeedsInfoCodedErrorSchema]),
  {
    id: "ApplicationNeedsInfoBadRequest",
    description:
      "A malformed body answers with the Zod issue list; an answer naming a question that is not open, or naming one twice, answers `field_not_actionable`.",
  },
);

export const applicationNeedsInfoDismissResponseSchema = responseComponent(
  z.object({ submissionStatus: z.literal("canceled") }),
  {
    id: "ApplicationNeedsInfoDismissResponse",
    description:
      "The application is canceled, as the cancel action cancels an in-flight one, and its open questions are closed.",
  },
);
