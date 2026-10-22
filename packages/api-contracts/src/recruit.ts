/**
 * Wire types for the internal recruiter search (/recruit) and its admin
 * allowlist. A candidate is always anonymous on the wire: no name, contact,
 * link, exact date, employer name or school name.
 */

export type RecruitAccess = "allowed" | "waiting";

export type RecruitSession = {
  access: RecruitAccess;
  email: string;
};

export type RecruitSearchStage = "parsing" | "retrieving" | "scoring" | "done";
export type RecruitSearchStatus = "running" | "complete" | "failed";
export type RecruitVote = "up" | "down";

/** The ten boxes on a card, in display order. */
export type RecruitDimensionKey =
  | "skills"
  | "seniority"
  | "domain"
  | "scope"
  | "impact"
  | "stack"
  | "trajectory"
  | "location"
  | "education"
  | "recency";

export type RecruitDimension = { key: RecruitDimensionKey; score: number };

export type RecruitCandidate = {
  /** Stable per person across searches, never the profile id. */
  candidateId: string;
  rank: number;
  overallScore: number;
  reason: string;
  title: string;
  yearsExperience: number | null;
  industry: string | null;
  metro: string | null;
  experience: Array<{ title: string; employer: string | null; years: string | null }>;
  skills: Array<{ name: string; matched: boolean }>;
  dimensions: RecruitDimension[];
  vote: RecruitVote | null;
};

export type RecruitSearch = {
  id: string;
  status: RecruitSearchStatus;
  stage: RecruitSearchStage;
  /** Candidates scored so far, out of `poolSize`. */
  scored: number;
  poolSize: number;
  /** One line of what we read from the job description. */
  summary: string | null;
  jobText: string;
  error: string | null;
  createdAt: string;
  candidates: RecruitCandidate[];
};

export type RecruitCreateSearchRequest = { jobText: string };
export type RecruitParseFileResponse = { text: string };
export type RecruitVoteRequest = { vote: RecruitVote | null };

export type AdminRecruitAllowlistEntry = {
  id: string;
  email: string;
  note: string | null;
  addedByEmail: string | null;
  createdAt: string;
  lastSearchAt: string | null;
};

export type AdminRecruitWaitingAccount = {
  userId: string;
  email: string;
  createdAt: string;
};

export type AdminRecruitAllowlistResponse = {
  entries: AdminRecruitAllowlistEntry[];
  waiting: AdminRecruitWaitingAccount[];
};

export type AdminRecruitAllowlistCreate = { email: string; note?: string | null };
