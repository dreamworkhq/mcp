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

/**
 * Where a requested intro stands. Staff move it past `requested`, and only
 * `requested` can be undone by the recruiter.
 */
export type RecruitIntroStatus = "requested" | "contacted" | "introduced" | "declined";

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
  /** The signed-in recruiter's intro request for this candidate on this search. */
  intro: RecruitIntroStatus | null;
};

/** The job as one compact header: what the role is, where, and for how much. */
export type RecruitJobCard = {
  title: string;
  company: string | null;
  companyDomain: string | null;
  logoUrl: string | null;
  location: string | null;
  salary: string | null;
  /** Under ten words. */
  tagline: string | null;
};

export type RecruitSearch = {
  id: string;
  status: RecruitSearchStatus;
  stage: RecruitSearchStage;
  /** Candidates scored so far, out of `poolSize`. */
  scored: number;
  poolSize: number;
  /** Seekers the search covers; null until retrieval starts, and on searches saved before it was counted. */
  corpusSize: number | null;
  /** One line of what we read from the job description. */
  summary: string | null;
  /** Null until the description is read, and for searches saved before it existed. */
  job: RecruitJobCard | null;
  jobText: string;
  error: string | null;
  createdAt: string;
  candidates: RecruitCandidate[];
};

/** How many intros the signed-in recruiter has requested this calendar month. */
export type RecruitIntroUsage = { usedThisMonth: number; monthlyLimit: number };

/** One saved search, as the Roles list shows it. */
export type RecruitRole = {
  id: string;
  status: RecruitSearchStatus;
  job: RecruitJobCard | null;
  summary: string | null;
  createdAt: string;
  candidateCount: number;
  introCount: number;
};

export type RecruitRolesResponse = { roles: RecruitRole[]; usage: RecruitIntroUsage };

export type RecruitIntroResponse = {
  intro: RecruitIntroStatus | null;
  usage: RecruitIntroUsage;
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

export type AdminRecruitIntroRequest = {
  id: string;
  status: RecruitIntroStatus;
  createdAt: string;
  updatedAt: string;
  recruiterEmail: string;
  searchId: string;
  roleTitle: string | null;
  company: string | null;
  rank: number;
  score: number;
  candidateName: string;
  candidateEmail: string;
  candidateTitle: string | null;
};

export type AdminRecruitIntrosResponse = { requests: AdminRecruitIntroRequest[] };

export type AdminRecruitIntroUpdate = { status: RecruitIntroStatus };
