import { z } from "zod";
import { responseComponent } from "../registry.js";
import { isoDateTime } from "./common.js";

/**
 * The funding stages that count as a startup, earliest first. The API builds
 * its response from `STARTUP_FUNDING_STAGES` and types it as this contract, so
 * the two lists cannot drift without a compile error.
 */
export const startupFundingStageSchema = z.enum([
  "pre_seed",
  "seed",
  "series_a",
  "series_b",
  "series_c",
]);

const startupListing = z.object({
  id: z.uuid(),
  title: z.string(),
  companyName: z
    .string()
    .describe("The employer name printed on the listing, not a registry match."),
  location: z.string().nullable(),
  remoteType: z.string().nullable(),
  postedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  functionPrimary: z.string().nullable(),
  seniorityLevel: z.string().nullable(),
  fundingStage: startupFundingStageSchema,
  salary: z
    .object({
      min: z.number(),
      max: z.number(),
      currency: z.string(),
      period: z.string(),
      isOte: z.boolean(),
    })
    .nullable()
    .describe("The verified posted salary the public job page shows, or null."),
});

export const startupJobsResearchResponseSchema = responseComponent(
  z.object({
    total: z.int().nonnegative(),
    companyCount: z
      .int()
      .nonnegative()
      .describe("Job boards with at least one counted listing."),
    remoteCount: z.int().nonnegative(),
    latestAddedAt: isoDateTime.nullable(),
    stages: z
      .array(
        z.object({
          stage: startupFundingStageSchema,
          jobs: z.int().nonnegative(),
          companies: z.int().nonnegative(),
        }),
      )
      .describe("One row per startup stage, earliest first, zeros included."),
    listings: z
      .array(startupListing)
      .describe("The most recently added listings, newest first."),
  }),
  {
    id: "StartupJobsResearch",
    description:
      "Servable listings from job boards whose employer is at Pre-Seed through Series C. Every count is over the whole set; listings is its newest page.",
  },
);
