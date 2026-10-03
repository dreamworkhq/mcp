import { z } from "zod";
import { responseComponent } from "../registry.js";
import { isoDateTime } from "./common.js";

export const listingStatsSchema = responseComponent(
  z.object({
    activeJobs: z
      .int()
      .nonnegative()
      .describe(
        "Number of listings with status active, including duplicates and listings outside public serving eligibility. Shared corpus observation, refreshed by the existing metric rollup worker.",
      ),
    computedAt: isoDateTime.describe(
      "UTC time at which the active-job count was observed. Observations older than one hour are unavailable.",
    ),
  }),
  {
    id: "ListingStats",
    description:
      "Canonical active-job observation shared by Research, admin, and reports. The API fails closed when the scheduled observation becomes stale.",
  },
);

export const publicStatsSchema = responseComponent(
  z.object({
    activeRoles: z
      .int()
      .nonnegative()
      .describe(
        "Compatibility name for ListingStats.activeJobs; uses the same stored observation.",
      ),
    computedAt: isoDateTime,
    companies: z.int().nonnegative(),
    packsCreated: z.int().nonnegative(),
  }),
  {
    id: "PublicStats",
    description:
      "Public product statistics. computedAt describes the active-job observation only.",
  },
);
