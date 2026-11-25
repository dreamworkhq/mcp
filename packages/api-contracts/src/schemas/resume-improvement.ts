import { z } from "zod";
import { requestComponent, responseComponent, sharedComponent } from "../registry.js";
import { isoDateTime, uuidString } from "./common.js";

/**
 * Wire shapes of the resume improver: `GET` and `POST
 * /profile/resume/improvement`, and its apply and undo.
 *
 * An improvement is the profile's resume laid out line by line plus the lines
 * the improver would reword. Nothing here carries a number, a name or a claim
 * the resume did not already state: the API refuses any rewrite that adds
 * one before it is stored.
 */

export const resumeChangeCategorySchema = sharedComponent(
  z.enum([
    "weak_opener",
    "filler",
    "buzzword",
    "first_person",
    "passive_voice",
    "tense",
    "wordy",
    "unclear",
    "typo",
  ]),
  {
    id: "ResumeChangeCategory",
    description:
      "Why a line was reworded. Mirrors RESUME_CHANGE_CATEGORIES in @jobless/shared.",
  },
);

export const resumeLineKindSchema = sharedComponent(
  z.enum(["name", "contact", "heading", "entry", "title", "context", "bullet", "paragraph"]),
  {
    id: "ResumeLineKind",
    description:
      "What a resume line is, as the PDF renderer classifies it. Mirrors RESUME_LINE_KINDS in @jobless/shared.",
  },
);

export const resumeAdviceCodeSchema = sharedComponent(
  z.enum([
    "add_numbers",
    "state_your_part",
    "too_long",
    "long_bullets",
    "many_bullets",
    "add_linkedin",
    "drop_references_line",
  ]),
  {
    id: "ResumeAdviceCode",
    description:
      "Something only the person can fix, because fixing it takes a fact the resume does not state. Mirrors RESUME_ADVICE_CODES in @jobless/shared.",
  },
);

const count = z.number().int();
const diffSegments = z.array(z.object({ op: z.enum(["same", "add", "del"]), text: z.string() }));

/** A line the person wrote themselves, by line ordinal. It overrides any rewording proposed for that line. */
const lineEdit = z.object({
  line: z.number().int().nonnegative(),
  text: z.string().min(1).max(600),
});

export const resumeAuditSchema = responseComponent(
  z.object({
    dutyOpeners: count,
    fillerPhrases: count,
    buzzwords: count,
    firstPerson: count,
    longBullets: count,
    words: count,
  }),
  {
    id: "ResumeAudit",
    description:
      "Pattern counts over the lines the improver may reword. On an improvement it is the resume before any change; on a change it is what that change adds to each count, so a negative number is fewer.",
  },
);

export const resumeImprovementSchema = responseComponent(
  z.object({
    id: uuidString,
    status: z.enum(["proposed", "applied"]),
    createdAt: isoDateTime,
    appliedAt: isoDateTime.nullable(),
    lines: z.array(
      z.object({
        line: z.number().int().nonnegative(),
        kind: resumeLineKindSchema,
        text: z.string(),
      }),
    ),
    changes: z.array(
      z.object({
        line: z.number().int().nonnegative(),
        category: resumeChangeCategorySchema,
        before: z.string(),
        after: z.string(),
        reason: z.string().nullable(),
        segments: diffSegments,
        depth: z
          .union([z.literal(1), z.literal(2), z.literal(3)])
          .describe("How far the change moves from the person's wording: 1 touch-up, 2 standard, 3 deeper."),
        effect: resumeAuditSchema,
        accepted: z.boolean(),
      }),
    ),
    edits: z.array(lineEdit),
    audit: resumeAuditSchema,
    keptAsWritten: count.nonnegative(),
    pages: count.positive(),
    advice: z.array(
      z.object({
        code: resumeAdviceCodeSchema,
        count: count.positive(),
        lines: z.array(z.number().int().nonnegative()),
      }),
    ),
  }),
  {
    id: "ResumeImprovement",
    description:
      "One improvement of the profile's default resume. `lines` is the resume in the person's own wording, one entry per non-blank line; each change names the line it rewords by that line's ordinal. `proposed` has not been saved; `applied` is the resume in use and can be undone.",
  },
);

export const resumeImprovementResponseSchema = responseComponent(
  z.object({
    status: z.enum(["none", "proposed", "applied"]),
    improvement: resumeImprovementSchema.nullable(),
    profileIdentityVersion: z.number().int(),
    resumeContentHash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  {
    id: "ResumeImprovementResponse",
    description:
      "What the improver holds for the profile's resume as it is now. `none` carries a null improvement. The identity version and content hash are the fences a later apply or undo is checked against.",
  },
);

const reviewChoices = {
  rejectedLines: z
    .array(z.number().int().nonnegative())
    .max(1000)
    .describe("Line ordinals whose rewording the person turned down."),
  edits: z
    .array(lineEdit)
    .max(1000)
    .optional()
    .describe("Lines the person wrote themselves."),
};

export const resumeImprovementApplyRequestSchema = requestComponent(
  z
    .object({
      ...reviewChoices,
      expectedProfileIdentityVersion: z.number().int().positive(),
    })
    .strict(),
  {
    id: "ResumeImprovementApplyRequest",
    description:
      "Save an improvement as the default resume, keeping the person's wording on the rejected lines.",
  },
);

export const resumeImprovementUndoRequestSchema = requestComponent(
  z.object({ expectedProfileIdentityVersion: z.number().int().positive() }).strict(),
  {
    id: "ResumeImprovementUndoRequest",
    description: "Put back the resume an applied improvement replaced.",
  },
);

export const resumeImprovementRefusalSchema = responseComponent(
  z.object({
    error: z.string(),
    code: z.enum([
      "not_available",
      "no_resume",
      "resume_too_short",
      "resume_too_long",
      "daily_limit",
      "improvement_unavailable",
      "improvement_not_found",
      "improvement_stale",
      "nothing_to_apply",
      "invalid_edit",
      "profile_identity_version_conflict",
      "profile_identity_reset_in_progress",
      "resume_content_version_conflict",
    ]),
  }),
  {
    id: "ResumeImprovementRefusal",
    description:
      "Why the improver did not act. `improvement_unavailable` means a run could not be verified against the resume and was thrown away; the resume is unchanged.",
  },
);

export const resumeLineRewordRequestSchema = requestComponent(
  z
    .object({
      request: z
        .string()
        .min(2)
        .max(400)
        .describe("What the person wants changed, in their own words. A fact they state here may be added to the line."),
      text: z.string().min(1).max(600).describe("The line as it reads on the person's screen."),
    })
    .strict(),
  {
    id: "ResumeLineRewordRequest",
    description: "Reword one line of an improvement the way the person asks.",
  },
);

export const resumeLineRewordResponseSchema = responseComponent(
  z.object({
    status: z.enum(["reworded", "refused"]),
    text: z.string().nullable(),
    reason: z.string().nullable(),
    segments: diffSegments,
    refusal: z
      .enum(["adds_fact", "no_change", "failed"])
      .nullable()
      .describe(
        "`adds_fact`: the rewording would have added something neither the line nor the request states. `no_change`: the request changed nothing. `failed`: the rewording was unusable.",
      ),
  }),
  {
    id: "ResumeLineRewordResponse",
    description:
      "A rewording for the review screen, or why none was used. Nothing is stored; it reaches the resume only as one of the person's edits when they apply.",
  },
);
