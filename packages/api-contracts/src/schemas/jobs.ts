import { z } from "zod";
import { responseComponent } from "../registry.js";
import {
  applicationMethodSchema,
  freeformJsonObject,
  isoDateTime,
  jobStatusSchema,
  uuidString,
} from "./common.js";

/**
 * Wire truth of a `jobs` table row as returned verbatim by
 * `GET /jobs` and `GET /jobs/:id` (`db.select().from(jobs)` serialized by
 * Fastify; timestamptz columns become ISO strings).
 */
export const jobRecordSchema = responseComponent(
  z.object({
    id: uuidString,
    userId: uuidString,
    title: z.string(),
    company: z.string(),
    description: z.string().nullable(),
    source: z.string().nullable(),
    url: z.string().nullable(),
    contactEmail: z.string().nullable(),
    applicationMethod: applicationMethodSchema,
    metadata: freeformJsonObject.nullable(),
    status: jobStatusSchema,
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  }),
  {
    id: "JobRecord",
    description:
      "One user-owned job row exactly as stored (jobs table). `metadata` is a free-form JSON object.",
  },
);

/** `GET /jobs` 200 body. */
export const jobListResponseSchema = responseComponent(
  z.object({
    jobs: z.array(jobRecordSchema),
    count: z.int(),
  }),
  {
    id: "JobListResponse",
    description:
      "Page of the user's jobs ordered by createdAt descending. `count` is the page size, not the total.",
  },
);

/** `GET /jobs/:id` 200 body. */
export const jobResponseSchema = responseComponent(
  z.object({
    job: jobRecordSchema,
  }),
  {
    id: "JobResponse",
    description: "Single job read scoped to the authenticated user.",
  },
);

/** `POST /jobs/:id/prepare` 200 body. */
export const prepareJobResponseSchema = responseComponent(
  z.object({
    ok: z.literal(true),
    applicationId: uuidString,
    packStatus: z.enum(["queued", "generating", "ready"]),
  }),
  {
    id: "PrepareJobResponse",
    description:
      "The stable application identity and current durable pack preparation status.",
  },
);

/**
 * `GET /jobs` query parameters, described post-coercion: the server coerces
 * query strings with `z.coerce.number()`; the contract documents the accepted
 * numeric domain and defaults.
 */
export const listJobsQuery = {
  // Requiredness lives on the operation descriptor, so parameter schemas stay
  // bare (no .optional() wrappers).
  status: jobStatusSchema
    .exclude(["waiting_for_user_input"])
    .describe("Filter to a single worker status."),
  listingId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,200}$/)
    .describe("Filter to the jobs saved for one listing id, or the job with that id."),
  limit: z
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe("Page size (coerced from the query string)."),
  offset: z
    .int()
    .min(0)
    .default(0)
    .describe("Row offset (coerced from the query string)."),
};
