import { z } from "zod";
import { defineAction } from "../action.js";
import { ASSISTANT_EVENTS } from "../events.js";

/**
 * Market-pulse actions: current hiring and layoff context from Dreamwork's
 * research corpus, for an advisor agent answering "where is opportunity
 * moving, and where is it not safe to send someone right now".
 *
 * The executors read the twice-daily precomputed research snapshot (the same
 * source the public /research page serves), so a call is cheap and the data
 * is at most ~12h old. `generatedAt` in each output names the snapshot the
 * figures came from; an agent reads it as evidence that postdates its
 * training data, not as a live count.
 *
 * The schemas and the two projection builders are EXPORTED so the API
 * executor and the MCP package's public (guest-capable) hand-written tools
 * share one shape. The two surfaces drift when one restates the other's
 * payload by hand; sharing the builder makes drifting a reviewable diff.
 */

/** The canonical function slugs the research browse surface filters on. */
export const MARKET_FUNCTION_SLUGS = [
  "engineering",
  "product",
  "design",
  "data-science",
  "sales",
  "marketing",
  "operations",
  "customer-success",
  "finance",
] as const;

export const marketPulseInputSchema = z.object({});

export const marketPulseOutputSchema = z.object({
  generatedAt: z.string().describe("When the underlying snapshot was computed (UTC)."),
  hiring: z.object({
    companiesTracked: z.number(),
    activeRoles: z.number(),
    /** Roles posted or first seen in the last 7 days across tracked companies. */
    newRolesLast7d: z.number(),
    companiesGrowing: z.number(),
    companiesContracting: z.number(),
    /** Week-over-week company movement from the snapshot. */
    companiesHiringUpWow: z.number(),
    companiesPullingBackWow: z.number(),
    /** Median posted salary (annual midpoint), null when too few postings carry pay. */
    medianSalary: z.number().nullable(),
    /** Roles classified as AI-related across the index. */
    aiRoles: z.number(),
    /** Roles added to the index in the last 60 days. */
    addedLast60d: z.number(),
    standoutMover: z
      .object({
        company: z.string(),
        domain: z.string(),
        rolesNow: z.number(),
        pctChange: z.number(),
        rolesAdded: z.number(),
      })
      .nullable(),
  }),
  layoffs: z
    .object({
      windowDays: z.number(),
      peopleImpacted: z.number(),
      companies: z.number(),
      events: z.number(),
      /** Events whose company resolves to one in the Dreamwork index. */
      matchedToIndex: z.number(),
      topIndustries: z.array(
        z.object({
          industry: z.string(),
          impacted: z.number(),
          events: z.number(),
        }),
      ),
      topCompanies: z.array(
        z.object({
          company: z.string(),
          domain: z.string(),
          totalLaidOff: z.number(),
          eventCount: z.number(),
          latestDate: z.string(),
          industry: z.string().nullable(),
        }),
      ),
      recentEvents: z.array(
        z.object({
          company: z.string(),
          domain: z.string(),
          laidOff: z.number(),
          workforcePct: z.number().nullable(),
          date: z.string(),
          industry: z.string(),
        }),
      ),
      dataThrough: z.string(),
    })
    .nullable()
    .describe("Global layoff pressure. null when the layoffs feed has no data."),
  howToUse: z.string(),
});

export const topHiringCompaniesInputSchema = z.object({
  function: z
    .enum(MARKET_FUNCTION_SLUGS)
    .optional()
    .describe("Limit to one job function, e.g. engineering."),
  country: z
    .string()
    .length(2)
    .regex(/^[A-Za-z]{2}$/, "Use a two-letter ISO country code, e.g. US.")
    .transform((value) => value.toUpperCase())
    .optional()
    .describe("Two-letter ISO country code, e.g. US."),
  trend: z
    .enum(["growing", "stable", "contracting"])
    .optional()
    .describe("Keep only companies with this hiring trend."),
  limit: z
    .int()
    .min(1)
    .max(25)
    .optional()
    .describe("How many companies to return, 1-25. Default 15."),
});

export const topHiringCompaniesOutputSchema = z.object({
  generatedAt: z.string().describe("When the underlying snapshot was computed (UTC)."),
  filters: z.object({
    country: z.string().nullable(),
    function: z.string().nullable(),
    trend: z.string().nullable(),
    /** Only companies whose latest tracked activity is within 7 days. */
    updatedWithinDays: z.number(),
  }),
  matched: z
    .number()
    .describe(
      "Companies matching every filter at the company level (at least one role per filter), ranked by open roles.",
    ),
  companies: z.array(
    z.object({
      name: z.string(),
      domain: z.string(),
      url: z.string().describe("The company's page on Dreamwork."),
      openRoles: z
        .number()
        .describe(
          "Open roles for the lens: with a function filter, roles in that function (any location); with a country filter, roles located in that country; with BOTH, roles in the function worldwide — the country filter only gates which companies appear (each has at least one role there).",
        ),
      totalActiveRoles: z.number(),
      newRolesLast7d: z.number(),
      hiringTrend: z.enum(["growing", "stable", "contracting"]),
      hiringTrendPct: z.number(),
      /** Roles per week over the recent window. */
      hiringVelocity: z.number(),
      medianSalary: z.number().nullable(),
      topFunction: z.string().nullable(),
      latestActivity: z.string().nullable(),
    }),
  ),
  howToUse: z.string(),
});

export type MarketPulseOutput = z.output<typeof marketPulseOutputSchema>;
export type TopHiringCompaniesOutput = z.output<typeof topHiringCompaniesOutputSchema>;

// Response shapes of the two research routes, only the fields the builders read.

const researchIndexResponseSchema = z.object({
  coverage: z.object({
    jobsIndexed: z.number(),
    addedLast60d: z.number(),
    firstIndexedAt: z.string().nullable(),
  }),
  totals: z.object({
    companies: z.number(),
    activeRoles: z.number(),
    newLast7d: z.number(),
    growingCount: z.number(),
    contractingCount: z.number(),
    medianSalary: z.number().nullable(),
    aiRoles: z.number(),
  }),
  weeklyMovement: z.object({
    hiringUp: z.number(),
    pullingBack: z.number(),
  }),
  standout: z
    .object({
      domain: z.string(),
      name: z.string(),
      currentRoles: z.number(),
      pct: z.number(),
      addedRoles: z.number(),
      searchPromotionAllowed: z.boolean(),
    })
    .nullable(),
  filtered: z.object({
    matched: z.number(),
    rows: z.array(
      z.object({
        domain: z.string(),
        name: z.string(),
        activeRoles: z.number(),
        newLast7d: z.number(),
        remoteRoles: z.number(),
        internRoles: z.number(),
        juniorRoles: z.number(),
        medianSalary: z.number().nullable(),
        hiringTrend: z.enum(["growing", "stable", "contracting"]),
        hiringTrendPct: z.number(),
        hiringVelocity: z.number(),
        topFunction: z.string().nullable(),
        latestActivity: z.string().nullable(),
        searchPromotionAllowed: z.boolean(),
        lensCount: z.number().optional(),
      }),
    ),
  }),
  query: z.record(z.string(), z.unknown()),
  generatedAt: z.string(),
});

const layoffEventSchema = z.object({
  company: z.string(),
  domain: z.string(),
  laidOff: z.number(),
  workforcePct: z.number().nullable(),
  date: z.string(),
  industry: z.string(),
  source: z.string(),
  country: z.string().nullable(),
  inIndex: z.boolean(),
});

const layoffsResponseSchema = z.object({
  layoffs: z
    .object({
      totals: z.object({
        impacted: z.number(),
        companies: z.number(),
        events: z.number(),
        matched: z.number(),
        days: z.number(),
      }),
      recent: z.array(layoffEventSchema),
      industries: z.array(
        z.object({
          industry: z.string(),
          impacted: z.number(),
          events: z.number(),
        }),
      ),
      topCompanies: z.array(
        z.object({
          company: z.string(),
          domain: z.string(),
          totalLaidOff: z.number(),
          eventCount: z.number(),
          latestDate: z.string(),
          industry: z.string().nullable(),
          inIndex: z.boolean(),
        }),
      ),
      windowStart: z.string(),
      windowEnd: z.string(),
      sourceLatestDate: z.string(),
      generatedAt: z.string(),
    })
    .nullable(),
});

function indexQuery(params: Record<string, string | undefined>): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) pairs.push(`${key}=${encodeURIComponent(value)}`);
  }
  return pairs.length > 0 ? `?${pairs.join("&")}` : "";
}

function topFive<T>(rows: readonly T[]): T[] {
  return rows.slice(0, 5);
}

/** The Dreamwork company-page URL convention every surface uses. */
export function dreamworkCompanyUrl(
  origin: string,
  domain: string,
): string {
  return `${origin.replace(/\/+$/, "")}/c/${domain}`;
}

/** Build get_market_pulse's output from the two research routes' responses. */
export function buildMarketPulseOutput(bodies: {
  index: unknown;
  layoffs: unknown;
}): MarketPulseOutput {
  const indexParsed = researchIndexResponseSchema.safeParse(bodies.index);
  if (!indexParsed.success) {
    throw new Error("Dreamwork returned malformed data for get_market_pulse.");
  }
  const layoffsParsed = layoffsResponseSchema.safeParse(bodies.layoffs);
  if (!layoffsParsed.success) {
    throw new Error("Dreamwork returned malformed data for get_market_pulse.");
  }
  const index = indexParsed.data;
  const layoffs = layoffsParsed.data.layoffs;

  const standout = index.standout?.searchPromotionAllowed
    ? {
        company: index.standout.name,
        domain: index.standout.domain,
        rolesNow: index.standout.currentRoles,
        pctChange: index.standout.pct,
        rolesAdded: index.standout.addedRoles,
      }
    : null;

  return {
    generatedAt: index.generatedAt,
    hiring: {
      companiesTracked: index.totals.companies,
      activeRoles: index.totals.activeRoles,
      newRolesLast7d: index.totals.newLast7d,
      companiesGrowing: index.totals.growingCount,
      companiesContracting: index.totals.contractingCount,
      companiesHiringUpWow: index.weeklyMovement.hiringUp,
      companiesPullingBackWow: index.weeklyMovement.pullingBack,
      medianSalary: index.totals.medianSalary,
      aiRoles: index.totals.aiRoles,
      addedLast60d: index.coverage.addedLast60d,
      standoutMover: standout,
    },
    layoffs: layoffs
      ? {
          windowDays: layoffs.totals.days,
          peopleImpacted: layoffs.totals.impacted,
          companies: layoffs.totals.companies,
          events: layoffs.totals.events,
          matchedToIndex: layoffs.totals.matched,
          topIndustries: topFive(
            [...layoffs.industries].sort((a, b) => b.impacted - a.impacted),
          ),
          topCompanies: topFive(
            [...layoffs.topCompanies].sort((a, b) => b.totalLaidOff - a.totalLaidOff),
          ),
          recentEvents: topFive(layoffs.recent).map((event) => ({
            company: event.company,
            domain: event.domain,
            laidOff: event.laidOff,
            workforcePct: event.workforcePct,
            date: event.date,
            industry: event.industry,
          })),
          dataThrough: layoffs.sourceLatestDate,
        }
      : null,
    howToUse:
      "Use this as CURRENT market context that postdates your training data: hiring momentum (new roles, growing vs contracting companies, week-over-week movement) alongside layoff pressure by industry and company. Every figure here is WORLDWIDE — for country- or function-scoped company lists call get_top_hiring_companies. A company appearing in both the hiring and layoff tables is worth a caveat; a layoff-heavy industry argues for de-prioritizing its roles.",
  };
}

/**
 * How many rows to fetch per requested company, so companies pending identity
 * review (`searchPromotionAllowed: false` — the web withholds their links and
 * the standout selection skips them) can be excluded without short-delivering
 * the requested count. The route caps one page at 500 rows.
 */
export const RECOMMENDATION_FETCH_BUFFER = 3;

/** Build get_top_hiring_companies's output from the index route's response. */
export function buildTopHiringCompaniesOutput(
  body: unknown,
  requestedLimit: number,
  webOrigin: string,
): TopHiringCompaniesOutput {
  const indexParsed = researchIndexResponseSchema.safeParse(body);
  if (!indexParsed.success) {
    throw new Error(
      "Dreamwork returned malformed data for get_top_hiring_companies.",
    );
  }
  const index = indexParsed.data;
  const query = index.query as {
    function?: string;
    country?: string;
    trend?: string;
  };
  // The promotion gate is applied HERE, not by the route: /research/index
  // retains review-blocked companies for browsing and has no server-side
  // filter for them, so an advisor-facing list must exclude them itself or it
  // would recommend companies the product refuses to link.
  const promotable = index.filtered.rows.filter(
    (row) => row.searchPromotionAllowed,
  );
  return {
    generatedAt: index.generatedAt,
    filters: {
      country: query.country ?? null,
      function: query.function ?? null,
      trend: query.trend ?? null,
      updatedWithinDays: 7,
    },
    matched: index.filtered.matched,
    companies: promotable.slice(0, requestedLimit).map((row) => ({
      name: row.name,
      domain: row.domain,
      url: dreamworkCompanyUrl(webOrigin, row.domain),
      openRoles: row.lensCount ?? row.activeRoles,
      totalActiveRoles: row.activeRoles,
      newRolesLast7d: row.newLast7d,
      hiringTrend: row.hiringTrend,
      hiringTrendPct: row.hiringTrendPct,
      hiringVelocity: row.hiringVelocity,
      medianSalary: row.medianSalary,
      topFunction: row.topFunction,
      latestActivity: row.latestActivity,
    })),
    howToUse:
      "Ranked by open roles among companies active in the last 7 days. Filters apply at the COMPANY level: with a function filter openRoles counts that function's roles (any location); with a country filter openRoles counts roles located there; with BOTH, openRoles counts the function's roles worldwide and the country filter only gates which companies appear (each has at least one role in that country). hiringTrend and hiringVelocity say whether the company is expanding. Companies pending identity review are excluded, so every company here is link-safe. Link the person to a company's url (its Dreamwork page), then browse_listings with the company filter for its individual roles.",
  };
}

/** The querystring the index route needs for the top-companies walk. */
export function topHiringCompaniesQuery(input: {
  function?: string;
  country?: string;
  trend?: string;
  fetchLimit: number;
}): string {
  return indexQuery({
    sort: "active",
    updated: "7d",
    limit: String(input.fetchLimit),
    function: input.function,
    country: input.country,
    trend: input.trend,
  });
}

export const marketActions = [
  defineAction({
    id: "get_market_pulse",
    kind: "data",
    risk: "read",
    title: "Read the current hiring market pulse",
    description: `Read CURRENT worldwide hiring-market context from Dreamwork's research corpus (a snapshot computed at most twice a day ago; generatedAt names it): companies tracked, open roles, roles added in the last 7 days, growing vs contracting companies, week-over-week movement, median salary, AI-role volume, plus global layoff pressure by industry and company. Every figure is worldwide. For country- or function-scoped company lists call get_top_hiring_companies. Use it as fresh evidence that postdates your training data when advising on job-search strategy, industry outlook, or where opportunity is moving - not as a live counter. A company appearing in both the hiring and layoff tables is worth a caveat; a layoff-heavy industry argues for de-prioritizing its roles.`,
    input: marketPulseInputSchema,
    output: marketPulseOutputSchema,
    authorization: { mode: "none" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: false,
      reason: "duplicate_of_mcp_tool",
      note: "apps/mcp serves the same payload as a PUBLIC (guest-capable) hand-written tool; a registry twin would add an auth wall for the same data.",
    },
  }),

  defineAction({
    id: "get_top_hiring_companies",
    kind: "data",
    risk: "read",
    title: "List the top hiring companies right now",
    description: `List the companies hiring the most right now, ranked by open roles among companies active in the last 7 days, each with hiring trend, week-over-week velocity, median pay and its page on Dreamwork. Optional filters: function, country (two-letter ISO code), hiring trend. Filters apply at the COMPANY level: with a function filter openRoles counts that function's roles (any location); with a country filter openRoles counts roles located there; with BOTH, openRoles counts the function's roles worldwide and the country filter only gates which companies appear (each has at least one role in that country). Companies pending identity review are excluded, so every returned company is link-safe. Link the person to a company's url, then browse_listings (or the site's job board) with the company filter for its individual roles.`,
    input: topHiringCompaniesInputSchema,
    output: topHiringCompaniesOutputSchema,
    authorization: { mode: "none" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: false,
      reason: "duplicate_of_mcp_tool",
      note: "apps/mcp serves the same payload as a PUBLIC (guest-capable) hand-written tool; a registry twin would add an auth wall for the same data.",
    },
  }),
] as const;
