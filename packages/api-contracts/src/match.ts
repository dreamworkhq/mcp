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
 * Where a person stands with the company after it chose to meet them. The
 * company moves an ask among these (`docs/MATCH.md`, "Outcome stages").
 */
export type MatchOutcomeStage = "meeting" | "interviewing" | "offer" | "hired" | "declined";

/**
 * Where one ask stands. `asked` waits on the person; `yes` and `no` are their
 * answer; `expired` is no answer by the deadline. After a yes the company
 * moves it to `meeting` or `passed`, and from `meeting` through the outcome
 * stages.
 */
export type MatchAskStatus = "asked" | "yes" | "no" | "expired" | "passed" | MatchOutcomeStage;

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
  /** The caller is acting as `company` for a demo: its new jobs never reach anyone. */
  demo: boolean;
  /** Staff and admins may demo as any company. */
  canDemo: boolean;
};

/** A company's domain, such as `acme.com`, for a staff demo. */
export type MatchDemoRequest = { domain: string };

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
  /**
   * One or two lines from the person's own profile note (what they want,
   * work their resume does not list), scrubbed like the rest of the card.
   * Absent when they have none to show.
   */
  inTheirWords?: string[];
};

/**
 * `yes` counts the people waiting on the company's Meet or Pass; `meeting`
 * those it chose to meet, at any outcome stage since.
 */
export type MatchJobCounts = { asked: number; yes: number; meeting: number; newFits: number };

/**
 * A job's autopilot rules: ask anyone new on the daily run scoring at least
 * `minScore` (70 to 95, a card's score times ten) who meets the job's terms,
 * at most `weeklyLimit` (1 to 10) people in any seven days.
 */
export type MatchAutopilotRules = { enabled: boolean; minScore: number; weeklyLimit: number };

/**
 * Why an enabled autopilot sends nothing today. `switched_off` is our kill
 * switch; `job_closed` a closed job; `needs_hand_asks` fewer than three asks
 * sent by hand, or a yes to one of them still waiting on Meet or Pass;
 * `yes_overdue` a yes past the company's answer-by date.
 */
export type MatchAutopilotPause = "switched_off" | "job_closed" | "needs_hand_asks" | "yes_overdue";

/** Who sent an ask: the company by hand, or its autopilot rules. */
export type MatchAskSender = "company" | "autopilot";

/** One ask the autopilot sent, with the score and reason the card showed. */
export type MatchAutopilotSend = {
  askId: string;
  candidateId: string;
  title: string;
  /** The card's score, out of 10. */
  score: number;
  reason: string;
  status: MatchAskStatus;
  askedAt: string;
};

export type MatchAutopilot = {
  rules: MatchAutopilotRules | null;
  /** Set only while the rules are enabled and nothing can be sent. */
  paused: MatchAutopilotPause | null;
  sent: MatchAutopilotSend[];
};

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
  /** True once a hirer confirmed the role is approved and budgeted (`docs/MATCH.md`). */
  budgetApproved: boolean;
  createdAt: string;
  search: MatchSearchProgress | null;
  candidates: MatchCandidate[];
  counts: MatchJobCounts;
  /**
   * Questions asked of each candidate's agent on this job, by candidate id.
   * Null while the candidate agent is switched off.
   */
  agentQuestions: Record<string, MatchAgentExchange[]> | null;
  autopilot: MatchAutopilot;
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
  /** Null clears the rules. */
  autopilot?: MatchAutopilotRules | null;
};

/**
 * `approvedBudget` confirms the role is approved and budgeted. A job with no
 * confirmation on record refuses a send without it: 422 `budget_not_approved`.
 */
export type MatchSendAsksRequest = { candidateIds: string[]; approvedBudget?: true };

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
  /** Yearly base pay in USD the company offered; set at `offer` and kept through `hired` or `declined`. */
  offerBase: number | null;
  /** The outcome stages the company may move this person to now; empty before Meet. */
  moves: MatchOutcomeStage[];
};

export type MatchPeopleResponse = { people: MatchPerson[] };

/**
 * A count of people on the pay curve. Any count under ten is
 * `fewer_than_10`, never a number; counts of ten or more are rounded down to
 * multiples of ten, and curve steps advance only when at least ten more
 * people are reached, so neither a total nor a step difference points at a
 * small group.
 */
export type MatchCurveCount = { kind: "count"; people: number } | { kind: "fewer_than_10" };

/** Strong fits whose pay floor is at or under `pay`, at the job's other terms. */
export type MatchPayStep = { pay: number; people: MatchCurveCount };

/**
 * How many strong fits the job reaches at each pay level, from the current
 * run's scores (`docs/MATCH.md`, "Pay curve"). Counts only: no floor or
 * person is ever named.
 */
export type MatchPayCurve = {
  /** Yearly USD, $10k apart, lowest first. */
  steps: MatchPayStep[];
  /** The pay the job is held to (its top, or its lowest when that is all it states). */
  pay: number;
  /** Strong fits at the job's terms as they stand. */
  reached: MatchCurveCount;
  /**
   * The strong fits dropping each term would add at the job's pay; null when
   * the job does not set that term.
   */
  loosen: { workSetting: MatchCurveCount | null; usWorkAuthorization: MatchCurveCount | null };
};

/** `curve` is null until the job states pay and its current run finished as a pay-curve run. */
export type MatchPayCurveResponse = { curve: MatchPayCurve | null };

export type MatchPersonDecisionRequest = { decision: "meet" | "pass" };

/**
 * Moves a person the company met to another outcome stage. `from` is the
 * stage the page showed; the move lands only if the ask is still there.
 * `offer` carries the yearly base pay in USD; correcting an existing offer
 * (`from: "offer"`) also carries `expectedOfferBase`, the amount the page
 * showed, so a stale tab cannot overwrite a newer amount.
 */
export type MatchMoveStageRequest =
  | { from: MatchOutcomeStage; to: Exclude<MatchOutcomeStage, "offer"> }
  | { from: Exclude<MatchOutcomeStage, "offer">; to: "offer"; offerBase: number }
  | { from: "offer"; to: "offer"; offerBase: number; expectedOfferBase: number | null };

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

/**
 * What one line of a profile note says: what the person wants next, why they
 * would move, what they will not do, or work their resume cannot list.
 */
export type MatchNoteKind = "want" | "reason" | "limit" | "work";

/** One approved line, in the third person, at most 160 characters. */
export type MatchNoteLine = { kind: MatchNoteKind; text: string };

/** The lines a person saved (at most six), and when. */
export type MatchProfileNote = { lines: MatchNoteLine[]; updatedAt: string };

/** The note as the person sees it in Match. */
export type MatchMeNote = MatchProfileNote & {
  /** Exactly what a company's card shows under "In their words"; empty when nothing would show. */
  onCard: string[];
  /** The note is old enough that the person is asked whether it is still true. */
  confirmDue: boolean;
};

/**
 * The things a person can tap as "won't do" in setup. The API holds each
 * one's chip label and note line (`engine/match/profile-note.ts`) and sends
 * them with the suggestions, so this union is the one list.
 */
export type MatchWontDoKey =
  | "relocation"
  | "on_call"
  | "agencies"
  | "crypto"
  | "travel"
  | "contract"
  | "early_stage"
  | "big_company";

/**
 * A guess read from the resume, for the person to confirm with one tap.
 * `role` becomes a `want` line; `setting` sets the work-setting term and a
 * `want` line; `pay` sets only the private pay floor, never a line.
 */
export type MatchNoteGuess =
  | { key: "role"; title: string }
  | { key: "setting"; setting: MatchWorkSetting }
  | { key: "pay"; payFloor: number };

/** `GET /match/me/note/suggestions`: guesses for what is not answered yet, and the won't-do chips. */
export type MatchNoteSuggestions = {
  guesses: MatchNoteGuess[];
  wontDo: Array<{ key: MatchWontDoKey; label: string; line: MatchNoteLine }>;
  /** The resume identity version these guesses came from, passed back on `PUT /match/me/note`. */
  profileIdentityVersion?: number;
};

/** `POST /match/me/note/distill`: the one free-text line, read into note lines. */
export type MatchDistillNoteRequest = { text: string };

/** Lines as they would be saved, and exactly what a company's card would show from them. */
export type MatchNoteDraft = { lines: MatchNoteLine[]; onCard: string[] };

/** `PUT /match/me/note` and `POST /match/me/note/preview`. */
export type MatchSaveNoteRequest = {
  lines: MatchNoteLine[];
  /**
   * Optional profile identity version from `MatchMe` or `MatchNoteSuggestions`.
   * When set, `PUT /match/me/note` and `POST /match/me/note/preview` reject
   * with 409 if the account has moved to a different resume identity.
   */
  expectedProfileIdentityVersion?: number;
};

export type MatchMe = {
  email: string;
  /** The resume is read and the person can be matched. */
  resumeReady: boolean;
  /** Positive version of the current resume identity, or null when no profile exists or a reset is in progress. */
  profileIdentityVersion: number | null;
  readOut: MatchReadOut | null;
  terms: MatchTerms;
  setupCompletedAt: string | null;
  idChecked: boolean;
  outline: MatchOutline | null;
  /** The candidate agent is on (`MATCH_CANDIDATE_AGENT_ENABLED`). */
  agentEnabled: boolean;
  /** The profile note is on (`MATCH_PROFILE_CHAT_ENABLED`). */
  noteEnabled: boolean;
  /** Null when the note is off or none is saved. */
  note: MatchMeNote | null;
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
  /**
   * After a yes, the company holds this pay until this time, 60 days from
   * the yes. Null before a yes, after a pass, once the time has passed, or
   * when the ask holds no pay.
   */
  payLockedUntil: string | null;
  /**
   * Why the company asked, as one positive line to the person, written once
   * when the ask was sent. Null when it could not be written.
   */
  reason: string | null;
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
  /** Yearly base pay in USD the company offered, once it recorded an offer. */
  offerBase: number | null;
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

/** A question the company asks of every card on a job's page, answered from each resume. */
export type MatchPoolQuestionRequest = { question: string };

/**
 * One card's answer. `line` restates only what the resume says, scrubbed like
 * the card, or is exactly "Not in their profile" with relevance 0.
 */
export type MatchPoolAnswer = { candidateId: string; relevance: number; line: string };

/** The page's cards in the order the question ranks them, most relevant first. */
export type MatchPoolQuestionResponse = { question: string; answers: MatchPoolAnswer[] };

/**
 * Where a question asked of a person's agent stands. `agent` was answered
 * from the profile. `pending` was not, and waits on the person, who answers
 * it (`answered`) or dismisses it (`dismissed`).
 */
export type MatchAgentQuestionStatus = "agent" | "pending" | "answered" | "dismissed";

/** A company's question to one anonymous candidate's agent, as the company sees it. */
export type MatchAgentExchange = {
  id: string;
  question: string;
  /**
   * The agent's answer, or "Not in their profile". Once the person answers a
   * pending question, an anonymous third-person summary of their reply,
   * scrubbed like the card.
   */
  answer: string;
  byPerson: boolean;
  askedAt: string;
};

export type MatchAgentAskRequest = { question: string };

/** A question asked of the person's agent, as the person sees it. */
export type MatchAgentQuestion = {
  id: string;
  status: MatchAgentQuestionStatus;
  company: MatchCompany;
  jobTitle: string | null;
  question: string;
  /** What the agent told the company. */
  agentAnswer: string;
  /** Anonymized summary of the person's own answer to a pending question. */
  answer: string | null;
  askedAt: string;
};

export type MatchAgentQuestionsResponse = { questions: MatchAgentQuestion[] };

export type MatchAgentAnswerRequest = { answer: string };
