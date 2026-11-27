import { z } from "zod";
import { requestComponent, responseComponent, sharedComponent } from "../registry.js";
import { isoDateTime, uuidString } from "./common.js";

/**
 * Wire shapes of the resume improver: `GET` and `POST
 * /profile/resume/improvement`, its apply and undo, and the questions it asks
 * the person.
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

export const resumeQuestionScopeSchema = sharedComponent(z.enum(["line", "role"]), {
  id: "ResumeQuestionScope",
  description:
    "Where an answer lands: `line` rewrites one line, `role` adds a bullet at the end of a role. Mirrors RESUME_QUESTION_SCOPES in @jobless/shared.",
});

export const resumeQuestionKindSchema = sharedComponent(z.enum(["number", "sentence"]), {
  id: "ResumeQuestionKind",
  description: "How a question is answered: one figure, or a sentence or two. Mirrors RESUME_QUESTION_KINDS in @jobless/shared.",
});

const lineAddition = z.object({
  after: z.number().int().nonnegative().describe("The line the new bullet follows."),
  text: z.string().min(1).max(600),
});

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
        accepted: z.boolean(),
      }),
    ),
    edits: z.array(lineEdit),
    additions: z.array(lineAddition).describe("Bullets the person added by answering questions, on an applied improvement."),
    questions: z
      .array(
        z.object({
          scope: resumeQuestionScopeSchema,
          kind: resumeQuestionKindSchema,
          question: z.string(),
          line: z
            .number()
            .int()
            .nonnegative()
            .describe("For `line`, the line the answer rewrites. For `role`, the role's last line, which the new bullet follows."),
          text: z.string().describe("For `line`, the line as it read when the question was written. Empty for `role`."),
          context: z.string().nullable().describe("Employer and title of the role the question is about."),
          template: z
            .string()
            .nullable()
            .describe("For a `line` count, the line with `{n}` where the figure goes, to fill in without a request while the line still reads as `text`."),
        }),
      )
      .max(8)
      .describe("Questions for the person, best first, written with the changes. Empty once applied."),
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
  additions: z
    .array(lineAddition)
    .max(8)
    .optional()
    .describe("Bullets the person added by answering questions."),
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

export const resumeQuestionAnswerRequestSchema = requestComponent(
  z
    .object({
      answer: z.string().min(1).max(600).describe("What the person answered, in their own words."),
      text: z
        .string()
        .max(600)
        .describe("For a `line` question, the line as it reads on the person's screen. Empty for a `role` question."),
      followUp: z
        .string()
        .min(2)
        .max(240)
        .optional()
        .describe("The follow-up question this answers, when it answers one. No further follow-up is asked."),
    })
    .strict(),
  {
    id: "ResumeQuestionAnswerRequest",
    description: "Answer one of an improvement's questions. A `line` answer rewrites that line; a `role` answer writes a new bullet.",
  },
);

export const resumeQuestionAnswerResponseSchema = responseComponent(
  z.object({
    status: z
      .enum(["rewritten", "follow_up", "skipped", "refused"])
      .describe(
        "`rewritten`: `text` is the line, or for a `role` question the new bullet, stating the answer. `follow_up`: the answer gave nothing to state, and `followUp` is one sharper question. `skipped`: the person did not know. `refused`: nothing written passed the checks, and the resume is unchanged.",
      ),
    text: z.string().nullable(),
    segments: diffSegments,
    followUp: z.string().nullable(),
  }),
  {
    id: "ResumeQuestionAnswerResponse",
    description:
      "What an answer did to its line. Nothing is stored; a rewrite reaches the resume only as one of the person's edits when they apply.",
  },
);

export const resumeEditorMatchSchema = responseComponent(
  z.object({
    listingId: uuidString,
    title: z.string(),
    company: z.string(),
    companyDomain: z.string().nullable(),
    logoUrl: z.string().nullable(),
    location: z.string().nullable().describe("`Remote`, the listing's place, or null when it states none."),
    score: z.number().int().describe("The match percentage the feed shows for this job."),
  }),
  {
    id: "ResumeEditorMatch",
    description: "One job the resume fits, for the resume editor's review screen.",
  },
);

export const resumeEditorMatchesResponseSchema = responseComponent(
  z.object({
    status: z
      .enum(["ready", "pending", "none"])
      .describe(
        "`ready`: `jobs` holds three to five jobs. `pending`: the resume is still being read; ask again shortly. `none`: there are too few good matches to show, and asking again will not change that.",
      ),
    jobs: z.array(resumeEditorMatchSchema),
  }),
  {
    id: "ResumeEditorMatchesResponse",
    description:
      "A few jobs the profile's stored resume fits. Nothing is stored: the caller keeps the answer and does not ask again for the same profile.",
  },
);
