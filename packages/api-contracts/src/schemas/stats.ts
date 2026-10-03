import { z } from "zod";
import { responseComponent } from "../registry.js";

/**
 * `GET /stats` aggregates. Every block is a single-row SQL aggregate, so the
 * blocks are always present.
 */

export const statsJobsSchema = responseComponent(
  z.object({
    total: z.int(),
    queued: z.int(),
    applied: z.int(),
    failed: z.int(),
    skipped: z.int(),
  }),
  {
    id: "StatsJobs",
    description: "Job counts for the user, total and by worker status.",
  },
);

export const statsApplicationsSchema = responseComponent(
  z.object({
    total: z.int(),
    applied: z.int(),
    conversing: z.int(),
    interview: z.int(),
    escalated: z.int(),
    failed: z.int(),
    avgFitScore: z
      .union([z.number(), z.string()])
      .nullable()
      .describe(
        "Average fit score rounded to 2 decimals. Postgres numeric may serialize as a string; null when the user has no applications.",
      ),
    successRate: z
      .int()
      .describe(
        "Percentage of jobs whose application reached applied/conversing/interview.",
      ),
  }),
  {
    id: "StatsApplications",
    description: "Application counts by status plus derived quality metrics.",
  },
);

export const statsEscalationsSchema = responseComponent(
  z.object({
    total: z.int(),
    pending: z.int(),
    resolved: z.int(),
  }),
  {
    id: "StatsEscalations",
    description: "Escalation counts for the user's applications.",
  },
);

export const statsOutreachSchema = responseComponent(
  z.object({
    total: z.int(),
    sent: z.int(),
    replied: z.int(),
    draft: z.int(),
  }),
  {
    id: "StatsOutreach",
    description: "Outreach counts for the user, total and by status.",
  },
);

/** `GET /stats` 200 body. */
export const statsResponseSchema = responseComponent(
  z.object({
    jobs: statsJobsSchema,
    applications: statsApplicationsSchema,
    escalations: statsEscalationsSchema,
    outreach: statsOutreachSchema,
  }),
  {
    id: "StatsResponse",
    description: "Aggregate pipeline stats across jobs, applications, escalations, and outreach.",
  },
);
