import { z } from "zod";
import { requestComponent, responseComponent, sharedComponent } from "../registry.js";
import { isoDateTime } from "./common.js";

export const ghostingGradeSchema = sharedComponent(
  z.enum(["A", "B", "C", "D", "F"]),
  {
    id: "GhostingGrade",
    description:
      "Verified ghosting grade from the observed ghost rate. Mirrors GHOSTING_GRADES in @jobless/shared.",
  },
);

export const ghostingSortSchema = sharedComponent(z.enum(["worst", "best"]), {
  id: "GhostingSort",
  description:
    "Board order: `worst` ranks graded companies worst first, then reported ones; `best` ranks graded companies best first. Mirrors GHOSTING_SORTS in @jobless/shared.",
});

export const ghostingModerationStatusSchema = sharedComponent(
  z.enum(["approved", "rejected", "held"]),
  {
    id: "GhostingModerationStatus",
    description:
      "Outcome of the cheap check on a community report or comment. Held means the check could not run and a person or the recheck sweep will decide. Mirrors GHOSTING_MODERATION_STATUSES in @jobless/shared.",
  },
);

const ghostingCompanySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  domain: z.string(),
  logoUrl: z.string().nullable(),
});

const ghostingVerifiedSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("graded"),
    grade: ghostingGradeSchema,
    applicationsJudged: z.int().nonnegative(),
    peopleGhosted: z.int().nonnegative(),
    ghostRate: z.number().min(0).max(1),
    ghostRateLowerBound: z.number().min(0).max(1),
    confirmationRate: z
      .number()
      .min(0)
      .max(1)
      .nullable()
      .describe("Share of applications with a receipt or answer within 72 hours."),
    windowStart: isoDateTime,
    windowEnd: isoDateTime,
  }),
  z.object({ status: z.literal("insufficient") }),
]);

export const ghostingCommentSchema = responseComponent(
  z.object({
    id: z.uuid(),
    body: z.string(),
    role: z.string(),
    likes: z.int().nonnegative(),
    createdAt: isoDateTime,
  }),
  {
    id: "GhostingComment",
    description: "An approved community comment. Never carries its author.",
  },
);

export const ghostingEntrySchema = responseComponent(
  z.object({
    company: ghostingCompanySchema,
    verified: ghostingVerifiedSchema,
    community: z.object({
      peopleReported: z.int().nonnegative(),
      reports: z.int().nonnegative(),
      comments: z.int().nonnegative(),
      latestComment: ghostingCommentSchema.nullable(),
    }),
  }),
  {
    id: "GhostingEntry",
    description:
      "One company on the Ghosting Index. Verified numbers come only from applications Dreamwork sent; community numbers only from approved reports.",
  },
);

export const ghostingBoardResponseSchema = responseComponent(
  z.object({
    entries: z.array(
      ghostingEntrySchema.extend({
        rank: z
          .int()
          .positive()
          .nullable()
          .describe("Position among graded and reported companies; null for every other company."),
      }),
    ),
    page: z.int().positive(),
    pageSize: z.int().positive(),
    total: z.int().nonnegative(),
    query: z.string(),
    sort: ghostingSortSchema,
  }),
  {
    id: "GhostingBoardResponse",
    description:
      "One page of the board over the whole company directory: graded companies worst first by the 95% lower bound of their ghost rate, then companies people reported, then every other company unranked. With `sort=best`, graded companies best first by the 95% upper bound, then every other company unranked.",
  },
);

export const ghostingCompanyResponseSchema = responseComponent(
  z.object({
    entry: ghostingEntrySchema,
    comments: z.array(ghostingCommentSchema),
  }),
  {
    id: "GhostingCompanyResponse",
    description: "One company's entry and its newest approved comments.",
  },
);

export const ghostingCommentsResponseSchema = responseComponent(
  z.object({
    comments: z.array(ghostingCommentSchema),
    nextCursor: z.string().nullable(),
  }),
  {
    id: "GhostingCommentsResponse",
    description: "A page of approved comments, newest first.",
  },
);

const ghostingSubmittedSchema = z.object({
  id: z.uuid(),
  status: ghostingModerationStatusSchema,
  reason: z.string().nullable(),
});

export const ghostingMineResponseSchema = responseComponent(
  z.object({
    likedCommentIds: z.array(z.uuid()),
    reports: z.array(
      z.object({
        id: z.uuid(),
        role: z.string(),
        status: ghostingModerationStatusSchema,
        createdAt: isoDateTime,
      }),
    ),
    comments: z.array(
      z.object({
        id: z.uuid(),
        reportId: z.uuid(),
        body: z.string(),
        role: z.string(),
        status: ghostingModerationStatusSchema,
        createdAt: isoDateTime,
      }),
    ),
  }),
  {
    id: "GhostingMineResponse",
    description: "The signed-in person's own reports and comments for one company.",
  },
);

export const ghostingReportSubmitResponseSchema = responseComponent(
  z.object({
    report: ghostingSubmittedSchema.omit({ reason: true }),
    comment: ghostingSubmittedSchema.nullable(),
  }),
  {
    id: "GhostingReportSubmitResponse",
    description: "The stored report and, when one was sent, its comment.",
  },
);

export const ghostingCommentSubmitResponseSchema = responseComponent(
  z.object({ comment: ghostingSubmittedSchema }),
  {
    id: "GhostingCommentSubmitResponse",
    description: "The stored comment and its check outcome.",
  },
);

export const ghostingCommentLikeResponseSchema = responseComponent(
  z.object({
    likes: z.int().nonnegative(),
    liked: z.boolean(),
  }),
  {
    id: "GhostingCommentLikeResponse",
    description: "The comment's like count after the caller's like or unlike.",
  },
);

export type GhostingEntryContract = z.infer<typeof ghostingEntrySchema>;
export type GhostingBoardResponse = z.infer<typeof ghostingBoardResponseSchema>;
export type GhostingCommentLikeResponse = z.infer<typeof ghostingCommentLikeResponseSchema>;
export type GhostingCompanyResponse = z.infer<typeof ghostingCompanyResponseSchema>;
export type GhostingCommentsResponse = z.infer<typeof ghostingCommentsResponseSchema>;
export type GhostingMineResponse = z.infer<typeof ghostingMineResponseSchema>;
export type GhostingReportSubmitResponse = z.infer<
  typeof ghostingReportSubmitResponseSchema
>;
export type GhostingCommentSubmitResponse = z.infer<
  typeof ghostingCommentSubmitResponseSchema
>;

export const ghostingReportRequestSchema = requestComponent(
  z
    .object({
      role: z.string().min(2).max(120).describe("The role applied for, as typed."),
      comment: z
        .string()
        .min(3)
        .max(600)
        .nullish()
        .describe("Optional: what happened."),
    })
    .strict(),
  {
    id: "GhostingReportRequest",
    description:
      "One ghost report: one per person, company and role. Lengths mirror GHOSTING_ROLE_MAX_LENGTH and GHOSTING_COMMENT_MAX_LENGTH in @jobless/shared.",
  },
);

export const ghostingCommentRequestSchema = requestComponent(
  z
    .object({
      reportId: z.uuid().describe("The caller's own report on this company."),
      comment: z.string().min(3).max(600),
    })
    .strict(),
  {
    id: "GhostingCommentRequest",
    description: "A comment on a company the caller has already reported.",
  },
);

export type GhostingReportRequest = z.infer<typeof ghostingReportRequestSchema>;
export type GhostingCommentRequest = z.infer<typeof ghostingCommentRequestSchema>;
