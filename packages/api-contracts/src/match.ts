/**
 * Wire types for Match, the internal two-sided hiring product built on the
 * /recruit search (`docs/MATCH.md`). A company posts a job, sees anonymous
 * people who fit, and asks them; a person who says yes is named to that
 * company only. Before a yes a candidate is as anonymous as on /recruit.
 */

import type { RecruitCandidate, RecruitJobCard, RecruitSearchStage, RecruitSearchStatus } from "./recruit.js";

/** One kind in V1. The column exists so other kinds of work arrive as values, not tables. */
export type MatchWorkKind = "full_time";

export type MatchWorkSetting = "remote" | "hybrid" | "onsite";

export type MatchJobStatus = "draft" | "live" | "closed";

/**
 * Where one ask stands. `asked` waits on the person; `yes` and `no` are their
 * answer; `expired` is no answer by the deadline. After a yes the company
 * moves it to `meeting` or `passed`.
 */
export type MatchAskStatus = "asked" | "yes" | "no" | "expired" | "meeting" | "passed";

/** A company's question, asked only after a yes. At most three per job. */
export type MatchQuestion = { key: string; text: string };

export type MatchCompany = {
  id: string;
  name: string;
  domain: string;
  logoUrl: string | null;
};

export type MatchHirerSession = {
  email: string;
  company: MatchCompany | null;
};

export type MatchSearchProgress = {
  status: RecruitSearchStatus;
  stage: RecruitSearchStage;
  scored: number;
  poolSize: number;
  corpusSize: number | null;
};

export type MatchCandidate = RecruitCandidate & {
  /** This job's ask to the person, if one was sent. */
  ask: MatchAskStatus | null;
  /** The person used Dreamwork in the last 30 days, read when the page loads. Unknown reads as false. */
  activeThisMonth: boolean;
};

/** `yes` counts the people waiting on the company's Meet or Pass; `meeting` those it chose to meet. */
export type MatchJobCounts = { asked: number; yes: number; meeting: number; newFits: number };

export type MatchJob = {
  id: string;
  kind: MatchWorkKind;
  status: MatchJobStatus;
  job: RecruitJobCard | null;
  jobText: string;
  /** Yearly base pay in USD; null until read from the posting or set. */
  payMin: number | null;
  payMax: number | null;
  workSetting: MatchWorkSetting | null;
  requiresUsWorkAuthorization: boolean;
  questions: MatchQuestion[];
  bookingUrl: string | null;
  notifyNewFits: boolean;
  /** Business days the company commits to answer a yes within. */
  answerByDays: number;
  /** True once the first asks went out; in V1 nothing is charged (`docs/MATCH.md`, "Money"). */
  paid: boolean;
  createdAt: string;
  search: MatchSearchProgress | null;
  candidates: MatchCandidate[];
  counts: MatchJobCounts;
};

export type MatchJobSummary = {
  id: string;
  status: MatchJobStatus;
  job: RecruitJobCard | null;
  createdAt: string;
  counts: MatchJobCounts;
};

export type MatchJobsResponse = { jobs: MatchJobSummary[] };

export type MatchCreateJobRequest = { jobText: string };

export type MatchUpdateJobRequest = {
  payMin?: number | null;
  payMax?: number | null;
  workSetting?: MatchWorkSetting | null;
  requiresUsWorkAuthorization?: boolean;
  questions?: MatchQuestion[];
  bookingUrl?: string | null;
  notifyNewFits?: boolean;
  answerByDays?: number;
  /**
   * `closed` stops new asks and new-fit runs; `live` reopens a job that was
   * closed after its first asks went out. A draft goes live only by sending asks.
   */
  status?: Exclude<MatchJobStatus, "draft">;
};

export type MatchSendAsksRequest = { candidateIds: string[] };

/** A person who said yes, named to this company only. */
export type MatchPerson = {
  askId: string;
  status: MatchAskStatus;
  name: string;
  email: string;
  title: string | null;
  yearsExperience: number | null;
  metro: string | null;
  reason: string;
  linkedinUrl: string | null;
  /** A signed link to the resume, valid for a short time. */
  resumeUrl: string | null;
  idChecked: boolean;
  /** The person came to this job without being asked. Always false in V1. */
  cameToYou: boolean;
  answers: Array<{ question: string; answer: string }>;
  answeredAt: string;
};

export type MatchPeopleResponse = { people: MatchPerson[] };

export type MatchPersonDecisionRequest = { decision: "meet" | "pass" };

/** The terms a person sets once. The pay floor is never shown to a company. */
export type MatchTerms = {
  workSettings: MatchWorkSetting[];
  usWorkAuthorized: boolean | null;
  /** Yearly base pay in USD. */
  payFloor: number | null;
  /** Company names as the person typed them; the API resolves them to companies. */
  blockedCompanies: string[];
  findable: boolean;
};

/** What we read from the resume, shown back once for the person to confirm. */
export type MatchReadOut = {
  title: string | null;
  yearsExperience: number | null;
  lastEmployer: string | null;
  skills: string[];
  metro: string | null;
};

/** What companies see: the outline a card shows, with no name. */
export type MatchOutline = {
  title: string | null;
  summary: string | null;
  skills: string[];
};

export type MatchMe = {
  email: string;
  /** The resume is read and the person can be matched. */
  resumeReady: boolean;
  readOut: MatchReadOut | null;
  terms: MatchTerms;
  setupCompletedAt: string | null;
  idChecked: boolean;
  outline: MatchOutline | null;
};

export type MatchUpdateTermsRequest = Partial<MatchTerms>;

export type MatchAsk = {
  id: string;
  status: MatchAskStatus;
  company: MatchCompany;
  job: RecruitJobCard | null;
  payMin: number | null;
  payMax: number | null;
  workSetting: MatchWorkSetting | null;
  /** Every question the job asks with a yes. */
  questions: MatchQuestion[];
  /**
   * The person's earlier answers to questions with the same text, keyed by
   * `MatchQuestion.key`. Shown pre-filled and editable; never sent unseen.
   */
  savedAnswers: Record<string, string>;
  answerByDays: number;
  askedAt: string;
  /** The person must answer by this time. */
  deadlineAt: string;
  /** The company must reply to a yes by this time. */
  companyReplyBy: string | null;
  /** Set once the company chose to meet. */
  bookingUrl: string | null;
};

export type MatchAsksResponse = { asks: MatchAsk[] };

export type MatchAnswerRequest = {
  answer: "yes" | "no";
  /** Keyed by `MatchQuestion.key`. */
  questionAnswers?: Record<string, string>;
};

export type MatchIdCheckResponse =
  | { status: "verified" }
  | { status: "not_required" }
  | { status: "started"; url: string };
