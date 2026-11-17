/**
 * `GET /admin/ai-traffic`: the staff AI traffic page.
 *
 * Every section runs one query of the "Growth: AI referral traffic" PostHog
 * dashboard, so each number here is the one that dashboard shows. A week is
 * a complete Monday-to-Sunday UTC week, as `YYYY-MM-DD` of its Monday. Each
 * section is read once per UTC day and loads on its own, so one failed query
 * leaves the others on the page.
 */

/**
 * `pending`: no read has finished yet; the page asks again shortly.
 * `ready`: `asOf` is the UTC day of the read, yesterday's while today's runs.
 * `unavailable`: today's read failed and there is no earlier one to show.
 */
export type AiTrafficSection<T> =
  | { status: "pending" }
  | { status: "ready"; asOf: string; data: T }
  | { status: "unavailable"; reason: string };

/** The channel family that colours a channel on every chart. */
export type AiTrafficChannelGroup = "AI" | "Search" | "Direct" | "Other";

/** AI landings: sessions plus landings on server-rendered pages. */
export type AiTrafficHeadline = {
  weekStart: string;
  aiLandings: number;
  previousWeekAiLandings: number;
  aiSessions: number;
  aiServerLandings: number;
};

/** AI landings in one complete week, every assistant together. */
export type AiTrafficLandingsWeek = { weekStart: string; aiLandings: number };

/** Shares of last complete week's visits from outside, in percent. */
export type AiTrafficSearchShare = {
  aiPct: number | null;
  googlePct: number | null;
  allSearchPct: number | null;
  aiVisits: number;
  googleVisits: number;
  searchVisits: number;
  outsideVisits: number;
};

export type AiTrafficShareWeek = {
  weekStart: string;
  aiPct: number | null;
  googlePct: number | null;
  otherSearchPct: number | null;
  outsideVisits: number;
};

/** Counts per week, one per `series` entry in the same order. */
export type AiTrafficWeeklySeries = {
  series: string[];
  weeks: Array<{ weekStart: string; counts: number[] }>;
};

export type AiTrafficConversionRow = {
  channel: string;
  group: AiTrafficChannelGroup;
  sessions: number;
  ctaClickPct: number;
  signupOpenedPct: number;
  signInPct: number;
  setupFinishedPct: number;
  returnedPct: number;
};

export type AiTrafficFirstTouchRow = {
  channel: string;
  group: AiTrafficChannelGroup;
  visitors: number;
  signedUp: number;
  startedCheckout: number;
  paid: number;
  signupRatePct: number;
};

export type AiTrafficLandingPageTypes = {
  /** The assistants, in the order of each row's `counts`. */
  series: string[];
  rows: Array<{ pageType: string; counts: number[] }>;
};

/** A public page path; never a query string. */
export type AiTrafficTopPage = {
  path: string;
  last30: number;
  prior30: number;
  topAssistant: string;
};

export type AiTrafficCrawlerRow = {
  assistant: string;
  /** Null under 10 visits, where a rate is noise. */
  fetchesPerVisit: number | null;
  fetches: number;
  visits: number;
  searchCrawls: number;
};

export type AiTrafficAeoRow = {
  month: string;
  assistant: string;
  answers: number;
  namesPct: number;
  citesPct: number;
};

export type AiTrafficSelfReportedWeek = {
  weekStart: string;
  answers: number;
  aiAssistant: number;
  googleSearch: number;
  aiSharePct: number | null;
  googleSharePct: number | null;
};

export type AdminAiTraffic = {
  generatedAt: string;
  links: {
    /** The PostHog dashboard these sections mirror. */
    dashboard: string;
    /** The monthly AEO prompt panel's own dashboard. */
    aeoPanel: string;
  };
  headline: AiTrafficSection<AiTrafficHeadline>;
  /**
   * AI landings in up to the last 8 complete weeks from the week of
   * 2026-10-19, oldest first, for the headline card's trend. Summed from
   * `engines`, so it shares that section's state.
   */
  headlineTrend: AiTrafficSection<AiTrafficLandingsWeek[]>;
  searchShare: AiTrafficSection<AiTrafficSearchShare>;
  shareOverTime: AiTrafficSection<AiTrafficShareWeek[]>;
  engines: AiTrafficSection<AiTrafficWeeklySeries>;
  jobPageConversion: AiTrafficSection<AiTrafficConversionRow[]>;
  firstTouch: AiTrafficSection<AiTrafficFirstTouchRow[]>;
  landingPageTypes: AiTrafficSection<AiTrafficLandingPageTypes>;
  topPages: AiTrafficSection<AiTrafficTopPage[]>;
  crawlerFetches: AiTrafficSection<AiTrafficCrawlerRow[]>;
  searchCrawlers: AiTrafficSection<AiTrafficWeeklySeries>;
  aeoPanel: AiTrafficSection<AiTrafficAeoRow[]>;
  selfReported: AiTrafficSection<AiTrafficSelfReportedWeek[]>;
};

/** Every section that runs a PostHog query, keyed as in `AdminAiTraffic`. */
export type AiTrafficSectionKey = Exclude<
  keyof AdminAiTraffic,
  "generatedAt" | "links" | "headlineTrend"
>;
