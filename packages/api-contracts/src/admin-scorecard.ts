/**
 * `GET /admin/scorecard`: the weekly team scorecard on the admin home.
 *
 * Days are UTC calendar days as `YYYY-MM-DD`. A flow metric covers the 30
 * complete days ending yesterday, so a half-finished today never reads as a
 * drop. A stock metric (MRR, paying users) covers the same 30 days plus today,
 * whose point is the live value. "Last 7" is the 7 complete days ending
 * yesterday and "prior 7" the 7 before them.
 *
 * Every block is computed independently and is null when its source failed.
 */

/** One point of a daily series; `null` means no denominator that day. */
export type ScorecardDay = { date: string; value: number | null };

/** A count per day: unique visitors, unique MCP callers. */
export type ScorecardCountMetric = {
  days: ScorecardDay[];
  /** Unique over the whole 7-day window, not the sum of daily uniques. */
  last7: number;
  prior7: number;
};

/** A percentage per day. */
export type ScorecardRateMetric = {
  days: ScorecardDay[];
  last7Pct: number | null;
  prior7Pct: number | null;
  last7Numerator: number;
  last7Denominator: number;
};

/** An end-of-day level. MRR is in US cents. */
export type ScorecardStockMetric = {
  /** 31 points: the 30 complete days, then today at its live value. */
  days: ScorecardDay[];
  current: number;
};

export type ScorecardSignupMix = { free: number; trial: number; paid: number };

export type ScorecardNewUsersDay = ScorecardSignupMix & { date: string };

/** Trials that ended in one Monday-start UTC week, and how many paid. */
export type ScorecardTrialWeek = {
  weekStart: string;
  /** False for the week in progress. */
  complete: boolean;
  ended: number;
  converted: number;
  pct: number | null;
};

/** One day's MRR change in US cents, split by why it moved; losses are negative. */
export type ScorecardMrrMove = {
  date: string;
  new: number;
  reactivation: number;
  expansion: number;
  contraction: number;
  churn: number;
};

/**
 * One day of corpus intake health, one row per lane.
 * INTERNAL = our own crawlers (company_sources registry). EXTERNAL = the
 * SourceStack vendor feed (single lane, automated daily delivery).
 */
export type ScorecardCorpusLane = "internal" | "external";

export type ScorecardCorpusDay = {
  date: string;
  /** New listings first-seen that day (lane split). */
  added: number | null;
  /** Servable listings at end of day; null before the rollup existed. */
  servable: number | null;
};

export type ScorecardCorpusLaneState = {
  lane: ScorecardCorpusLane;
  days: ScorecardCorpusDay[];
  /** Servable listings right now (latest rollup value). */
  servable: number;
  /** Active listings right now (latest rollup value). */
  active: number;
  /** Servable share of active, in percent, one decimal. Null before history exists. */
  servablePct: number | null;
  /**
   * Servable share of active as recorded on the same day last week, in
   * percent, one decimal. The share itself is not a change; the card's
   * delta is this subtracted from `servablePct`, in percentage points.
   * Null when that day has no recorded servable and active counts.
   */
  servablePct7dAgo: number | null;
  /** New listings in the 7 complete days ending yesterday. */
  last7Added: number;
  /** New listings in the 7 days before that. */
  prior7Added: number;
};

export type ScorecardCorpusSourceHealth = {
  /** Enabled sources at read time (live registry count). */
  enabled: number;
  /** 0 consecutive failures and crawled within 7 days. */
  reliable: number;
  /** 1-2 consecutive failures, or last crawl older than 7 days. */
  fragile: number;
  /** 3+ consecutive failures, or enabled and never crawled. */
  broken: number;
  /** Same count as at the rollup 7 days ago; null before history exists. */
  fragilePlusBroken7dAgo: number | null;
};

export type ScorecardCorpusFeed = {
  /** Receipt fields; null when no completed delivery has ever been recorded. */
  publishedAt: string | null;
  completedAt: string | null;
  rows: number;
  created: number;
  rowErrors: number;
  /** Receipt age in hours, one decimal. */
  ageHours: number;
  /** Receipt older than 36 hours at read time. */
  stale: boolean;
  /** Vendor freshness of active external rows: share seen within 7 days, in percent. */
  vendorFresh7dPct: number | null;
  /** Share of active external rows seen within 30 days, in percent. */
  vendorFresh30dPct: number | null;
  /** Days until the signed-delivery URLs expire (2027-09-09). */
  licenseDaysLeft: number;
};

export type AdminScorecardCorpus = {
  internal: ScorecardCorpusLaneState;
  external: ScorecardCorpusLaneState;
  sourceHealth: ScorecardCorpusSourceHealth;
  feed: ScorecardCorpusFeed | null;
  /** Platform rows under watch: servable share under 50% with 1000+ active listings, plus stale giants. */
  watch: Array<{
    kind: "low-servable" | "stale-source" | "disabled-dead-weight";
    platform: string;
    label: string;
    /** Servable share in percent, one decimal; null when not a ratio. */
    servablePct: number | null;
    active: number;
    detail: string;
  }>;
};

export type AdminScorecard = {
  generatedAt: string;
  /** Latest write to the Postgres copy of Stripe, by webhook or full read. */
  stripeSyncedAt: string | null;
  /** Last day of the "last 7" window. */
  throughDate: string;
  /**
   * Daily corpus intake health. INTERNAL = our crawlers; EXTERNAL = the
   * SourceStack vendor feed. Null when the corpus read failed.
   */
  corpus: AdminScorecardCorpus | null;
  mrr: ScorecardStockMetric | null;
  /** One per `mrr.days` point after the first, for the same day. */
  mrrMoves: ScorecardMrrMove[] | null;
  payingUsers: ScorecardStockMetric | null;
  /** Each day's value is the rate over the 7 days ending that day. */
  applicationSuccess: ScorecardRateMetric | null;
  aeoVisits: ScorecardCountMetric | null;
  siteVisitors: ScorecardCountMetric | null;
  mcpUsers: ScorecardCountMetric | null;
  newUsers: {
    days: ScorecardNewUsersDay[];
    last7: ScorecardSignupMix;
    prior7: ScorecardSignupMix;
  } | null;
  visitorToSignup: ScorecardRateMetric | null;
  trialConversion: { weeks: ScorecardTrialWeek[] } | null;
};
