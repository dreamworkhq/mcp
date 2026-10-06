import { z } from "zod";
import { defineAction } from "../action.js";
import { ASSISTANT_EVENTS } from "../events.js";
import { receiptSchema } from "../receipt.js";

/** Board columns as the person sees them, matching `ProductPipelineStatus`. */
export const pipelineStatusSchema = z.enum([
  "SAVED",
  "APPLIED",
  "CONFIRMED",
  "INTERVIEWING",
  "OFFER_RECEIVED",
  "ACCEPTED",
  "REJECTED",
  "NO_RESPONSE",
  "WITHDRAWN",
]);

const pipelineCard = z.object({
  matchId: z.string(),
  applicationId: z.string().nullable(),
  listingId: z.string().nullable(),
  title: z.string(),
  company: z.string(),
  status: pipelineStatusSchema,
  appliedAt: z.string().nullable(),
  updatedAt: z.string(),
});

export const pipelineActions = [
  defineAction({
    id: "get_pipeline",
    kind: "data",
    risk: "read",
    title: "Read the pipeline",
    description:
      "Read every role the person has saved, applied to, or heard back about, as board cards with their column, the application id when one exists, and when each was last updated. Use it for \"what have I applied to\", \"what is still sending\", and to find the application id another action needs. Report `total` as the number and list `cards`, which `complete` says may be only the first `limit`; `counts` covers every column whatever the filter. The column is display state — `get_application_status` is the only action that checks whether an employer received, read or replied to anything.",
    input: z.object({
      status: pipelineStatusSchema.optional(),
      limit: z.int().min(1).max(100).default(50),
    }),
    output: z.object({
      cards: z.array(pipelineCard),
      /**
       * Every column, including the empty ones: an enum-keyed record is
       * exhaustive in zod, and the zero is the point. "Nothing in
       * interviewing" is an answer; a missing key is indistinguishable from a
       * column the read failed to check.
       */
      counts: z.record(pipelineStatusSchema, z.int()),
      /**
       * Matching cards on the whole board, before `limit` cut the list.
       *
       * `cards.length` is a page and was the only number the result carried,
       * so "how many have I applied to" was answered with the page size the
       * moment a board outgrew it. This is the answer to that question and
       * `complete` says whether the two agree.
       */
      total: z.int(),
      /** Whether `cards` holds every matching card, or only the first `limit`. */
      complete: z.boolean(),
    }),
    authorization: { mode: "none" },
    anchor: { route: "/applications", target: "pipeline.board" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Returns saved and applied roles as board cards with column, application id and last-updated time. total and counts cover all matching records; complete identifies whether cards are truncated by limit. Column values describe board state and do not establish employer receipt or response.",
      readOnlyHint: true,
      openWorldHint: false,
    },
  }),

  defineAction({
    id: "move_pipeline",
    kind: "data",
    risk: "cheap",
    title: "Move a pipeline card",
    description:
      "Record where a role actually stands by moving its card to another column. This records the person's own knowledge; it contacts no employer and sends nothing. APPLIED records that an application happened somewhere and does not apply — `mark_applied_offsite` is the honest action when they applied on the employer's own site. Its receipt carries an undo only when the move is genuinely reversible: INTERVIEWING writes a durable interview record, and closing a role can drop its listing out of the feed for good. Taking a role off the board is this action with WITHDRAWN, which is what the board's own remove control writes; `dismiss_match` acts on the feed and leaves the card where it was. Do NOT move a card to INTERVIEWING or OFFER_RECEIVED on inference.",
    input: z.object({
      matchId: z.string().describe("Board card id from `get_pipeline`."),
      status: pipelineStatusSchema,
    }),
    output: receiptSchema,
    // A minute, and the longest window in the registry. The other cheap writes
    // are undone by a hand that is already on the screen; this one is undone
    // by a sentence, and a spoken round trip — hear the receipt, decide, say
    // "put that back", wait for the transcript — does not fit in eight
    // seconds. It is also the act whose reference disappears with the row:
    // once a card is off the board nothing on screen points at it, which is
    // what `recentActions` in the envelope exists to carry.
    authorization: { mode: "receipt", undoWindowMs: 60_000 },
    anchor: { route: "/applications", target: "pipeline.row:<id>" },
    invalidates: ["pipeline"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Moves one role's board card to the requested column using the account holder's reported state. No employer is contacted. APPLIED records an application rather than submitting one; INTERVIEWING creates a durable interview record. WITHDRAWN removes the card from the active board. Closing a role can remove its listing from the feed. A receipt offers undo only when reversible.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),

  defineAction({
    id: "mark_applied_offsite",
    kind: "data",
    risk: "cheap",
    title: "Record an application made elsewhere",
    description:
      "Record that the person applied to this role themselves, outside Dreamwork. Requires `attestation: true` — them stating they really did — because this writes 'applied' into a record the product later reports as truth and nothing else can verify it. The record is stamped now and cannot be backdated, so do not promise a date they named, and there is no undo. Do NOT use it for an application Dreamwork itself sent, and do NOT set the attestation yourself: if they have not said they applied, ask.",
    input: z.object({
      matchId: z.string(),
      attestation: z
        .literal(true)
        .describe(
          "The person stated they applied to this role themselves. Never assumed.",
        ),
    }),
    output: receiptSchema,
    authorization: { mode: "receipt" },
    anchor: { route: "/applications", target: "pipeline.row:<id>" },
    invalidates: ["pipeline"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Records an application the account holder submitted outside Dreamwork. attestation:true is required and represents the person's confirmation that submission occurred. The record is stamped at the current time, cannot be backdated and has no undo. This call does not send an application.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),

  defineAction({
    id: "import_job",
    kind: "data",
    risk: "async",
    title: "Import a job from a URL",
    description:
      "Fetch a job posting the person found anywhere on the web and add it to their pipeline as a private role. The imported role appears on the board when extraction finishes; a URL Dreamwork already holds comes back `completed` because nothing had to be fetched. Use it when they paste or name a URL that is not already a Dreamwork listing — search `list_matches` first for a role that may be in the feed.",
    input: z.object({
      url: z.url().describe("Job posting URL, as the person gave it."),
    }),
    output: receiptSchema,
    authorization: { mode: "receipt" },
    anchor: { route: "/applications", target: "pipeline.row:<id>" },
    invalidates: ["pipeline"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Fetches a public job-posting URL and imports it as a private role in the account's pipeline. Extraction runs asynchronously and the card appears when it finishes. A posting already held by Dreamwork returns completed without another fetch.",
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  }),

  defineAction({
    id: "cancel_apply",
    kind: "data",
    risk: "cheap",
    title: "Cancel an application that is still sending",
    description:
      "Stop an application that is queued or mid-submission. An application already submitted cannot be recalled, and the receipt says so instead of pretending, which is the point of the action. Use it for 'stop', 'cancel that', or 'not that one' about a specific role.",
    input: z.object({
      applicationId: z.string(),
    }),
    output: receiptSchema,
    authorization: { mode: "receipt" },
    anchor: { route: "/applications", target: "pipeline.row:<id>" },
    invalidates: ["pipeline"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Stops a queued or in-progress application when submission can still be prevented. Already submitted applications cannot be recalled; the receipt reports that boundary.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: true,
    },
  }),
] as const;
