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

export type AdminScorecard = {
  generatedAt: string;
  cachedAt: string;
  /** A newer payload is being computed; ask again in a moment for it. */
  refreshing: boolean;
  /** Last day of the "last 7" window. */
  throughDate: string;
  mrr: ScorecardStockMetric | null;
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
