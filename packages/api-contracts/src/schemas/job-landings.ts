import { z } from "zod";
import { responseComponent } from "../registry.js";
import { isoDateTime } from "./common.js";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const landingRole = z.object({
  slug,
  label: z.string(),
  titlePhrases: z
    .array(z.string())
    .describe(
      "Whole-word phrases a listing title must contain to count as this role.",
    ),
});

const landingLocation = z.object({
  slug,
  label: z.string(),
  kind: z.enum(["city", "country", "remote"]),
  inPhrase: z
    .string()
    .nullable()
    .describe('Display text such as "in the United States"; null for remote.'),
  countryCode: z.string().length(2).nullable(),
  radiusKm: z
    .number()
    .nullable()
    .describe("A city is the listings placed within this distance of it."),
});

const salarySummary = z
  .object({
    currency: z.string().length(3),
    low: z.number().describe("25th percentile of posted salary midpoints."),
    median: z.number().describe("Median posted midpoint."),
    high: z.number().describe("75th percentile of posted salary midpoints."),
    sampleSize: z
      .int()
      .describe("Listings with a verified posted annual base salary in this currency."),
  })
  .nullable()
  .describe(
    "Employer-posted annual base pay in the most common currency; null below three such listings.",
  );

const landingListing = z.object({
  id: z.uuid(),
  title: z.string(),
  companyName: z.string(),
  companyDomain: z.string(),
  location: z.string().nullable(),
  remoteType: z.string().nullable(),
  postedAt: isoDateTime.nullable(),
  sourceUpdatedAt: isoDateTime.nullable(),
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

const landingLink = z.object({
  path: z.string(),
  label: z.string(),
  count: z.int().nonnegative(),
});

export const jobLandingIndexResponseSchema = responseComponent(
  z.object({
    generatedAt: isoDateTime,
    roles: z.array(z.object({ slug, label: z.string() })),
    locations: z.array(landingLocation),
    roleLocation: z.array(
      z.object({
        role: slug,
        location: slug,
        path: z.string(),
        label: z.string(),
        count: z.int().nonnegative(),
        lastActivityAt: isoDateTime.nullable(),
        indexable: z.boolean(),
      }),
    ),
    companyRole: z.array(
      z.object({
        domain: z.string(),
        role: slug,
        path: z.string(),
        count: z.int().nonnegative(),
        lastActivityAt: isoDateTime.nullable(),
        indexable: z.boolean(),
      }),
    ),
  }),
  {
    id: "JobLandingIndex",
    description:
      "Every role-by-location page with open roles, and every indexable company-by-role page, from the twice-daily landing snapshot.",
  },
);

export const roleLocationLandingResponseSchema = responseComponent(
  z.object({
    role: landingRole,
    location: landingLocation,
    heading: z.string(),
    path: z.string(),
    count: z.int().positive(),
    companyCount: z.int().positive(),
    lastActivityAt: isoDateTime.nullable(),
    generatedAt: isoDateTime,
    indexable: z.boolean(),
    salary: salarySummary,
    topCompanies: z.array(
      z.object({
        domain: z.string(),
        name: z.string(),
        count: z.int().positive(),
        companyRolePath: z.string().nullable(),
      }),
    ),
    listings: z.array(landingListing),
    related: z.object({
      locations: z.array(landingLink),
      roles: z.array(landingLink),
    }),
  }),
  {
    id: "RoleLocationLanding",
    description:
      "One role in one place. Counts, pay and employers are from the landing snapshot; listings are re-checked as servable on every request.",
  },
);

export const companyRoleLandingResponseSchema = responseComponent(
  z.object({
    company: z.object({
      domain: z.string(),
      name: z.string(),
      logoUrl: z.string().nullable(),
      searchPromotionAllowed: z.boolean(),
    }),
    role: landingRole,
    heading: z.string(),
    path: z.string(),
    count: z.int().positive(),
    lastActivityAt: isoDateTime.nullable(),
    generatedAt: isoDateTime,
    indexable: z.boolean(),
    salary: salarySummary,
    listings: z.array(landingListing),
    locations: z.array(
      z.object({
        slug,
        label: z.string(),
        count: z.int().positive(),
        path: z.string().nullable(),
        pathLabel: z.string(),
      }),
    ),
    otherRoles: z.array(landingLink),
  }),
  {
    id: "CompanyRoleLanding",
    description: "One role at one company, computed live from servable listings.",
  },
);

export const jobLandingLinksResponseSchema = responseComponent(
  z.object({ links: z.array(landingLink) }),
  {
    id: "JobLandingLinks",
    description:
      "Indexable landing pages that cover one listing or one company, largest first.",
  },
);
