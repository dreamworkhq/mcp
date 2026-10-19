import { z } from "zod";
import { defineAction } from "../action.js";
import { ASSISTANT_EVENTS } from "../events.js";
import { MATCH_SENIORITIES, WORK_SETTINGS } from "../listingFilters.js";
import { receiptSchema } from "../receipt.js";

const jobSummary = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string().nullable(),
  /**
   * The listing's page on Dreamwork — the link an agent hands the person.
   * Null only where the web origin is unconfigured (a local dev API), which
   * is why a default is required: the MCP client fails closed on a payload
   * the registry does not describe, so an older API that omits the key must
   * still parse during version skew.
   */
  url: z
    .string()
    .nullable()
    .default(null)
    .describe(
      "The job's page on Dreamwork. sourceUrl, where present, is the employer's direct posting.",
    ),
  /**
   * True for a stated remote role, false for stated hybrid or onsite, null
   * when the posting said nothing. Null is not "not remote": ingestion only
   * writes a work setting when a source states one.
   */
  remote: z.boolean().nullable(),
  salary: z.string().nullable(),
  postedAt: z.string().nullable(),
  /** Raw blended match score, 0-1. Empty when the role was never scored. */
  score: z.number().nullable(),
  saved: z.boolean(),
  applied: z.boolean(),
  whyItMatches: z
    .array(z.string())
    .describe(
      "The matcher's own reasons for this person, when it recorded any.",
    ),
});

/** `list_matches` orders, in the words an agent uses for them. */
/** One job as a match read reports it, with what the person sees of the fit. */
export const matchedJobSchema = jobSummary.extend({
  /** The match percent the person sees, null when never scored. */
  matchPercent: z.int().nullable(),
  /** When Dreamwork first saw the posting; `addedAfter` compares this. */
  firstSeenAt: z.string().nullable(),
});

const MATCH_SORTS = ["relevance", "newest", "pay_high", "pay_low"] as const;

/**
 * Annual US dollars. A figure under 1,000 is refused rather than read as
 * thousands, because "200" meaning $200k and "200" meaning $200 cannot be told
 * apart and the wrong guess filters silently.
 */
const annualDollars = (what: string) =>
  z
    .int()
    .min(1000, {
      error: `${what} is in whole annual US dollars, e.g. 200000 for $200k.`,
    });

/**
 * What the feed actually applied, normalized. A key is present only when that
 * filter narrowed the page, so an agent can repeat the search back to the
 * person without re-deriving it from its own arguments.
 */
const appliedMatchFilters = z
  .object({
    query: z.string(),
    functions: z.array(z.string()),
    seniorities: z.array(z.enum(MATCH_SENIORITIES)),
    workSettings: z.array(z.enum(WORK_SETTINGS)),
    location: z.object({
      kind: z.enum(["radius", "region", "country"]),
      city: z.string().nullable(),
      regionCode: z.string().nullable(),
      countryCode: z.string(),
      radiusKm: z.number().nullable(),
    }),
    internship: z.literal(true),
    aiRole: z.literal(true),
    minSalary: z.int(),
    maxSalary: z.int(),
    minMatchPercent: z.int(),
    equity: z.literal(true),
    bonus: z.literal(true),
    healthcare: z.literal(true),
    industry: z.string(),
    postedWithinDays: z.int(),
    addedAfter: z.string(),
    sort: z.enum(MATCH_SORTS),
  })
  .partial();

/**
 * `list_matches` page sizes. The default equals `DEFAULT_MATCH_PAGE_SIZE` in
 * `apps/api/src/assistant/actions/match-search.ts`, which is what applies it;
 * this package imports nothing from `apps/*`, so the number is restated here.
 */
const MATCH_PAGE_SIZE_DEFAULT = 10;
const MATCH_PAGE_SIZE_MAX = 50;

/**
 * How long a dismissal's receipt offers its undo. As long as `move_pipeline`'s
 * for the same reason: "put that back" is spoken, and a spoken round trip does
 * not fit in eight seconds. `restore_match` stays available after it closes.
 */
const DISMISS_UNDO_WINDOW_MS = 60_000;

/**
 * `list_dismissed_matches` page sizes. The default equals
 * `DISMISSED_LISTINGS_DEFAULT_LIMIT` in `apps/api/src/api/sources.ts`, which
 * applies it; this package imports nothing from `apps/*`.
 */
const DISMISSED_PAGE_SIZE_DEFAULT = 20;
const DISMISSED_PAGE_SIZE_MAX = 50;

export const matchesActions = [
  defineAction({
    id: "list_matches",
    kind: "data",
    risk: "read",
    title: "List matches",
    description:
      "Rank the person's live matches and return them as data: per job its id, `url` (its page on Dreamwork — the link you give the person), title, company, location, remote flag, pay, posted and first-seen dates, match percent, and whether it is saved or applied to. With no filters it is the Matches feed. The pool is their best few hundred matches, not every listing, so a walk ends at its edge; `browse_listings` on MCP searches the whole index. For more, send the previous `nextCursor` with the same filters; null means done. To poll on a schedule, set `addedAfter` to the last run minus at least 72 hours and skip ids already seen: a listing can become servable hours after Dreamwork first saw it. Read `notes` before answering. Changing what they see is `set_filters`; one role they point at is `get_job`.",
    input: z.object({
      query: z
        .string()
        .max(200)
        .optional()
        .describe("Free-text search across the person's match pool."),
      function: z
        .string()
        .max(200)
        .optional()
        .describe(
          'Job-function labels, comma-separated for a union, e.g. "Engineering,Product". An unknown label is refused with the list.',
        ),
      seniority: z
        .string()
        .max(80)
        .optional()
        .describe(
          "Seniority labels, comma-separated for a union: Junior, Mid-Level, Senior, Staff+, Director+. A hard filter: pass it when the person names a level they want only, because the stored level ranks matches but never removes other levels. It also drops roles whose level was never classified.",
        ),
      location: z
        .string()
        .max(120)
        .optional()
        .describe(
          "City, region, or country; a place the gazetteer cannot resolve is refused.",
        ),
      remoteOnly: z
        .boolean()
        .optional()
        .describe('Shorthand for workSettings ["remote"].'),
      workSettings: z
        .array(z.enum(WORK_SETTINGS))
        .min(1)
        .max(3)
        .optional()
        .describe(
          "Work settings to keep, as a union; an unstated setting counts as onsite.",
        ),
      internship: z
        .boolean()
        .optional()
        .describe("Internships, co-ops, and apprenticeships only."),
      aiRole: z.boolean().optional().describe("AI roles only."),
      minSalary: annualDollars("minSalary")
        .optional()
        .describe(
          "Pay floor in whole annual USD, e.g. 200000. Jobs with no posted pay drop out.",
        ),
      maxSalary: annualDollars("maxSalary")
        .optional()
        .describe("Pay ceiling in whole annual USD."),
      minMatchPercent: z
        .int()
        .min(40)
        .max(97)
        .optional()
        .describe("Lowest match percent to keep, on the 40-97 scale shown."),
      equity: z.boolean().optional(),
      bonus: z.boolean().optional(),
      healthcare: z.boolean().optional(),
      industry: z
        .string()
        .max(60)
        .optional()
        .describe(
          'Employer industry, e.g. "Pharma & Biotech". An unknown name is refused with the list.',
        ),
      postedWithinDays: z
        .int()
        .min(1)
        .max(90)
        .optional()
        .describe("Employer posting date within this many days."),
      addedAfter: z.iso
        .datetime({ offset: true })
        .optional()
        .describe("Only jobs Dreamwork first saw after this ISO date-time."),
      sort: z
        .enum(MATCH_SORTS)
        .optional()
        .describe("Order; relevance when omitted."),
      cursor: z
        .string()
        .max(512)
        .optional()
        .describe(
          "`nextCursor` from the previous page. Send the same filters and sort, or it is refused.",
        ),
      limit: z
        .int()
        .min(1)
        .max(MATCH_PAGE_SIZE_MAX)
        .optional()
        .describe(
          `Page size, ${MATCH_PAGE_SIZE_DEFAULT} when omitted. A cursor keeps the size it was issued with.`,
        ),
    }),
    output: z.object({
      jobs: z.array(matchedJobSchema),
      total: z
        .int()
        .describe(
          "Jobs these filters keep, across all pages. Following every nextCursor returns this many while poolChanged stays false.",
        ),
      filteredToEmpty: z
        .boolean()
        .describe(
          "True when this call's filters left none of the poolSize jobs. total 0 with this false means the pool itself is empty or still building.",
        ),
      nextCursor: z.string().nullable(),
      /**
       * "building" while the pool is still being computed or refreshed: the
       * page can be empty or provisional, which is not "no jobs".
       */
      poolStatus: z.enum(["ready", "building"]),
      poolSize: z
        .int()
        .describe(
          "Jobs a walk of this pool returns before this call's filters narrow it, so it equals total when no filter is set. Dismissed and saved roles, excluded companies and same-company same-title duplicates are already left out, and so are onsite roles outside the area of someone who will not relocate, unless location or workSettings is set. query, functions and location also choose which pool is built.",
        ),
      /** The pool changed since the cursor's page, so a job can repeat or be skipped. */
      poolChanged: z.boolean(),
      appliedFilters: appliedMatchFilters,
      notes: z.array(z.string()),
    }),
    authorization: { mode: "none" },
    anchor: { route: "/", target: "matches.list" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        `Returns the account's ranked live match pool with job id, its Dreamwork page url, title, company, location, remote terms, salary, dates, match percent and saved/applied state. Filters narrow that pool; nextCursor continues a page with identical filters, and null ends the walk. A page holds ${MATCH_PAGE_SIZE_DEFAULT} jobs by default and limit accepts up to ${MATCH_PAGE_SIZE_MAX}; the next page is the previous nextCursor, which keeps the page size it was issued with. addedAfter supports overlapping discovery windows because listings can become servable after first discovery. notes describe applied filters and coverage.`,
      readOnlyHint: true,
      openWorldHint: false,
    },
  }),

  defineAction({
    id: "get_job",
    kind: "data",
    risk: "read",
    title: "Read one role",
    description:
      "Read one role in full: title, company, location and remote terms, salary band, posted date, the description text, this person's match score, and whether the role is saved, in which board column, with an application and materials. The job's `url` is its page on Dreamwork — give the person that link; `sourceUrl` is the employer's direct posting, for when they ask for it. Take the id from the situation's `job`, a visible card, or `list_matches`; a saved role and a corpus listing are both accepted. Use it before saying anything specific about a role and before applying. `whyItMatches` is usually empty here — the matcher records its reasons on the feed, so quote those from `list_matches` rather than inventing any.",
    input: z.object({
      jobId: z
        .string()
        .describe("Listing id or private-job id from the feed or envelope."),
    }),
    output: z.object({
      job: jobSummary.extend({
        description: z.string(),
      employmentType: z.string().nullable(),
      /**
       * Work-eligibility verdict for THIS person. True when the role states
       * no country restriction (or the person holds one of its confirmed
       * countries); false only when a high-confidence restriction excludes
       * the person's confirmed countries. Null is unknown — the role is
       * restricted and the person's eligibility is not confirmed — and null
       * is never a refusal.
       */
      eligible: z.boolean().nullable(),
      applicationId: z.string().nullable(),
      materialsReady: z.boolean(),
      sourceUrl: z
        .string()
        .nullable()
        .describe(
          "The employer's direct posting URL. url is the job's page on Dreamwork.",
        ),
        /** Board column as a status, or null when the role is not saved. */
        pipelineStatus: z.string().nullable(),
      }),
    }),
    authorization: { mode: "none" },
    anchor: { route: "/job/:listingId", target: "matches.card:<id>" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Returns one saved or corpus role by id with full description, company, location and remote terms, salary, posted date, match score, saved state, board column, application id, material readiness and work-eligibility verdict. url is the Dreamwork listing page; sourceUrl is the employer's direct posting. eligible is true for an unrestricted role or a confirmed allowed country, false for a high-confidence restriction excluding confirmed countries, and null when eligibility is unknown. Only false blocks applying or Autopilot: null means eligibility is not yet known, so proceed with applying — the application itself surfaces any real restriction. whyItMatches may be empty when no matcher explanation is stored.",
      readOnlyHint: true,
      openWorldHint: false,
    },
  }),

  defineAction({
    id: "save_job",
    kind: "data",
    risk: "cheap",
    title: "Save a job",
    description:
      "Put a role into the person's pipeline at SAVED. It is a bookmark: it sends nothing and requests no application, and the role waits in SAVED until they apply or record that they applied elsewhere. Saving may also start writing application materials for the role in the background, so `generate_pack` can find them ready. Saving a role that is already saved is a no-op receipt, not an error. Do NOT use it as a step they did not ask for: if they asked to apply, call `apply`, which saves as part of its own work.",
    input: z.object({
      jobId: z.string().describe("Listing id or private-job id."),
    }),
    output: receiptSchema,
    authorization: { mode: "receipt", undoWindowMs: 8_000 },
    anchor: { route: "/", target: "matches.card:<id>" },
    invalidates: ["shortlist", "pipeline"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Saves one role to the account's pipeline at SAVED as a bookmark. No application is submitted or queued until apply is called. Application materials may start preparing in the background. An already saved role returns a no-op receipt.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),

  defineAction({
    id: "dismiss_match",
    kind: "data",
    risk: "cheap",
    title: "Dismiss a match",
    description:
      "Hide one role from the person's feed, job alerts and Autopilot. A role is every listing with the same employer and title, so copies posted in other locations, and later reposts, are hidden too. It does not change which roles are matched later: other roles at the same company keep appearing, so a company they never want goes in `update_preferences.excludedCompanies`, and a level they never want goes in `excludedSeniorities`. The receipt offers an undo for a minute; after that, `restore_match` brings the role back at any time, and `list_dismissed_matches` lists what they have dismissed. Do NOT dismiss a role they merely declined to act on right now, and do NOT dismiss in bulk to 'clean up' a feed nobody complained about. Taking something off the applications board is `move_pipeline`: this would hide the listing and leave the card exactly where it was.",
    input: z.object({
      jobId: z.string().describe("Listing id from the feed or `list_matches`."),
      reason: z
        .string()
        .max(200)
        .optional()
        .describe(
          "The person's own words for why this role is wrong. Accepted but not stored, and it does not change later matches.",
        ),
    }),
    output: receiptSchema,
    authorization: { mode: "receipt", undoWindowMs: DISMISS_UNDO_WINDOW_MS },
    anchor: { route: "/", target: "matches.card:<id>" },
    invalidates: ["matches"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Hides one role, every listing with the same employer and title in any location, from the account's match feed, job alerts and Autopilot until the account restores or saves it. The receipt offers undo for one minute; restore_match reverses it at any time and list_dismissed_matches lists dismissed listings. The supplied reason is not stored. It does not hide other roles from the same company and does not move or remove an existing pipeline card.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),

  defineAction({
    id: "restore_match",
    kind: "data",
    risk: "cheap",
    title: "Restore a dismissed match",
    description:
      "Take back a dismissal, at any time: the role, with every listing of it, can appear in the person's feed, job alerts and Autopilot again. Take the id from `list_dismissed_matches` or the `dismiss_match` receipt. Restoring a role that is not dismissed is a no-op receipt, not an error. It saves nothing; bookmarking the role is `save_job`. A role dismissed long ago comes back once the person's match pool is next rebuilt, and a listing the employer has closed stays out of the feed, so say that rather than promising it is on screen now.",
    input: z.object({
      jobId: z
        .string()
        .describe("Listing id, as `dismiss_match` and `list_dismissed_matches` give it."),
    }),
    output: receiptSchema,
    authorization: { mode: "receipt", undoWindowMs: DISMISS_UNDO_WINDOW_MS },
    anchor: { route: "/", target: "matches.card:<id>" },
    invalidates: ["matches"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Reverses the dismissal of a role, every listing with the same employer and title, so it can return to the account's match feed, job alerts and Autopilot. Restoring a listing that is not dismissed returns a no-op receipt. Restoring does not save the listing. A closed listing stays out of the feed.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),

  defineAction({
    id: "list_dismissed_matches",
    kind: "data",
    risk: "read",
    title: "List dismissed matches",
    description:
      "List the roles the person has dismissed, newest first: per role its listing id, title, company, `url` (its page on Dreamwork), when it was dismissed, and `active`, which is false once the listing is no longer served (closed, expired or gone stale). Use it for \"what did I hide\" and to find the id `restore_match` takes. `total` counts every dismissed role; for the next page send `nextOffset` as `offset`, and null means done.",
    input: z.object({
      limit: z
        .int()
        .min(1)
        .max(DISMISSED_PAGE_SIZE_MAX)
        .optional()
        .describe(`Page size, ${DISMISSED_PAGE_SIZE_DEFAULT} when omitted.`),
      offset: z
        .int()
        .min(0)
        .optional()
        .describe("`nextOffset` from the previous page; 0 when omitted."),
    }),
    output: z.object({
      matches: z.array(
        z.object({
          jobId: z.string(),
          title: z.string(),
          company: z.string(),
          url: z.string().nullable(),
          dismissedAt: z.string(),
          /** False once the listing is no longer served anywhere. */
          active: z.boolean(),
        }),
      ),
      total: z.int(),
      nextOffset: z.int().nullable(),
    }),
    authorization: { mode: "none" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        `Returns the account's dismissed listings, newest first, with listing id, title, company, Dreamwork page url, dismissal time and whether the listing is still active. total counts all dismissed listings. limit defaults to ${DISMISSED_PAGE_SIZE_DEFAULT} and accepts up to ${DISMISSED_PAGE_SIZE_MAX}; nextOffset continues the list and null ends it.`,
      readOnlyHint: true,
      openWorldHint: false,
    },
  }),
] as const;
