import { z } from "zod";
import { responseComponent } from "../registry.js";
import { isoDateTime, uuidString } from "./common.js";

/**
 * Listing wire contracts for the two product read surfaces:
 * `GET /listings` (public corpus browse) and `GET /listings/recommended`
 * (personalized feed).
 *
 * Both are exact field allowlists. The recommended feed in particular used to
 * answer with a `{ ...candidate, ...display }` spread, which made the wire
 * shape a side effect of whatever the retrieval queries happened to SELECT.
 * `apps/api/src/api-lib/recommended-listing-response.ts` is now the projection and
 * this schema is its wire twin: no scoring or readiness internal
 * (`semanticScore`, `requirements`, `companyIndustry`, `descriptionQuality`,
 * `classifiedAt`, `enrichedAt`, `embeddedAt`) appears in either.
 */

const remoteEligibilityConfidence = z.enum(["high", "low"]);

const verifiedSalaryIsOte = z
  .boolean()
  .nullable()
  .describe(
    "Verified pay type of a source-provided salary: true for OTE, false for base pay. Null when no verified verdict exists, including every estimate.",
  );

/** Public browse listing card (`mapPublicListingRow` over the list select). */
export const publicListingSchema = responseComponent(
  z.object({
    id: uuidString,
    title: z.string(),
    // Resolved employer label: the raw corpus attribution never ships.
    companyName: z.string(),
    companyDomain: z.string().nullable(),
    companyLogoUrl: z.string().nullable(),
    companyDescription: z.string().nullable(),
    isDreamwork500: z.boolean(),
    location: z.string().nullable(),
    locationCountryCode: z.string().nullable(),
    remoteType: z.string().nullable(),
    remoteEligibilityCountries: z.array(z.string()).nullable(),
    remoteEligibilitySource: z
      .enum(["parsed", "ats", "application", "llm", "manual", "source_scope"])
      .nullable(),
    remoteEligibilityConfidence: remoteEligibilityConfidence.nullable(),
    salary: z.string().nullable(),
    salaryMin: z.int().nullable(),
    salaryMax: z.int().nullable(),
    salarySource: z.string().nullable(),
    salaryCurrency: z.string().nullable(),
    salaryPeriod: z.string().nullable(),
    salaryLocalMin: z.int().nullable(),
    salaryLocalMax: z.int().nullable(),
    salaryIsOte: verifiedSalaryIsOte,
    department: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    platform: z.string(),
    postedAt: isoDateTime.nullable(),
    sourceUpdatedAt: isoDateTime.nullable(),
    // When Dreamwork first saw the posting; `addedAfter` filters on it.
    firstSeenAt: isoDateTime,
    createdAt: isoDateTime,
    functionPrimary: z.string().nullable(),
    seniorityLevel: z.string().nullable(),
    techStack: z.array(z.string()).nullable(),
    hasEquity: z.boolean().nullable(),
    hasBonus: z.boolean().nullable(),
    hasHealthcare: z.boolean().nullable(),
    isAiRole: z.boolean().nullable(),
    aiRoleKind: z.string().nullable(),
    aiRoleConfidence: z.number().nullable(),
    aiRoleReason: z.string().nullable(),
  }),
  {
    id: "PublicListing",
    description:
      "One public browse listing card. Description bodies, staleness signals, and enrichment evidence belong to the single-listing detail route, not this list.",
  },
);

/** Country scoping actually applied to a browse request, echoed for the chip UI. */
export const appliedLocationSchema = responseComponent(
  z.object({
    countryCode: z.string(),
    source: z.enum(["param", "search", "geo"]),
  }),
  {
    id: "AppliedBrowseLocation",
    description:
      "Country filter the server applied and why: an explicit param, one inferred from the search text, or the request's coarse edge geo.",
  },
);

/**
 * The place a `location` filter resolved to. Null when no label was sent or
 * the label resolved to no place, in which case the route served the set
 * WITHOUT a location filter; a caller that sent one and reads null must not
 * present the page as filtered.
 */
export const appliedLocationFilterSchema = responseComponent(
  z.object({
    kind: z.enum(["radius", "region", "country", "countries"]),
    city: z.string().nullable(),
    regionCode: z.string().nullable(),
    // Null only for the `countries` kind, which names its codes in countryCodes.
    countryCode: z.string().nullable(),
    /** Present only when `kind` is `countries`: the ISO codes the area covers. */
    countryCodes: z.array(z.string()).nullable(),
    radiusKm: z
      .number()
      .nullable()
      .describe("Distance around the city for a radius filter; null otherwise."),
  }),
  {
    id: "AppliedLocationFilter",
    description:
      "Where the request's location label resolved: a city radius, an ISO region, an ISO country, or a named multi-country area (kind `countries`, whose ISO codes are in `countryCodes`). Remote roles open to that place also match. Null when the label named no place: the page is NOT location-filtered and the caller must not present it as filtered.",
  },
);

/** `GET /listings` 200 body. */
export const listingsResponseSchema = responseComponent(
  z.object({
    listings: z.array(publicListingSchema),
    count: z
      .int()
      .describe(
        "Deprecated alias of `total`, kept for existing consumers. NOT the number of rows in `listings` — a request with limit=3 returns count=1000 alongside 3 rows. Read `listings.length` for the page size.",
      ),
    total: z
      .int()
      .describe(
        "Matching listings, counted up to a cap of 1000. When `totalCapped` is true this is the cap, not the true total.",
      ),
    totalCapped: z
      .boolean()
      .describe(
        "True when matches reached the 1000 cap, so `total` understates reality. Present so a client can render '1000+' rather than a wrong exact number.",
      ),
    pageSize: z
      .int()
      .min(1)
      .describe(
        "The clamped page size this request selected: what the server actually fetched rows for, after the caller's limit was clamped to the plan cap. A short page means rows retired during hydration, not that fewer were selected. A paging client advances its offset by this, never by the row count it received, or a row that retired mid-page is served twice.",
      ),
    appliedLocation: appliedLocationSchema.nullable(),
    locationFilter: appliedLocationFilterSchema.nullable(),
  }),
  { id: "ListingsResponse", description: "Public listing browse page." },
);

/** Opt-in machine inventory page; completion is nextCursor=null, not a count. */
export const listingInventoryResponseSchema = responseComponent(
  z.object({
    listings: z.array(publicListingSchema),
    nextCursor: z.string().nullable(),
    /** Present (true) only when a keyless walk was cut short at the 1000-row guest cap; signing in lifts it. */
    walkCapped: z.boolean().optional(),
    appliedLocation: appliedLocationSchema.nullable(),
    locationFilter: appliedLocationFilterSchema.nullable(),
  }),
  { id: "ListingInventoryResponse", description: "Bounded UUID-ordered inventory page. Rows inserted after the first request are excluded; current serving eligibility is rechecked on every page. This is not a transactional snapshot. A keyless (unauthenticated) walk serves at most 1000 rows across all its pages and ends with walkCapped=true; an authenticated walk is bounded only by its plan's hourly request allowance." },
);

export const listingsPageResponseSchema = responseComponent(
  z.union([listingsResponseSchema, listingInventoryResponseSchema]),
  { id: "ListingsPageResponse", description: "Offset browse or opt-in cursor inventory response." },
);

/** One personalized recommendation card (`toRecommendedListingResponse`). */
export const recommendedListingSchema = responseComponent(
  z.object({
    id: uuidString,
    title: z.string(),
    companyName: z.string(),
    companyDomain: z.string().nullable(),
    companyLogoUrl: z.string().nullable(),
    companyDescription: z.string().nullable(),
    location: z.string().nullable(),
    locationCity: z.string().nullable(),
    locationState: z.string().nullable(),
    locationCountry: z.string().nullable(),
    remoteType: z.string().nullable(),
    remoteEligibilityCountries: z.array(z.string()).nullable(),
    remoteEligibilityConfidence: remoteEligibilityConfidence.nullable(),
    salary: z.string().nullable(),
    salaryMin: z.int().nullable(),
    salaryMax: z.int().nullable(),
    salarySource: z.string().nullable(),
    salaryCurrency: z.string().nullable(),
    salaryPeriod: z.string().nullable(),
    salaryLocalMin: z.int().nullable(),
    salaryLocalMax: z.int().nullable(),
    salaryIsOte: verifiedSalaryIsOte,
    department: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    platform: z.string().nullable(),
    postedAt: isoDateTime.nullable(),
    sourceUpdatedAt: isoDateTime.nullable(),
    firstSeenAt: isoDateTime.nullable(),
    createdAt: isoDateTime,
    functionPrimary: z.string().nullable(),
    seniorityLevel: z.string().nullable(),
    techStack: z.array(z.string()).nullable(),
    employmentType: z.string().nullable(),
    hasEquity: z.boolean().nullable(),
    hasBonus: z.boolean().nullable(),
    hasHealthcare: z.boolean().nullable(),
    accessibilityScore: z.int().nullable(),
    isAiRole: z.boolean().nullable(),
    aiRoleKind: z.string().nullable(),
    aiRoleConfidence: z.number().nullable(),
    aiRoleReason: z.string().nullable(),
    matchScore: z
      .number()
      .describe(
        "Raw blended match score. Read `scoringVersion` to pick the display curve.",
      ),
    matchReasons: z.array(z.string()),
    isNew: z.boolean(),
  }),
  {
    id: "RecommendedListing",
    description:
      "One personalized recommendation card. Scoring and readiness internals stay server-side; only matchScore/matchReasons are exposed.",
  },
);

/**
 * Fixed-vocabulary, integer-only serving diagnostics mirrored from the
 * Server-Timing header (Vercel's external rewrite can strip it). No user,
 * search, location, or cache-key data is carried.
 */
export const recommendationTimingSchema = responseComponent(
  z.object({
    totalMs: z.int(),
    prefetchMs: z.int(),
    persistedMs: z.int(),
    semanticMs: z.int(),
    fallbackMs: z.int(),
    hydrateMs: z.int(),
    cacheTier: z.enum([
      "l1",
      "l2",
      "l2-grace",
      "live",
      "fast-serve",
      "coalesced-live",
      "pending",
    ]),
  }),
  {
    id: "RecommendationTiming",
    description:
      "Which layer served the candidate pool and how long each retrieval stage took, in milliseconds.",
  },
);

/** `GET /listings/recommended` 200 body. */
export const recommendedListingsResponseSchema = responseComponent(
  z.object({
    listings: z.array(recommendedListingSchema),
    count: z.int(),
    totalAvailable: z.int(),
    requestedLimit: z.int(),
    requestedOffset: z.int(),
    candidatePoolCount: z.int(),
    newListingsCount: z.int(),
    semantic: z.boolean(),
    /**
     * "pending": a signed-in account has no profile embedding and no
     * persisted pool yet, so no rows are served (the web keeps its processing
     * state and re-polls). "ready" everywhere else, including guest and
     * filtered feeds that legitimately serve the fallback lane.
     */
    poolStatus: z.enum(["ready", "pending"]),
    /**
     * False when the pool is not the one built for the current profile
     * version: a version-grace serve of an older pool, the cold fast-serve
     * fallback, a pending pool, or an in-memory cache hit on an entry either
     * fast path seeded (provisional until the background recompute replaces
     * it). A recompute is converging; callers that show a one-shot count keep
     * polling until this is true. True does not imply `semantic`: a fresh
     * pool can still be the fallback feed when semantic retrieval failed or
     * the profile has no embedding.
     */
    poolFresh: z.boolean(),
    /**
     * What the rows are, in one field. "final": ranked, the pool built for
     * the current profile. "provisional": ranked rows from the first pass of
     * a build that is still running; the final pool keeps them in this order
     * and adds rows after them, so totals and `poolVersion` are not final yet
     * (`semantic` is true and `poolFresh` false). "building": no rows yet
     * because a pool is being built (`poolStatus: "pending"`, or an
     * `awaitRanked` request whose build has nothing to show). "fallback":
     * newest-first rows, not ranked. "refreshing": a ranked pool of an older
     * profile version, which the rebuild replaces. "provisional" and the
     * `awaitRanked` "building" are sent only when first-pass serving is on.
     */
    ranking: z.enum([
      "final",
      "provisional",
      "building",
      "fallback",
      "refreshing",
    ]),
    /**
     * Milliseconds the answering API replica has been answering an
     * `awaitRanked` request for this pool with "building"; 0 for every
     * other response. The server stops after 60 seconds and sends the
     * newest-first page, so a client deadline belongs below that.
     */
    rankingBuildingMs: z.int(),
    hiddenByEligibility: z
      .int()
      .describe(
        "Deprecated, always 0. Kept for existing API consumers; the per-request corpus count behind it was removed.",
      ),
    scoringVersion: z.int(),
    /**
     * Identity of the pool this page was cut from: a digest of the listing
     * ids left after the person's exclusions. Offset pages form one walk only
     * while it holds; a rebuild, a newly saved or dismissed role, or a retired
     * listing changes it, and a client paging by offset may then see a repeat
     * or a skip.
     */
    poolVersion: z.string(),
    locationFilter: appliedLocationFilterSchema.nullable(),
    recommendationTiming: recommendationTimingSchema,
  }),
  {
    id: "RecommendedListingsResponse",
    description: "Personalized listing recommendation page.",
  },
);

const csv = (field: string) =>
  `Comma-separated ${field} values; matched as a union.`;

const truthy =
  'Truthy when the value is "true", "1", or "yes"; any other value is treated as unset.';

const addedAfterDescription =
  "Only listings that entered Dreamwork's index after this ISO 8601 date-time; a malformed value is a 400. A listing can become servable hours after it was first seen, so a poller overlaps its window and drops ids it has already seen.";

/** `GET /listings` query parameters (post-coercion domain). */
export const listListingsQuery = {
  pagination: z.literal("cursor").describe("Opt in to count-free inventory pagination beyond the browse offset ceiling. Cannot combine with offset, sort, or automatic geo."),
  cursor: z.string().max(512).describe("Opaque continuation from the previous inventory page; reuse the same filters. Null nextCursor completes the walk, even when a page is short or empty."),
  limit: z
    .int()
    .min(1)
    .default(25)
    .describe(
      "Page size. The ceiling is plan-owned (anonymous callers get the Free cap) and larger values are clamped, not rejected.",
    ),
  offset: z
    .int()
    .min(0)
    .default(0)
    .describe(
      "Row offset. Results are capped at 1000, so deeper offsets return an empty page with an honest total.",
    ),
  search: z.string().describe("Free-text search over title/company/location."),
  remote: z.string().describe(`Remote-only filter. ${truthy}`),
  workType: z.string().describe(csv("remote_type")),
  location: z.string().describe("Display label for a structured location filter. Sent alone, it resolves as a named area (\"Europe\", \"European Union\", \"Southern Europe\") or through the gazetteer."),
  locationCity: z.string().describe("Resolved city label for the location filter."),
  locationRegionCode: z.string().describe("Resolved ISO-3166-2 subdivision code for the location filter."),
  locationCountryCode: z.string().regex(/^[A-Z]{2}$/).describe("Resolved ISO-3166-1 alpha-2 country code for the location filter."),
  locationLat: z.number().min(-90).max(90).describe("Resolved latitude for the 50 km city-radius filter."),
  locationLng: z.number().min(-180).max(180).describe("Resolved longitude for the 50 km city-radius filter."),
  country: z
    .string()
    .describe(
      "ISO-3166-1 alpha-2 country filter on the indexed country column; also keeps fully-remote listings.",
    ),
  countryExact: z
    .union([z.string(), z.array(z.string())])
    .describe(
      "Exact country filter for machine consumers; does not union in global-remote listings. Repeatable.",
    ),
  geo: z
    .string()
    .describe(
      'Set to "auto" to default `country` from the request\'s coarse edge geo when no country or location filter was sent.',
    ),
  company: z.string().describe("Company name or domain search."),
  companyDomainExact: z.string().describe("Exact company domain filter."),
  sort: z
    .string()
    .describe(
      'Ordering: "featured" (default browse), "newest", "recent", "comp-desc", "comp-asc", or legacy "salary". Unrecognized values fall back to the default.',
    ),
  function: z.string().describe(csv("function_primary")),
  seniority: z.string().describe(csv("seniority chip label")),
  seniorityExact: z
    .union([z.string(), z.array(z.string())])
    .describe("Exact canonical seniority for machine consumers. Repeatable."),
  dreamwork500: z.string().describe(`Dreamwork-500 companies only. ${truthy}`),
  aiRole: z.string().describe(`AI roles only. ${truthy}`),
  newOnly: z.string().describe(`7-day freshness window. ${truthy}`),
  postedWithin: z
    .int()
    .min(1)
    .max(90)
    .describe(
      "Freshness window in days; generalizes `newOnly` and wins when both are sent.",
    ),
  industry: z.string().describe("Canonical company industry filter."),
  minSalary: z
    .int()
    .describe("Pay floor in thousands of annual USD; keeps listings whose band reaches it."),
  maxSalary: z
    .int()
    .describe("Pay ceiling in thousands of annual USD; keeps listings whose band starts at or under it."),
  equity: z.string().describe(`Equity required. ${truthy}`),
  bonus: z.string().describe(`Bonus required. ${truthy}`),
  healthcare: z.string().describe(`Healthcare required. ${truthy}`),
  internship: z
    .string()
    .describe(
      `Internships, co-ops, and apprenticeships only, detected from employment type, seniority level, or title. ${truthy}`,
    ),
  addedAfter: isoDateTime.describe(addedAfterDescription),
};

/** `GET /listings/recommended` query parameters (post-coercion domain). */
export const recommendedListingsQuery = {
  limit: z
    .int()
    .min(1)
    .max(250)
    .default(200)
    .describe("Page size, clamped to 1-250. Defaults to 200."),
  offset: z.int().min(0).default(0).describe("Row offset. Defaults to 0."),
  aiRole: z.string().describe(`AI roles only. ${truthy}`),
  function: z.string().describe(csv("function_primary")),
  seniority: z.string().describe(csv("seniority chip label")),
  remote: z.string().describe(`Remote-only filter. ${truthy}`),
  workType: z.string().describe(csv("remote_type")),
  search: z.string().describe("Free-text search over the candidate pool."),
  location: z.string().describe("Display label for a structured location filter. Sent alone, it resolves as a named area (\"Europe\", \"European Union\", \"Southern Europe\") or through the gazetteer."),
  locationCity: z.string().describe("Resolved city label for the location filter."),
  locationRegionCode: z.string().describe("Resolved ISO-3166-2 subdivision code for the location filter."),
  locationCountryCode: z.string().regex(/^[A-Z]{2}$/).describe("Resolved ISO-3166-1 alpha-2 country code for the location filter."),
  locationLat: z.number().min(-90).max(90).describe("Resolved latitude for the 50 km city-radius filter."),
  locationLng: z.number().min(-180).max(180).describe("Resolved longitude for the 50 km city-radius filter."),
  industry: z.string().describe("Canonical company industry filter."),
  includeIneligible: z
    .string()
    .describe(
      `Escape hatch that disables the work-eligibility filter. ${truthy}`,
    ),
  awaitRanked: z
    .string()
    .describe(
      'Send "1" to get no rows (ranking "building") instead of newest-first rows while a ranked pool is being built. Ignored for a search, for a sort other than relevance, and unless first-pass serving is on.',
    ),
  minSalary: z
    .int()
    .describe("Pay floor in thousands of annual USD; keeps listings whose band reaches it."),
  maxSalary: z
    .int()
    .describe("Pay ceiling in thousands of annual USD; keeps listings whose band starts at or under it."),
  equity: z.string().describe(`Equity required. ${truthy}`),
  bonus: z.string().describe(`Bonus required. ${truthy}`),
  healthcare: z.string().describe(`Healthcare required. ${truthy}`),
  internship: z
    .string()
    .describe(
      `Internships, co-ops, and apprenticeships only, detected from employment type, seniority level, or title. ${truthy}`,
    ),
  newOnly: z.string().describe(`7-day freshness window. ${truthy}`),
  postedWithin: z
    .int()
    .min(1)
    .max(90)
    .describe(
      "Freshness window in days; generalizes `newOnly` and wins when both are sent.",
    ),
  minScore: z
    .number()
    .describe(
      "Match-quality floor on the raw blended matchScore (0-1). Malformed values are ignored.",
    ),
  sort: z
    .string()
    .describe(
      'Ordering override: "newest", "comp-desc", or "comp-asc". Omit for match-score order.',
    ),
  addedAfter: isoDateTime.describe(addedAfterDescription),
};
