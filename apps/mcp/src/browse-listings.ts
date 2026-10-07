import { createHash } from "node:crypto";
import {
  appliedLocationFilterSchema,
  listingInventoryResponseSchema,
  listingsResponseSchema,
  type PublicListing,
} from "@jobless/api-contracts";
import {
  JOB_FUNCTIONS,
  LISTING_INDUSTRIES,
  MATCH_SENIORITIES,
  WORK_SETTINGS,
  canonicalListingIndustry,
  type JobFunction,
  type MatchSeniority,
  type WorkSetting,
} from "@jobless/assistant-contracts";
import { z } from "zod";

/**
 * `browse_listings`: every filter the web's job board has, over the whole
 * index, paged by a cursor the agent passes back.
 *
 * Two walks, because `GET /listings` has two. Unsorted, the tool uses the
 * route's inventory cursor, which covers every match in id order and excludes
 * rows added after the walk began. Sorted, it pages by offset, which the route
 * caps at 1,000. The agent sees one opaque cursor either way; it carries a
 * digest of the search it belongs to, so a cursor sent with other filters is
 * refused here instead of silently continuing a different walk.
 */

/**
 * Where the person's job page lives. The web origin is a published-artifact
 * default like the API origin in stdio.ts, overridable for preview
 * environments with the same env-name convention (DREAMWORK_WEB_URL).
 */
const DREAMWORK_WEB_ORIGIN =
  process.env.DREAMWORK_WEB_URL?.replace(/\/+$/, "") ?? "https://www.dreamworkhq.com";

/** The listing's page on Dreamwork - the link an agent gives the person. */
export function dreamworkJobUrl(listingId: string): string {
  return `${DREAMWORK_WEB_ORIGIN}/job/${listingId}`;
}

const BROWSE_SORTS = ["newest", "pay_high", "pay_low", "featured"] as const;
type BrowseSort = (typeof BROWSE_SORTS)[number];

const API_SORT: Record<BrowseSort, string> = {
  newest: "newest",
  pay_high: "comp-desc",
  pay_low: "comp-asc",
  featured: "featured",
};

/** The route stops offset pages here (`MAX_LISTINGS_OFFSET`). */
const SORTED_WALK_LIMIT = 1000;

/** The API's default page size for a sorted browse when no limit is sent. */
const DEFAULT_SORTED_PAGE_SIZE = 25;

/** The largest `limit` the route honors on any plan. */
const MAX_BROWSE_PAGE_SIZE = 100;

/**
 * The route clamps `limit` to the caller's plan (`listingsPerPage` in
 * `PLAN_ENTITLEMENTS`, `@jobless/shared`). This is the free plan's value,
 * which a keyless call also gets; the published bundle cannot import that
 * package, so the number is restated here.
 */
const FREE_PLAN_BROWSE_PAGE_SIZE = 25;

/** How `browse_listings` pages, for the tool description. */
export const BROWSE_PAGING_HINT = `A page holds ${DEFAULT_SORTED_PAGE_SIZE} listings by default and limit accepts up to ${MAX_BROWSE_PAGE_SIZE}, which the API clamps to ${FREE_PLAN_BROWSE_PAGE_SIZE} without a key or on the free plan; the next page is the previous nextCursor.`;

/**
 * Annual US dollars. Under 1,000 is refused rather than read as thousands:
 * 1.x of this tool took thousands, and a figure that means $200k to one agent
 * and $200 to the route filters silently.
 */
const annualDollars = (what: string) =>
  z
    .int()
    .min(1000, {
      error: `${what} is in whole annual US dollars, e.g. 200000 for $200k.`,
    });

export const browseListingsInputSchema = z.object({
  search: z
    .string()
    .max(200)
    .optional()
    .describe("Words in the job title or company name."),
  company: z.string().max(120).optional().describe("Company name or domain."),
  function: z
    .array(z.enum(JOB_FUNCTIONS))
    .min(1)
    .max(JOB_FUNCTIONS.length)
    .optional()
    .describe("Job functions to keep, as a union."),
  seniority: z
    .array(z.enum(MATCH_SENIORITIES))
    .min(1)
    .max(MATCH_SENIORITIES.length)
    .optional()
    .describe("Seniority levels to keep, as a union."),
  workSettings: z
    .array(z.enum(WORK_SETTINGS))
    .min(1)
    .max(WORK_SETTINGS.length)
    .optional()
    .describe(
      "Work settings to keep, as a union. A posting that states none counts as onsite.",
    ),
  remote: z
    .boolean()
    .optional()
    .describe('Shorthand for workSettings ["remote"].'),
  location: z
    .string()
    .max(120)
    .optional()
    .describe(
      "City, region, or country. Remote roles open to that country match too. A place Dreamwork cannot resolve is refused.",
    ),
  internship: z
    .boolean()
    .optional()
    .describe("Internships, co-ops, and apprenticeships only."),
  aiRole: z.boolean().optional().describe("AI-focused roles only."),
  postedWithinDays: z
    .int()
    .min(1)
    .max(90)
    .optional()
    .describe("Employer posting date within this many days."),
  minSalary: annualDollars("minSalary")
    .optional()
    .describe(
      "Pay floor in whole annual US dollars, e.g. 200000. A listing passes when its posted band reaches it; listings with no posted pay drop out.",
    ),
  maxSalary: annualDollars("maxSalary")
    .optional()
    .describe("Pay ceiling in whole annual US dollars."),
  equity: z.boolean().optional().describe("Only postings offering equity."),
  bonus: z.boolean().optional().describe("Only postings offering a bonus."),
  healthcare: z
    .boolean()
    .optional()
    .describe("Only postings offering healthcare."),
  industry: z
    .string()
    .max(60)
    .optional()
    .describe(
      `Employer industry. One of: ${LISTING_INDUSTRIES.join(", ")}.`,
    ),
  addedAfter: z.iso
    .datetime({ offset: true })
    .optional()
    .describe("Only listings Dreamwork first saw after this ISO date-time."),
  sort: z
    .enum(BROWSE_SORTS)
    .optional()
    .describe(
      "Order. Omit it to walk every match in a stable, unranked order; any sort stops the walk at 1,000.",
    ),
  cursor: z
    .string()
    .max(1024)
    .optional()
    .describe(
      "`nextCursor` from the previous page. Send the same filters and sort, or it is refused.",
    ),
  limit: z
    .int()
    .min(1)
    .max(MAX_BROWSE_PAGE_SIZE)
    .optional()
    .describe(
      `Page size, ${DEFAULT_SORTED_PAGE_SIZE} when omitted. Without a key or on the free plan the API caps it at ${FREE_PLAN_BROWSE_PAGE_SIZE}.`,
    ),
});

export type BrowseListingsArgs = z.output<typeof browseListingsInputSchema>;

const browseListingSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string().nullable(),
  workSetting: z
    .enum(WORK_SETTINGS)
    .nullable()
    .describe("Null when the posting does not say; the onsite filter includes those."),
  salary: z.string().nullable(),
  salaryMin: z.int().nullable().describe("Bottom of the posted band, annual USD."),
  salaryMax: z.int().nullable().describe("Top of the posted band, annual USD."),
  postedAt: z.string().nullable(),
  firstSeenAt: z
    .string()
    .describe("When Dreamwork first saw the listing; `addedAfter` compares this."),
  url: z
    .string()
    .describe(
      "The listing's page on Dreamwork. Give the person this link; it carries the full description, pay, and apply flow.",
    ),
  sourceUrl: z
    .string()
    .nullable()
    .describe(
      "The employer's own posting URL. Give it only when the person asks for the direct link.",
    ),
});

const appliedBrowseFilters = z
  .object({
    search: z.string(),
    company: z.string(),
    functions: z.array(z.enum(JOB_FUNCTIONS)),
    seniorities: z.array(z.enum(MATCH_SENIORITIES)),
    workSettings: z.array(z.enum(WORK_SETTINGS)),
    location: appliedLocationFilterSchema,
    internship: z.literal(true),
    aiRole: z.literal(true),
    postedWithinDays: z.int(),
    minSalary: z.int(),
    maxSalary: z.int(),
    equity: z.literal(true),
    bonus: z.literal(true),
    healthcare: z.literal(true),
    industry: z.string(),
    addedAfter: z.string(),
    sort: z.enum(BROWSE_SORTS),
  })
  .partial();

export const browseListingsOutputSchema = z.object({
  listings: z.array(browseListingSchema),
  nextCursor: z
    .string()
    .nullable()
    .describe("Pass it back with the same filters for the next page; null means done."),
  total: z
    .int()
    .nullable()
    .describe(
      "Matching listings counted up to 1,000 for a sorted walk; null for an unsorted walk, which is not counted.",
    ),
  totalCapped: z.boolean().nullable(),
  /**
   * The clamped page size the API selected for this page: what the caller's
   * limit became after the plan cap. A sorted walk's next page starts after
   * this many rows, not after the rows received (a row that retired
   * mid-page makes the page short), so an agent that pages by what it
   * received instead repeats a listing.
   */
  pageSize: z
    .int()
    .nullable()
    .describe(
      "Rows this page was allocated by the API after plan clamping; advance a sorted walk by this, never by the rows received.",
    ),
  appliedFilters: appliedBrowseFilters,
  notes: z.array(z.string()),
});

export type BrowseListingsOutput = z.output<typeof browseListingsOutputSchema>;

/** One search, normalized, so two calls that mean the same search agree. */
interface BrowseSearch {
  search: string | null;
  company: string | null;
  functions: JobFunction[];
  seniorities: MatchSeniority[];
  workSettings: WorkSetting[];
  location: string | null;
  internship: boolean;
  aiRole: boolean;
  postedWithinDays: number | null;
  minSalaryK: number | null;
  maxSalaryK: number | null;
  equity: boolean;
  bonus: boolean;
  healthcare: boolean;
  industry: string | null;
  addedAfter: string | null;
  sort: BrowseSort | null;
}

export type BrowseRefusal = { ok: false; error: string };

export function normalizeBrowseSearch(
  args: BrowseListingsArgs,
): { ok: true; search: BrowseSearch } | BrowseRefusal {
  const industryText = args.industry?.trim() ?? "";
  const industry = industryText ? canonicalListingIndustry(industryText) : null;
  if (industryText && !industry) {
    return {
      ok: false,
      error: `"${industryText}" is not an industry Dreamwork filters by. The industries are: ${LISTING_INDUSTRIES.join(", ")}.`,
    };
  }

  let workSettings: WorkSetting[] = [...new Set(args.workSettings ?? [])].sort();
  if (args.remote) {
    if (workSettings.length > 0 && workSettings.join() !== "remote") {
      return {
        ok: false,
        error: `remote asks for remote roles only, but workSettings asks for ${workSettings.join(", ")}. Send one of the two.`,
      };
    }
    workSettings = ["remote"];
  }
  if (workSettings.length === WORK_SETTINGS.length) workSettings = [];

  // Whole thousands, rounded outward so nothing inside the asked range is
  // excluded by the rounding.
  let minSalaryK =
    args.minSalary !== undefined ? Math.floor(args.minSalary / 1000) : null;
  let maxSalaryK =
    args.maxSalary !== undefined ? Math.ceil(args.maxSalary / 1000) : null;
  if (minSalaryK != null && maxSalaryK != null && maxSalaryK < minSalaryK) {
    [minSalaryK, maxSalaryK] = [maxSalaryK, minSalaryK];
  }

  return {
    ok: true,
    search: {
      search: args.search?.trim() || null,
      company: args.company?.trim() || null,
      functions: [...new Set(args.function ?? [])].sort(),
      seniorities: [...new Set(args.seniority ?? [])].sort(),
      workSettings,
      location: args.location?.trim() || null,
      internship: args.internship === true,
      aiRole: args.aiRole === true,
      postedWithinDays: args.postedWithinDays ?? null,
      minSalaryK,
      maxSalaryK,
      equity: args.equity === true,
      bonus: args.bonus === true,
      healthcare: args.healthcare === true,
      industry,
      addedAfter: args.addedAfter
        ? new Date(args.addedAfter).toISOString()
        : null,
      sort: args.sort ?? null,
    },
  };
}

function searchDigest(search: BrowseSearch): string {
  return createHash("sha256")
    .update(JSON.stringify(search))
    .digest("base64url")
    .slice(0, 22);
}

type BrowseCursor =
  | { v: 1; f: string; m: "inventory"; c: string }
  | { v: 1; f: string; m: "offset"; o: number };

const browseCursorSchema = z.discriminatedUnion("m", [
  z.object({
    v: z.literal(1),
    f: z.string(),
    m: z.literal("inventory"),
    c: z.string().min(1).max(512),
  }),
  z.object({
    v: z.literal(1),
    f: z.string(),
    m: z.literal("offset"),
    o: z.int().min(0).max(SORTED_WALK_LIMIT),
  }),
]);

function encodeCursor(cursor: BrowseCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(raw: string): BrowseCursor | null {
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const parsed = browseCursorSchema.safeParse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The request for one page: the route path, the schema its body decodes
 * through, and where the walk stands. Refuses a cursor it did not issue or one
 * issued for a different search.
 */
export function browseRequest(
  args: BrowseListingsArgs,
):
  | {
      ok: true;
      search: BrowseSearch;
      digest: string;
      path: string;
      offset: number | null;
      askedLimit: number;
    }
  | BrowseRefusal {
  const normalized = normalizeBrowseSearch(args);
  if (!normalized.ok) return normalized;
  const { search } = normalized;
  const digest = searchDigest(search);

  let cursor: BrowseCursor | null = null;
  if (args.cursor !== undefined) {
    cursor = decodeCursor(args.cursor);
    if (!cursor) {
      return {
        ok: false,
        error:
          "That cursor is not one browse_listings issued. Call again without a cursor to start from the first page.",
      };
    }
    if (cursor.f !== digest) {
      return {
        ok: false,
        error:
          "That cursor belongs to a different search: the filters or sort changed since it was issued. Send exactly the filters and sort of the call that returned it, or call again without a cursor to start over.",
      };
    }
  }

  const params = new URLSearchParams();
  if (search.search) params.set("search", search.search);
  if (search.company) params.set("company", search.company);
  if (search.functions.length) params.set("function", search.functions.join(","));
  if (search.seniorities.length) {
    params.set("seniority", search.seniorities.join(","));
  }
  if (search.workSettings.length) {
    params.set("workType", search.workSettings.join(","));
  }
  if (search.location) params.set("location", search.location);
  if (search.internship) params.set("internship", "true");
  if (search.aiRole) params.set("aiRole", "true");
  if (search.postedWithinDays != null) {
    params.set("postedWithin", String(search.postedWithinDays));
  }
  if (search.minSalaryK != null) params.set("minSalary", String(search.minSalaryK));
  if (search.maxSalaryK != null) params.set("maxSalary", String(search.maxSalaryK));
  if (search.equity) params.set("equity", "true");
  if (search.bonus) params.set("bonus", "true");
  if (search.healthcare) params.set("healthcare", "true");
  if (search.industry) params.set("industry", search.industry);
  if (search.addedAfter) params.set("addedAfter", search.addedAfter);
  if (args.limit !== undefined) params.set("limit", String(args.limit));

  let offset: number | null = null;
  if (search.sort) {
    offset = cursor?.m === "offset" ? cursor.o : 0;
    params.set("sort", API_SORT[search.sort]);
    params.set("offset", String(offset));
  } else {
    params.set("pagination", "cursor");
    if (cursor?.m === "inventory") params.set("cursor", cursor.c);
  }
  return {
    ok: true,
    search,
    digest,
    path: `/listings?${params}`,
    offset,
    // What a short page must still advance by: the size that was asked for.
    askedLimit: args.limit ?? DEFAULT_SORTED_PAGE_SIZE,
  };
}

function workSetting(remoteType: string | null): WorkSetting | null {
  const value = remoteType?.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (value === "remote" || value === "hybrid" || value === "onsite") {
    return value;
  }
  return null;
}

function project(listing: PublicListing): z.output<typeof browseListingSchema> {
  return {
    id: listing.id,
    title: listing.title,
    company: listing.companyName,
    location: listing.location,
    workSetting: workSetting(listing.remoteType),
    salary: listing.salary,
    salaryMin: listing.salaryMin,
    salaryMax: listing.salaryMax,
    postedAt: listing.postedAt,
    firstSeenAt: listing.firstSeenAt,
    // The Dreamwork page is the link the person gets by default; the direct
    // posting link rides alongside for the explicit ask.
    url: dreamworkJobUrl(listing.id),
    sourceUrl: listing.sourceUrl,
  };
}

function appliedFilters(
  search: BrowseSearch,
  location: z.output<typeof appliedLocationFilterSchema> | null,
): z.output<typeof appliedBrowseFilters> {
  const applied: z.output<typeof appliedBrowseFilters> = {};
  if (search.search) applied.search = search.search;
  if (search.company) applied.company = search.company;
  if (search.functions.length) applied.functions = search.functions;
  if (search.seniorities.length) applied.seniorities = search.seniorities;
  if (search.workSettings.length) applied.workSettings = search.workSettings;
  if (location) applied.location = location;
  if (search.internship) applied.internship = true;
  if (search.aiRole) applied.aiRole = true;
  if (search.postedWithinDays != null) {
    applied.postedWithinDays = search.postedWithinDays;
  }
  if (search.minSalaryK != null) applied.minSalary = search.minSalaryK * 1000;
  if (search.maxSalaryK != null) applied.maxSalary = search.maxSalaryK * 1000;
  if (search.equity) applied.equity = true;
  if (search.bonus) applied.bonus = true;
  if (search.healthcare) applied.healthcare = true;
  if (search.industry) applied.industry = search.industry;
  if (search.addedAfter) applied.addedAfter = search.addedAfter;
  if (search.sort) applied.sort = search.sort;
  return applied;
}

type InventoryPage = z.output<typeof listingInventoryResponseSchema>;
type OffsetPage = z.output<typeof listingsResponseSchema>;

/** The agent's page, or a refusal when the route could not apply a filter. */
export function browseResult(
  request: {
    search: BrowseSearch;
    digest: string;
    offset: number | null;
    /** Page size this call asked the API for: the cursor advances by it. */
    askedLimit: number;
  },
  page: InventoryPage | OffsetPage,
): { ok: true; output: BrowseListingsOutput } | BrowseRefusal {
  const { search, digest } = request;
  if (search.location && !page.locationFilter) {
    return {
      ok: false,
      error: `"${search.location}" is not a place Dreamwork recognizes. Try a city, region, or country name, like "New York" or "Germany".`,
    };
  }

  const notes: string[] = [];
  let nextCursor: string | null = null;
  let total: number | null = null;
  let totalCapped: boolean | null = null;
  let pageSize: number | null = null;
  if ("nextCursor" in page) {
    nextCursor = page.nextCursor
      ? encodeCursor({ v: 1, f: digest, m: "inventory", c: page.nextCursor })
      : null;
    if (page.walkCapped) {
      // The API capped this walk because it is keyless: without a key the
      // unsorted inventory serves at most 1,000 rows per walk. The note names
      // the fix rather than letting "no nextCursor" read as "everything".
      notes.push(
        "This walk served its 1,000-listing guest limit and stopped early. Add a Dreamwork API key to walk every match.",
      );
    }
  } else {
    total = page.total;
    totalCapped = page.totalCapped;
    // `pageSize` is what the API selected after clamping the asked limit to
    // the plan cap: the exact span of the ordering this page owns. Advance
    // by it, never by the rows received: a row that retired during hydration
    // makes the page short, and advancing by fewer would serve it twice.
    const asked = page.pageSize ?? request.askedLimit;
    pageSize = asked;
    const next = (request.offset ?? 0) + asked;
    const end = Math.min(page.total, SORTED_WALK_LIMIT);
    nextCursor =
      page.listings.length > 0 && next < end
        ? encodeCursor({ v: 1, f: digest, m: "offset", o: next })
        : null;
    if (nextCursor === null && page.totalCapped) {
      notes.push(
        "A sorted walk stops at 1,000 listings and more match. Leave sort unset to walk every match.",
      );
    }
  }
  if (search.minSalaryK != null || search.maxSalaryK != null) {
    notes.push(
      "Pay filters compare each listing's posted band: a listing passes when its band overlaps the range (a $150k-$210k band passes a $200k floor), and listings with no posted pay are left out.",
    );
  }

  return {
    ok: true,
    output: {
      listings: page.listings.map(project),
      nextCursor,
      total,
      totalCapped,
      pageSize,
      appliedFilters: appliedFilters(search, page.locationFilter),
      notes,
    },
  };
}
