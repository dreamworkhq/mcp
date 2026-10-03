import { z } from "zod";
import { defineAction } from "../action.js";
import { openDestinationSchema, openParamsSchema } from "../destinations.js";
import { ASSISTANT_EVENTS } from "../events.js";
import { JOB_FUNCTIONS } from "../jobFunctions.js";
import { MATCH_SENIORITIES } from "../listingFilters.js";
import { receiptSchema } from "../receipt.js";

/**
 * A multi-select family, as a patch over the set the person already has.
 *
 * Function and seniority are unions in the tray and the person builds them by
 * hand. A single string could only REPLACE one, so "add design" silently took
 * Engineering away. `add` and `remove` are the ordinary case; `set` is the
 * wholesale replacement, and it has to be asked for.
 */
function chipSet<T extends readonly [string, ...string[]]>(values: T) {
  return z
    .object({
      set: z
        .array(z.enum(values))
        .max(values.length)
        .optional()
        .describe(
          "Replace the whole selection. `add` and `remove` are usually what the person meant; `set` throws away a selection they built by hand.",
        ),
      add: z.array(z.enum(values)).max(values.length).optional(),
      remove: z.array(z.enum(values)).max(values.length).optional(),
    })
    .nullable()
    .optional();
}

/**
 * The Matches feed's filter patch.
 *
 * Named and exported so the cost classification in `matchFilterCost.ts`
 * can key an exhaustive record off it: a filter added here without a cost
 * fails to compile rather than defaulting to "cheap" and skipping a
 * confirmation the person waits behind.
 */
export const setFiltersInput = z.object({
  query: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .describe("Free-text search over the listings."),
  functions: chipSet(JOB_FUNCTIONS),
  seniorities: chipSet(MATCH_SENIORITIES),
  internships: z
    .boolean()
    .nullable()
    .optional()
    .describe(
      "Internships, co-ops, and apprenticeships only. Its own filter, not a seniority; false and null both turn it off.",
    ),
  aiRoles: z
    .boolean()
    .nullable()
    .optional()
    .describe("AI roles only. false and null both turn it off."),
  workSetting: z
    .array(z.enum(["Remote", "Hybrid", "Onsite"]))
    .max(3)
    .nullable()
    .optional()
    .describe(
      'The work settings to keep, as a union. ["Remote"] is "only remote"; ["Hybrid","Onsite"] is "not remote". null drops the constraint, which WIDENS the feed to every work setting — never send it for "not remote".',
    ),
  location: z
    .string()
    .max(120)
    .nullable()
    .optional()
    .describe(
      "A city, region, or country in the person's own words; a place the server cannot resolve is refused rather than shown as a filter.",
    ),
  nearMe: z
    .boolean()
    .optional()
    .describe(
      "Filter to the person's own stated location. Refused when their profile names no place.",
    ),
  minMatchPercent: z
    .union([z.literal(70), z.literal(85)])
    .nullable()
    .optional()
    .describe(
      "Match-quality floor, and the feed has only these two. Refused while the All jobs scope is on: those listings carry no score.",
    ),
  // The feed has four freshness windows and no way to express any other
  // number: a request for 60 days used to find no chip, change nothing,
  // and still report success. The literals are the whole vocabulary, so a
  // value outside them is refused with a reason instead of dropped.
  postedWithinDays: z
    .union([z.literal(1), z.literal(3), z.literal(7), z.literal(30)])
    .nullable()
    .optional()
    .describe(
      "Posted within this many days, and the feed has only these four windows. Pick the one that covers what they asked for; any other number is refused.",
    ),
  minSalary: z
    .int()
    .positive()
    .nullable()
    .optional()
    .describe("Pay floor in whole dollars, e.g. 180000."),
  maxSalary: z
    .int()
    .positive()
    .nullable()
    .optional()
    .describe(
      "Pay ceiling in whole dollars. Sending one bound leaves the other as it is.",
    ),
  equity: z.boolean().nullable().optional(),
  bonus: z.boolean().nullable().optional(),
  healthcare: z.boolean().nullable().optional(),
  industry: z
    .string()
    .max(60)
    .nullable()
    .optional()
    .describe(
      "The employer's industry, from the tray's own list. The control is off for most accounts, and the request is then refused rather than ignored.",
    ),
  scope: z
    .enum(["matches", "all_jobs"])
    .nullable()
    .optional()
    .describe(
      "Their ranked matches, or a search across every listing. null means matches.",
    ),
  sort: z
    .enum(["relevance", "newest", "comp-desc", "comp-asc"])
    .nullable()
    .optional()
    .describe(
      "Feed order. It is a view mode rather than a filter, so `reset` leaves it alone and null puts it back to relevance.",
    ),
  tray: z
    .enum(["open", "closed"])
    .optional()
    .describe(
      "Show or hide the Filters panel itself. It changes no filter — the chips stay exactly as they are — and it is how \"close the filters\" and \"open the filters\" are answered.",
    ),
  reset: z
    .boolean()
    .optional()
    .describe(
      "Clear every filter — chips, location, industry, search text — before applying the keys above. The sort order survives it.",
    ),
});

/**
 * Actions that change what the person sees rather than what the records say.
 * They execute in the attached browser session and nowhere else, which is why
 * every one of them is withheld from MCP as `needs_attached_browser`: an MCP
 * client has no screen to move, and a tool that silently does nothing is worse
 * than one that is absent.
 */
export const viewActions = [
  defineAction({
    id: "open",
    kind: "view",
    risk: "cheap",
    title: "Open a page",
    description:
      "Move the person's browser to one of the product's named pages, from the fixed set in `destination` — you do not type a URL. Use it when the answer is on a page they are not on: \"take me to my matches\", \"show me my applications\", \"open that role\". `job` and `pack` each open one listing or its materials and need `params.listingId`.",
    input: z.object({
      destination: openDestinationSchema.describe("Which named page to open."),
      params: openParamsSchema
        .optional()
        .describe(
          "`job` and `pack` take `listingId`. `profile` takes `section` — `about` (About you), `preferences` (Job preferences), `resume` (Resume), `vault` (Work vault), `ai` (AI writing), `communications` (Notifications, the email settings), `agent` (Agent key), `billing` (Subscription), `help` (Help & Feedback) — and, on `about` only, `field`, which opens one row in its editor: `fullName`, `phone`, `currentCompany`, `address`, `linkedin`, `github`, `portfolio`, `website`, `twitter`. The visible label works as a section too (\"notifications\" opens `communications`); a section that is neither is refused, not landed on About. Email is not editable there.",
        ),
    }),
    output: z.object({ route: z.string() }),
    authorization: { mode: "none" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: { expose: false, reason: "needs_attached_browser" },
  }),

  defineAction({
    id: "set_filters",
    kind: "view",
    risk: "cheap",
    title: "Set the match filters",
    description:
      "Change the Matches feed's filter tray, and show or hide the tray itself with `tray`: match quality, posted-within, work setting, location, function, seniority, internships, AI roles, pay, benefits, industry, plus the search box, the sort order, and the Matches/All jobs switch. Only the keys you send change; an explicit null clears one and `reset: true` clears them all. Changing `functions` or the free-text `query` rebuilds and re-ranks the whole match pool, so the person confirms those first and the feed then takes a moment to settle. Use it when they want the view itself changed — \"only remote\", \"anything in Austin\", \"clear that\"; `list_matches` answers which jobs exist without touching their screen.",
    input: setFiltersInput,
    output: receiptSchema,
    authorization: { mode: "receipt", undoWindowMs: 8_000 },
    anchor: { route: "/", target: "filters.tray" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: { expose: false, reason: "needs_attached_browser" },
  }),

  defineAction({
    id: "open_match",
    kind: "view",
    risk: "cheap",
    title: "Open a match card",
    description:
      "Open one card of the Matches feed — its preview beside the list on a wide screen, its full page below that. Use it for \"open the LangChain one\", \"show me that role\". \"This role\" and \"this one\" are the card the situation marks `selected`, whose preview is already open. `get_job` is how you read a listing yourself, without moving their page.",
    input: z.object({
      jobId: z
        .string()
        .describe("The `jobId` of a card in the situation's `visibleMatches` list."),
    }),
    output: z.object({ jobId: z.string(), opened: z.boolean() }),
    authorization: { mode: "none" },
    anchor: { route: "/", target: "matches.card:<id>" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: { expose: false, reason: "needs_attached_browser" },
  }),

  defineAction({
    id: "open_application",
    kind: "view",
    risk: "cheap",
    title: "Open an application on the board",
    description:
      "Open one row of the Applications board — its review station if nothing has been sent yet, its record if something has — and select `doc` inside it. Use it for \"open the Anthropic one\", \"show me the description for that role\", \"let me see the resume you wrote\". `description` is the employer's posting, which on a sent row sits behind a disclosure this opens for them. `get_job` is how you read a posting yourself, without moving their page.",
    input: z.object({
      matchId: z
        .string()
        .describe("The `matchId` of a row in the situation's list."),
      doc: z
        .enum(["description", "resume", "cover_letter", "answers"])
        .optional()
        .describe("Which document to select once the row is open."),
    }),
    output: z.object({
      matchId: z.string(),
      doc: z
        .enum(["description", "resume", "cover_letter", "answers"])
        .nullable(),
      opened: z.boolean(),
    }),
    authorization: { mode: "none" },
    anchor: { route: "/applications", target: "pipeline.row:<id>" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: { expose: false, reason: "needs_attached_browser" },
  }),

  defineAction({
    id: "open_thread",
    kind: "view",
    risk: "cheap",
    title: "Open a recruiter thread",
    description:
      "Open one recruiter thread on the Messages page so its transcript is on screen. Take the threadId from the situation's visible threads or from get_inbox. Use it for \"open the OneTrust thread\" and \"show me that message\"; `open` with destination messages only shows the list.",
    input: z.object({
      threadId: z
        .string()
        .describe(
          "The `threadId` of a thread in the situation's list, or an `id` from get_inbox.",
        ),
    }),
    output: z.object({ ok: z.boolean() }),
    authorization: { mode: "none" },
    anchor: { route: "/messages", target: "messages.thread:<id>" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: { expose: false, reason: "needs_attached_browser" },
  }),

  defineAction({
    id: "draft_reply",
    kind: "view",
    risk: "cheap",
    title: "Draft a reply in the composer",
    description:
      "Write a reply into the Messages composer so the person reads it on their own screen before anything leaves. It sends nothing and changes no record — the words sit in the box, theirs to edit or delete. This is the FIRST half of answering a recruiter: draft it, say what it says, ask. `reply_to_recruiter` is the second half and sends those same words once they agree. The thread has to be the one already open, so call `open_thread` first; a thread whose box is closed — mail that only arrived inbound, mail forwarded by the apply partner, a thread with no recruiter message yet — is refused rather than drafted into, and a reply the person started themselves is left alone.",
    input: z.object({
      threadId: z
        .string()
        .describe("The `threadId` of the thread that is currently open."),
      body: z
        .string()
        .min(1)
        .max(4_000)
        .describe("The reply, exactly as it should appear in the box."),
    }),
    output: z.object({ ok: z.boolean() }),
    authorization: { mode: "none" },
    anchor: { route: "/messages", target: "messages.composer" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: { expose: false, reason: "needs_attached_browser" },
  }),

  defineAction({
    id: "close_application",
    kind: "view",
    risk: "cheap",
    title: "Close the open application",
    description:
      "Close whichever row of the Applications board is open and put the person back on the list. Use it for \"close this\", \"back to the list\". Nothing is archived, withdrawn, or sent by closing a station, and unsaved text in it keeps the row open instead. There is no argument: the board has one open row, and `open_application` is how a different one gets opened.",
    input: z.object({}),
    output: z.object({ closed: z.boolean() }),
    authorization: { mode: "none" },
    anchor: { route: "/applications", target: "pipeline.board" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: { expose: false, reason: "needs_attached_browser" },
  }),

  defineAction({
    id: "reveal_section",
    kind: "view",
    risk: "cheap",
    title: "Reveal a group of the board",
    description:
      "Scroll one group of the Applications board into view, and with `expand: true` open what it has folded away — Applied's \"Show N more\", the ones that did not go through, the closed roles, Autopilot's recommendations. Use it for \"show me what I applied to\", \"open up the failed ones\", \"show me the rest\". The situation says how many each group holds and hides, so check there before calling one empty. `get_pipeline` is what ANSWERS a question about the rows.",
    input: z.object({
      section: z
        .enum(["up_next", "applied", "unsent", "closed", "autopilot"])
        .describe("Which group of the board."),
      expand: z
        .boolean()
        .optional()
        .describe("Also open what the group has folded away."),
    }),
    output: z.object({
      section: z.enum(["up_next", "applied", "unsent", "closed", "autopilot"]),
      found: z.boolean(),
    }),
    authorization: { mode: "none" },
    anchor: { route: "/applications", target: "pipeline.section:<id>" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: { expose: false, reason: "needs_attached_browser" },
  }),

  defineAction({
    id: "highlight",
    kind: "view",
    risk: "cheap",
    title: "Highlight something on screen",
    description:
      "Mark one element on screen — a card, a row, a control, a block of a document — by its anchor, with an optional `note` beside it. Use it when a word like \"this\" or \"there\" needs a referent the person can see, or when you are about to talk about one thing among many. Do NOT highlight as decoration on every sentence.",
    input: z.object({
      target: z
        .string()
        .describe("A `data-dw-anchor` value present on the current surface."),
      note: z
        .string()
        .max(120)
        .optional()
        .describe("Short label to show beside the highlight."),
    }),
    output: z.object({ target: z.string(), found: z.boolean() }),
    authorization: { mode: "none" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: { expose: false, reason: "needs_attached_browser" },
  }),

  defineAction({
    id: "scroll_to",
    kind: "view",
    risk: "cheap",
    title: "Scroll to something",
    description:
      "Bring an anchor into view without marking it. Use it when what you are discussing is on the page but below the fold; the situation says which rows are off screen. On the Applications board, `open_application` and `reveal_section` scroll themselves, so reach for this only when what you want in view is neither a row nor a group — and not at all when you mean `highlight`, which scrolls too.",
    input: z.object({
      target: z.string(),
    }),
    output: z.object({ target: z.string(), found: z.boolean() }),
    authorization: { mode: "none" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: { expose: false, reason: "needs_attached_browser" },
  }),

  defineAction({
    id: "open_document",
    kind: "view",
    risk: "cheap",
    title: "Open a document",
    description:
      "Open one of an application's materials in the review station so the person can read it. This is the pack page's action and it takes an `applicationId`, which exists only once a real application does. Opening a document is what makes its revision reviewed, the precondition `apply` checks, so open the materials before proposing to send them. On the Applications board prefer `open_application`: it takes a `matchId`, which every row has, and can select the employer's description as well.",
    input: z.object({
      applicationId: z.string(),
      asset: z.enum(["resume", "cover_letter", "answers"]),
    }),
    output: z.object({
      applicationId: z.string(),
      asset: z.enum(["resume", "cover_letter", "answers"]),
      revision: z.int(),
    }),
    authorization: { mode: "none" },
    anchor: { route: "/pack/:listingId", target: "pack.header" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: { expose: false, reason: "needs_attached_browser" },
  }),
] as const;
