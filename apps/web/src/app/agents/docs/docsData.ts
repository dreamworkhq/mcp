export type DocPage = {
  slug: string;
  label: string;
  group: "Start" | "Core surface" | "Automation" | "Reference";
  title: string;
  eyebrow: string;
  summary: string;
};

export type EndpointStatus = "stable" | "beta" | "stabilizing";

export type EndpointMethod =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "TOOL";

export type Endpoint = {
  method: EndpointMethod;
  path: string;
  description: string;
  status: EndpointStatus;
};

export type EndpointGroup = {
  id: string;
  title: string;
  blurb: string;
  endpoints: Endpoint[];
};

export type McpTool = {
  name: string;
  purpose: string;
  calls: string;
};

export const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_ORIGIN?.trim().replace(/\/$/, "") ||
  "https://www.dreamworkhq.com";

export const DOCS_BASE_PATH = "/agents/docs";

export const DOC_PAGES: DocPage[] = [
  {
    slug: "overview",
    label: "Overview",
    group: "Start",
    title: "Agent docs",
    eyebrow: "Start",
    summary:
      "How Dreamwork exposes the long-term job-search intelligence layer to agents.",
  },
  {
    slug: "quickstart",
    label: "Quickstart",
    group: "Start",
    title: "Quickstart",
    eyebrow: "Start",
    summary:
      "Get an agent key, run the MCP package, and make the first HTTP request against Dreamwork.",
  },
  {
    slug: "authentication",
    label: "Authentication",
    group: "Start",
    title: "Authentication",
    eyebrow: "Start",
    summary:
      "Keys represent a single candidate, carry the scopes they were given, and inherit that candidate's limits, access tier, and feature flags.",
  },
  {
    slug: "mcp",
    label: "MCP server",
    group: "Automation",
    title: "MCP server",
    eyebrow: "Automation",
    summary:
      "Use Dreamwork through MCP tools backed by the same authenticated service as the web app.",
  },
  {
    slug: "http-endpoints",
    label: "HTTP endpoints",
    group: "Core surface",
    title: "HTTP endpoints",
    eyebrow: "Core surface",
    summary:
      "The current route surface for listings, profiles, pipeline jobs, application packs, and workflow triggers.",
  },
  {
    slug: "profiles",
    label: "Profiles",
    group: "Core surface",
    title: "Profiles",
    eyebrow: "Core surface",
    summary:
      "Candidate identity, resume readiness, preferences, and profile analysis exposed to web and agent clients.",
  },
  {
    slug: "listings",
    label: "Listings",
    group: "Core surface",
    title: "Listings",
    eyebrow: "Core surface",
    summary:
      "Public listings, personalized recommendations, dismissal signals, and add-to-pipeline handoff.",
  },
  {
    slug: "pipeline",
    label: "Pipeline",
    group: "Core surface",
    title: "Pipeline",
    eyebrow: "Core surface",
    summary:
      "Added roles, stage updates, job details, tailored packs, and application status for a candidate.",
  },
  {
    slug: "applications",
    label: "Applications",
    group: "Automation",
    title: "Applications",
    eyebrow: "Automation",
    summary:
      "Generate tailored materials, submit applications, and route anything uncertain back to the candidate.",
  },
  {
    slug: "conventions",
    label: "Conventions",
    group: "Reference",
    title: "Conventions",
    eyebrow: "Reference",
    summary:
      "Base URLs, response formats, errors, rate limits, plans, and contract status.",
  },
  {
    slug: "changelog",
    label: "Changelog",
    group: "Reference",
    title: "Changelog",
    eyebrow: "Reference",
    summary:
      "What changed in the agent surface and which contracts are stable or still maturing.",
  },
];

export const DOC_SLUGS = DOC_PAGES.map((page) => page.slug);

export const ENDPOINT_GROUPS: EndpointGroup[] = [
  {
    id: "discovery",
    title: "Discovery",
    blurb:
      "Read platform listings, personalized recommendations, and hidden-listing state. Public listing detail is available without a candidate key; personalized routes use candidate context.",
    endpoints: [
      {
        method: "GET",
        path: "/listings",
        description:
          "Paginated live listings with company, function, seniority, and remote filters.",
        status: "stable",
      },
      {
        method: "GET",
        path: "/listings/:id",
        description:
          "Full detail for one listing: description, salary, company, source metadata, and apply URL.",
        status: "stable",
      },
      {
        method: "GET",
        path: "/listings/recommended",
        description:
          "Personalized matches ranked against the candidate's profile and preferences.",
        status: "beta",
      },
      {
        method: "POST",
        path: "/listings/:id/dismiss",
        description:
          "Hide a listing from future recommendations for the authenticated candidate.",
        status: "stabilizing",
      },
      {
        method: "GET",
        path: "/listings/dismissed",
        description: "Return listings the candidate has hidden.",
        status: "stabilizing",
      },
    ],
  },
  {
    id: "profiles",
    title: "Profiles",
    blurb:
      "Candidate context for every agent action: identity, resume status, preferences, assets, and analysis.",
    endpoints: [
      {
        method: "GET",
        path: "/profile",
        description:
          "Return profile, resume status, readiness flags, and plan information.",
        status: "stable",
      },
      {
        method: "PUT",
        path: "/profile",
        description:
          "Patch candidate profile fields from structured agent input.",
        status: "stable",
      },
      {
        method: "POST",
        path: "/profile/preferences/natural-language",
        description:
          "Turn plain-English preferences into structured search constraints.",
        status: "beta",
      },
      {
        method: "GET",
        path: "/profile/analysis",
        description:
          "Resume analysis output: skills, seniority, salary range, and fit signals.",
        status: "beta",
      },
      {
        method: "POST",
        path: "/profile/resume/reprocess",
        description:
          "Re-run resume parsing and profile analysis for the candidate.",
        status: "stabilizing",
      },
    ],
  },
  {
    id: "pipeline",
    title: "Pipeline",
    blurb:
      "The candidate's working set of roles across web, HTTP, and MCP clients. Updates are user-scoped and durable.",
    endpoints: [
      {
        method: "GET",
        path: "/pipeline",
        description:
          "Kanban-shaped response: added, in review, pack-ready, sent, and closed.",
        status: "stable",
      },
      {
        method: "PATCH",
        path: "/pipeline/:jobId/status",
        description: "Move one added job between pipeline stages.",
        status: "stabilizing",
      },
      {
        method: "GET",
        path: "/jobs",
        description: "List added jobs with optional status and limit filters.",
        status: "stable",
      },
      {
        method: "POST",
        path: "/listings/:id/add",
        description: "Add a platform listing to the candidate's pipeline.",
        status: "stable",
      },
      {
        method: "POST",
        path: "/jobs",
        description:
          "Manually add a job that did not come from the platform listing index.",
        status: "stabilizing",
      },
      {
        method: "GET",
        path: "/jobs/:id/details",
        description: "Fetch an added job with application and pack state.",
        status: "stable",
      },
      {
        method: "GET",
        path: "/jobs/:id",
        description: "Read full details for one added job.",
        status: "stable",
      },
      {
        method: "POST",
        path: "/jobs/import",
        description: "Import a job from a URL and extract structured details.",
        status: "beta",
      },
      {
        method: "POST",
        path: "/jobs/:id/skip",
        description: "Skip or dismiss an added job.",
        status: "stabilizing",
      },
    ],
  },
  {
    id: "applications",
    title: "Applications",
    blurb:
      "Generate application materials, trigger submission, and surface cases that require candidate review.",
    endpoints: [
      {
        method: "POST",
        path: "/jobs/:id/pack",
        description:
          "Queue application materials for an added job. `assets` names a subset (`resume`, `coverLetter`, `answers`); omitting it generates all three.",
        status: "beta",
      },
      {
        method: "GET",
        path: "/applications/:id/pack",
        description:
          "Read generated pack state and application materials for an application.",
        status: "beta",
      },
      {
        method: "POST",
        path: "/jobs/:id/apply",
        description:
          "Submit the prepared application or return a candidate-review state when more context is needed.",
        status: "stabilizing",
      },
      {
        method: "POST",
        path: "/applications/:id/resume",
        description: "Generate a tailored resume for an application.",
        status: "beta",
      },
      {
        method: "GET",
        path: "/applications/:id/resumes",
        description: "List tailored resumes generated for an application.",
        status: "beta",
      },
    ],
  },
  {
    id: "review",
    title: "Candidate review",
    blurb:
      "Escalations route uncertain cases back to the candidate instead of silently applying with missing context.",
    endpoints: [
      {
        method: "GET",
        path: "/escalations",
        description: "List pending items that need candidate attention.",
        status: "stabilizing",
      },
      {
        method: "POST",
        path: "/escalations/:id/resolve",
        description:
          "Resolve an escalation with a reply, retry, human takeover, or dismissal.",
        status: "stabilizing",
      },
    ],
  },
  {
    id: "outreach",
    title: "Contacts and outreach",
    blurb:
      "Optional recruiter and referrer workflows for agents that coordinate candidate-reviewed outreach.",
    endpoints: [
      {
        method: "GET",
        path: "/contacts",
        description: "List saved contacts, optionally filtered by company.",
        status: "stabilizing",
      },
      {
        method: "POST",
        path: "/contacts",
        description: "Add a recruiter or referrer contact.",
        status: "stabilizing",
      },
      {
        method: "POST",
        path: "/outreach/generate",
        description:
          "Generate a personalized outreach draft for a contact and job.",
        status: "beta",
      },
      {
        method: "POST",
        path: "/outreach/send",
        description: "Send an outreach email to a contact.",
        status: "stabilizing",
      },
    ],
  },
  {
    id: "signals",
    title: "Signals",
    blurb:
      "Read-only product signals that help agents summarize pipeline progress and detected interviews.",
    endpoints: [
      {
        method: "GET",
        path: "/stats",
        description: "Read aggregate pipeline stats.",
        status: "stable",
      },
      {
        method: "GET",
        path: "/interviews",
        description: "List detected interviews with schedule details.",
        status: "stabilizing",
      },
    ],
  },
  {
    id: "assistant-actions",
    title: "Assistant actions",
    blurb:
      "One route per registry action, the same code the MCP tools and the on-site assistant run. Send { args } and, to confirm a held act, the confirmationToken from the held answer.",
    endpoints: [
      {
        method: "POST",
        path: "/assistant/actions/:id",
        description:
          "Run one action, such as prepare_applications, get_application_readiness, get_updates_since, or apply. Consequential actions answer held with a summary and a token first.",
        status: "beta",
      },
      {
        method: "GET",
        path: "/assistant/tasks",
        description: "List the candidate's recent action tasks and their receipts.",
        status: "beta",
      },
      {
        method: "GET",
        path: "/assistant/tasks/:id",
        description: "Read one task: the action, its status, the object it touched, its receipt, any error code, and when its undo window closes.",
        status: "beta",
      },
      {
        method: "POST",
        path: "/assistant/tasks/:id/undo",
        description: "Undo a completed task while its undo window is still open.",
        status: "beta",
      },
      {
        method: "POST",
        path: "/assistant/tasks/:id/cancel",
        description: "Cancel a task that has not finished, such as a queued application.",
        status: "beta",
      },
    ],
  },
];

// generated:mcp-tools:start
// Generated by `pnpm --filter @dreamworkhq/mcp docs` from the MCP server's
// own tool catalog. Edit the tool, not this array.
export const MCP_TOOLS: McpTool[] = [
  {
    name: "add_contact",
    purpose: "Adds a recruiter or referrer contact to the account using the supplied contact details.",
    calls: "POST /contacts",
  },
  {
    name: "add_jobs",
    purpose: "Adds a job to the account's private pipeline using title, company and optional description, URL, contact email and application method.",
    calls: "POST /jobs",
  },
  {
    name: "apply",
    purpose: "Submits one application to an employer under the account holder's name using the saved materials at expectedRevision.",
    calls: "POST /assistant/actions/apply",
  },
  {
    name: "browse_listings",
    purpose: "Returns indexed listings filtered by title or company keywords, function, seniority, work setting, location, pay, benefits, industry, AI role, internship and posting or discovery age.",
    calls: "GET /listings",
  },
  {
    name: "cancel_apply",
    purpose: "Stops a queued or in-progress application when submission can still be prevented.",
    calls: "POST /assistant/actions/cancel_apply",
  },
  {
    name: "confirm_hypothesis",
    purpose: "Promotes a stored hypothesis after the person confirms it, then deletes the hypothesis.",
    calls: "POST /assistant/actions/confirm_hypothesis",
  },
  {
    name: "dismiss_match",
    purpose: "Removes one role from the account's match feed and stores the person's supplied reason as matching feedback.",
    calls: "POST /assistant/actions/dismiss_match",
  },
  {
    name: "edit_answer",
    purpose: "Revises one employer-question answer identified by questionId; other answers and documents remain unchanged.",
    calls: "POST /assistant/actions/edit_answer",
  },
  {
    name: "edit_cover_letter",
    purpose: "Revises an existing application's cover letter using the supplied instruction.",
    calls: "POST /assistant/actions/edit_cover_letter",
  },
  {
    name: "edit_resume",
    purpose: "Revises one application's tailored resume using the supplied instruction, preserving its formatting and regenerating the PDF.",
    calls: "POST /assistant/actions/edit_resume",
  },
  {
    name: "forget_hypothesis",
    purpose: "Deletes the specified unconfirmed career hypothesis from the account's stored hypotheses.",
    calls: "POST /assistant/actions/forget_hypothesis",
  },
  {
    name: "format_resume",
    purpose: "Changes alignment, bold, italic or underline formatting of a tailored resume without changing its words.",
    calls: "POST /assistant/actions/format_resume",
  },
  {
    name: "generate_outreach",
    purpose: "Generates a personalized outreach-email draft for the specified contact and job.",
    calls: "POST /outreach/generate",
  },
  {
    name: "generate_pack",
    purpose: "Queues a tailored resume, cover letter and employer-question answers for one saved role.",
    calls: "POST /assistant/actions/generate_pack",
  },
  {
    name: "generate_resume",
    purpose: "Generates a tailored resume for the specified account-owned application and returns its result.",
    calls: "POST /applications/:id/resume",
  },
  {
    name: "get_application_documents",
    purpose: "Returns version-specific resume PDF and DOCX, cover-letter PDF and combined-pack PDF download links for one application, plus source, inclusion, lock state and revision.",
    calls: "POST /assistant/actions/get_application_documents",
  },
  {
    name: "get_application_materials",
    purpose: "Returns one account-owned application's default and tailored resume contents, cover letter, selected variant, inclusion, lock state and optimistic revision.",
    calls: "GET /applications/:id/pack",
  },
  {
    name: "get_application_readiness",
    purpose: "Returns readiness for one-off submission and Autopilot, plan entitlement and missing onboarding answers.",
    calls: "POST /assistant/actions/get_application_readiness",
  },
  {
    name: "get_application_status",
    purpose: "Returns an application's event timeline and separate submitted, employerConfirmed and replied facts.",
    calls: "POST /assistant/actions/get_application_status",
  },
  {
    name: "get_autopilot_settings",
    purpose: "Returns the saved minimum Matches score and default-versus-tailored resume choice for Autopilot.",
    calls: "POST /assistant/actions/get_autopilot_settings",
  },
  {
    name: "get_autopilot_status",
    purpose: "Returns Autopilot state, daily and monthly sent counts and plan limits, match-score floor, eligible and in-flight counts and nextRunAt.",
    calls: "POST /assistant/actions/get_autopilot_status",
  },
  {
    name: "get_career_record",
    purpose: "Returns resume-derived professional facts, document-vault metadata, person-stated preferences, writing preferences and unconfirmed hypotheses as separate fields.",
    calls: "POST /assistant/actions/get_career_record",
  },
  {
    name: "get_communication_preferences",
    purpose: "Returns job-alert settings and cadence, Autopilot result-email mode, product-update consent and the all-optional-emails-off state.",
    calls: "POST /assistant/actions/get_communication_preferences",
  },
  {
    name: "get_generated_resumes",
    purpose: "Returns tailored resumes generated for the specified account-owned application.",
    calls: "GET /applications/:id/resumes",
  },
  {
    name: "get_inbox",
    purpose: "Returns recruiter conversations ordered by newest activity, including role, message kind, unread state and whether the employer wrote last.",
    calls: "POST /assistant/actions/get_inbox",
  },
  {
    name: "get_job",
    purpose: "Returns one saved or corpus role by id with full description, company, location and remote terms, salary, posted date, match score, saved state, board column, application id, material readiness and work-eligibility verdict.",
    calls: "POST /assistant/actions/get_job",
  },
  {
    name: "get_listing",
    purpose: "Returns full details of a platform job listing identified by id.",
    calls: "GET /listings/:id",
  },
  {
    name: "get_pack_status",
    purpose: "Returns material preparation state for the specified application, board-card or listing ids: queued, generating, ready, partial, failed, stale, not_started or not_found.",
    calls: "POST /assistant/actions/get_pack_status",
  },
  {
    name: "get_pipeline",
    purpose: "Returns saved and applied roles as board cards with column, application id and last-moved time.",
    calls: "POST /assistant/actions/get_pipeline",
  },
  {
    name: "get_platform_context",
    purpose: "Returns Dreamwork's job-search, pipeline, resume-tailoring, application, outreach, escalation and interview capabilities, plus its product context.",
    calls: "MCP context",
  },
  {
    name: "get_preferences",
    purpose: "Returns stated target functions, work locations and modes, relocation, pay floor, availability, deal-breakers, seniority, AI-role interest and cover-letter settings.",
    calls: "POST /assistant/actions/get_preferences",
  },
  {
    name: "get_profile",
    purpose: "Returns the authenticated account's profile, resume text, preferences and profileIdentityVersion snapshot.",
    calls: "GET /profile",
  },
  {
    name: "get_stats",
    purpose: "Returns aggregate account-owned job, application, escalation and outreach statistics.",
    calls: "GET /stats",
  },
  {
    name: "get_task",
    purpose: "Returns one account-owned assistant ledger entry by taskId, including action, arguments, status, receipt and error code.",
    calls: "POST /assistant/actions/get_task",
  },
  {
    name: "get_unread_reminders",
    purpose: "Returns unread recruiter-message and thread counts, oldest unread time and recent message previews with thread, company, role and kind.",
    calls: "POST /assistant/actions/get_unread_reminders",
  },
  {
    name: "get_updates_since",
    purpose: "Returns new matches, board-status changes, employer-mail threads and Autopilot state since the supplied timestamp.",
    calls: "POST /assistant/actions/get_updates_since",
  },
  {
    name: "get_upgrade_link",
    purpose: "Returns a browser link to checkout for the requested Pro or Dreamer plan and optional billing interval or promo code.",
    calls: "GET /public/billing/upgrade-link",
  },
  {
    name: "get_usage",
    purpose: "Returns the account's plan tier, packs and applications used today, their allowance limits and the next reset time.",
    calls: "POST /assistant/actions/get_usage",
  },
  {
    name: "import_job",
    purpose: "Fetches a public job-posting URL and imports it as a private role in the account's pipeline.",
    calls: "POST /assistant/actions/import_job",
  },
  {
    name: "list_contacts",
    purpose: "Returns the account's saved recruiter and referrer contacts, optionally filtered by company.",
    calls: "GET /contacts",
  },
  {
    name: "list_escalations",
    purpose: "Returns pending account-owned application escalations requiring human attention.",
    calls: "GET /escalations",
  },
  {
    name: "list_interviews",
    purpose: "Returns all interviews detected for the account, including role, company, time and platform when known.",
    calls: "GET /interviews",
  },
  {
    name: "list_matches",
    purpose: "Returns the account's ranked live match pool with job id, its Dreamwork page url, title, company, location, remote terms, salary, dates, match percent and saved/applied state.",
    calls: "POST /assistant/actions/list_matches",
  },
  {
    name: "list_tasks",
    purpose: "Returns recent account-owned assistant actions, newest first, across the site and MCP.",
    calls: "POST /assistant/actions/list_tasks",
  },
  {
    name: "mark_applied_offsite",
    purpose: "Records an application the account holder submitted outside Dreamwork.",
    calls: "POST /assistant/actions/mark_applied_offsite",
  },
  {
    name: "mark_messages_read",
    purpose: "Marks the specified recruiter messages read within one thread.",
    calls: "POST /assistant/actions/mark_messages_read",
  },
  {
    name: "move_pipeline",
    purpose: "Moves one role's board card to the requested column using the account holder's reported state.",
    calls: "POST /assistant/actions/move_pipeline",
  },
  {
    name: "parse_preferences_text",
    purpose: "Parses a sentence describing job preferences, applies supported fields and returns applied values and unparsed fragments.",
    calls: "POST /assistant/actions/parse_preferences_text",
  },
  {
    name: "prepare_applications",
    purpose: "Saves and prepares materials for up to ten specified roles sequentially without submitting applications.",
    calls: "POST /assistant/actions/prepare_applications",
  },
  {
    name: "remember_hypothesis",
    purpose: "Stores an unconfirmed career hypothesis separately from established facts.",
    calls: "POST /assistant/actions/remember_hypothesis",
  },
  {
    name: "reopen_application_materials",
    purpose: "Opens a new editable material revision only after the API establishes that a failed application cannot still submit.",
    calls: "POST /applications/:id/materials/reopen",
  },
  {
    name: "replace_application_document",
    purpose: "Replaces one application's resume or cover letter with the person's supplied text or raw-base64 PDF, DOCX, TXT or MD.",
    calls: "POST /assistant/actions/replace_application_document",
  },
  {
    name: "reply_to_recruiter",
    purpose: "Sends the supplied reply text to one existing recruiter conversation under the account holder's identity.",
    calls: "POST /assistant/actions/reply_to_recruiter",
  },
  {
    name: "resolve_escalation",
    purpose: "Closes one escalation by dismissing it or recording human_takeover.",
    calls: "POST /escalations/:id/resolve",
  },
  {
    name: "restore_material",
    purpose: "Restores a cover letter, tailored resume or answer to a recorded pre-edit version within its undo window.",
    calls: "POST /assistant/actions/restore_material",
  },
  {
    name: "save_application_answers",
    purpose: "Saves person-stated application-answer and contact groups through onboarding validation, then rechecks readiness and completes setup when no requirements remain.",
    calls: "POST /assistant/actions/save_application_answers",
  },
  {
    name: "save_job",
    purpose: "Saves one role to the account's pipeline at SAVED.",
    calls: "POST /assistant/actions/save_job",
  },
  {
    name: "set_autopilot",
    purpose: "Sets Autopilot on, off or paused after explicit consent.",
    calls: "POST /assistant/actions/set_autopilot",
  },
  {
    name: "start_checkout",
    purpose: "Returns a checkout URL for the requested plan change after explicit consent.",
    calls: "POST /assistant/actions/start_checkout",
  },
  {
    name: "strengthen_application",
    purpose: "Improves an application's existing materials against its role and recorded career evidence, spending one refine allowance per changed asset.",
    calls: "POST /assistant/actions/strengthen_application",
  },
  {
    name: "undo_last",
    purpose: "Reverses the latest action with an available undo, or the action identified by taskId.",
    calls: "POST /assistant/actions/undo_last",
  },
  {
    name: "update_application_materials",
    purpose: "Updates an application's resume selection, resume or cover-letter contents or inclusion at the expected optimistic revision.",
    calls: "PATCH /applications/:id/materials",
  },
  {
    name: "update_autopilot_settings",
    purpose: "Changes the minimum Matches score from 70 to 97, with null restoring 70, or the default-versus-tailored resume choice.",
    calls: "POST /assistant/actions/update_autopilot_settings",
  },
  {
    name: "update_communication_preferences",
    purpose: "Changes the supplied optional email categories while preserving omitted settings.",
    calls: "POST /assistant/actions/update_communication_preferences",
  },
  {
    name: "update_preferences",
    purpose: "Merges the supplied preference fields into the account's stored preferences and refreshes matching.",
    calls: "POST /assistant/actions/update_preferences",
  },
  {
    name: "update_profile",
    purpose: "Updates profile text fields such as name, email, phone and tone.",
    calls: "PUT /profile",
  },
  {
    name: "upload_resume",
    purpose: "Uploads original resume-file bytes encoded as base64 with PDF, DOCX, TXT, MD, PNG, JPG, JPEG or WEBP format and the current profileIdentityVersion.",
    calls: "POST /profile/resume",
  },
];
// generated:mcp-tools:end

export function docsHref(slug: string) {
  return slug === "overview" ? DOCS_BASE_PATH : `${DOCS_BASE_PATH}/${slug}`;
}

export function findDocPage(slug?: string) {
  return DOC_PAGES.find((page) => page.slug === (slug || "overview"));
}
