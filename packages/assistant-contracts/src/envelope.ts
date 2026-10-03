import { z } from "zod";

/**
 * What the browser tells the assistant about where the user is standing.
 *
 * Built from application state only, sent on session start and on change,
 * debounced 500 ms and skipped when deep-equal with the last one. It never
 * carries resume text, listing text, or message bodies: page text is data and
 * reaches the brain only inside a tool result it asked for. `selection.text`
 * is the single exception, capped at 600 characters, because it is literally
 * what the user is pointing at when they say "fix this paragraph".
 *
 * Each utterance carries the `envelopeId` that was current when it was spoken
 * or typed, and actions resolve their targets against that snapshot, so a feed
 * that re-sorted mid-sentence cannot silently redirect an action.
 */
export const contextEnvelopeSchema = z.object({
  /** New uuid per snapshot; the utterance references it. */
  envelopeId: z.string(),
  capturedAt: z.string(),
  /** Route template, e.g. `/pack/:listingId`; params resolve separately. */
  route: z.string(),
  view: z.enum([
    "matches",
    "job",
    "pack",
    "applications",
    "profile",
    "messages",
    "billing",
    "other",
  ]),
  /** Open sub-surface, e.g. "peek", "review-station", "filter-tray". */
  panel: z.string().nullable(),
  job: z
    .object({
      id: z.string(),
      title: z.string(),
      company: z.string(),
      source: z.enum(["listing", "private"]),
    })
    .nullable(),
  applicationId: z.string().nullable(),
  openDocument: z
    .object({
      asset: z.enum(["resume", "cover_letter", "answers"]),
      revision: z.number(),
      /**
       * Which resume is on screen, when the resume is the open document.
       *
       * An application carries two: the person's own upload and the one
       * generated for this role. They sit behind a segmented control, and the
       * applications station opens on `default` — preparation writes that
       * choice — so the resume somebody is reading is usually NOT the one
       * `edit_resume` rewrites. Without this field the assistant could edit the
       * tailored resume while the person watched the other one and saw nothing
       * change, which is exactly what it did.
       *
       * Null when the open document is not a resume.
       */
      resumeVariant: z.enum(["default", "tailored"]).nullable(),
    })
    .nullable(),
  selection: z
    .object({
      asset: z.enum(["resume", "cover_letter"]),
      text: z.string().max(600),
      paragraphIndex: z.number().nullable(),
    })
    .nullable(),
  visibleJobIds: z.array(z.string()).max(40),
  /**
   * The match cards the person can actually see on the Matches feed, in
   * reading order.
   *
   * `visibleJobIds` is ids alone, which is enough where the model has just read
   * the same feed through `list_matches`. It is not enough for "open the
   * LangChain one" or "this role": a name in a sentence needs a title beside an
   * id to resolve, and "this" needs to know which card's preview is open. This
   * is the matches-feed twin of `visibleApplications`, and it carries the same
   * discipline — bounded, employer-authored strings capped, off on every other
   * surface.
   *
   * `jobId` is the listing id every card action takes (`open_match`, the
   * `matches.card:<id>` anchors). `selected` marks the card whose detail pane
   * (the right-hand peek) is open, which is what "this role" points at.
   * `matchPercent` is the display score the badge shows, absent on a card that
   * has none (an anonymous browse card).
   */
  visibleMatches: z
    .array(
      z.object({
        jobId: z.string(),
        /**
         * Bounded because an employer wrote them. Same cap and same reason as
         * `visibleApplications`: forty of these interpolate straight into the
         * prompt's situation block, and a listing title is not validated here.
         */
        title: z.string().max(120),
        company: z.string().max(120),
        /** The display match score, 0–100; absent when the card has none. */
        matchPercent: z.number().min(0).max(100).optional(),
        /**
         * Whether the person can see this card WITHOUT scrolling: at least half
         * its box inside the viewport, measured the same way the board measures
         * its rows. Mounted is not visible.
         */
        onScreen: z.boolean(),
        /** The card whose detail peek is open — what "this role" resolves to. */
        selected: z.boolean(),
      }),
    )
    .max(40),
  /**
   * The recruiter threads listed on the Messages page, in reading order.
   *
   * The Messages twin of `visibleApplications`. Without it "open the OneTrust
   * thread" had nothing to resolve against: the assistant re-read the inbox
   * through `get_inbox`, found the thread, and then had no way to select it —
   * `open` lands on the bare list. `threadId` is what `open_thread` and the
   * `messages.thread:<id>` anchors take; `selected` marks the thread whose
   * transcript is open, which is what "this thread" and "summarize this" mean.
   *
   * `company` and `jobTitle` are employer-authored, so they carry the same cap
   * and the same reason as every other free-text value here. Message bodies
   * never travel; the transcript reaches the brain only through `get_inbox`.
   * Empty on every other surface.
   */
  visibleThreads: z
    .array(
      z.object({
        threadId: z.string(),
        company: z.string().max(120),
        /** Null for a synthetic thread built from unmatched employer mail. */
        jobTitle: z.string().max(120).nullable(),
        /** Employer mail the person has not opened. */
        unread: z.boolean(),
        /** Who wrote last: the employer, or the person (or Dreamwork for them). */
        lastFrom: z.enum(["recruiter", "candidate"]),
        /** The thread whose transcript is open on the right. */
        selected: z.boolean(),
      }),
    )
    .max(40),
  /**
   * The application rows the person can actually see, in reading order.
   *
   * `visibleJobIds` is ids alone, which is enough for a feed where the model
   * has just read the same list through `list_matches`. It is not enough for
   * the applications board: someone standing there says "the Anthropic one",
   * and an id with no title beside it cannot resolve that, so the assistant
   * used to leave the page and search for the name instead of acting on the
   * row under the person's cursor.
   *
   * `matchId` is first because it is the id every board action takes — the
   * card id, which `move_pipeline`, `mark_applied_offsite` and the row anchors
   * all key on. `applicationId` exists only once a real application does.
   * Titles and company names are the person's own board, not page text: they
   * are what makes a name in a sentence resolvable, and they travel for that
   * and nothing else.
   */
  visibleApplications: z
    .array(
      z.object({
        matchId: z.string(),
        applicationId: z.string().nullable(),
        /** The listing this card came from; null for an imported private role. */
        jobId: z.string().nullable(),
        /**
         * Bounded because an employer wrote them. These are the only
         * free-text values in the envelope besides `selection.text`, they are
         * interpolated straight into the prompt's situation block, and a
         * listing title is not a field anybody here validates. Forty rows of
         * unbounded strings is a budget a crawler could set.
         */
        title: z.string().max(120),
        company: z.string().max(120),
        status: z.string(),
        /**
         * Which group of the board it is sitting in, as the person sees it.
         *
         * `unsent` is its own value rather than a shade of `applied`, which is
         * what it used to be folded into. The board renders that group behind
         * its own line — an application that did not go through, was
         * cancelled, or could not be confirmed — and calling any of those
         * "Applied" to the model is the one thing `prompt.ts` already forbids
         * in prose: a column is where a card sits, not proof anything was
         * sent.
         */
        section: z.enum(["up_next", "applied", "unsent", "closed"]),
        /** Whether generated materials exist to review or send. */
        hasMaterials: z.boolean(),
        /**
         * Whether the person can see this row WITHOUT scrolling: at least half
         * its box inside the viewport.
         *
         * Mounted is not visible. The board renders every row of an expanded
         * group, the assistant panel covers the right edge of the ones beside
         * it, and a board with a year on it puts most of this array below the
         * fold — so an array that meant "on screen" was telling the model the
         * person could see rows they would have to scroll to reach, and
         * "the top one" resolved against a list nobody was looking at.
         *
         * The array stays the mounted rows in reading order, because a name in
         * a sentence has to resolve against rows just off the fold too. This
         * flag is what separates resolving a name from pointing at something.
         */
        onScreen: z.boolean(),
      }),
    )
    .max(40),
  /**
   * The applications board's own shape: which row is open, which document is
   * showing, and what each group holds including what it is hiding.
   *
   * Null on every other surface, which is what `nullable` says: the board is
   * the one page with folded groups, and a model asked to "show the rest" has
   * no way to know there is a rest without being told the counts.
   *
   * `shown` and `hidden` on Applied are the disclosure — the board renders a
   * few and folds the remainder behind "Show N more" — so a count of rows in
   * `visibleApplications` is not the count of applications.
   */
  board: z
    .object({
      /** The row whose station is open, or null when none is. */
      openMatchId: z.string().nullable(),
      /** The document that station is showing, or null when none is. */
      openDoc: z
        .enum(["description", "resume", "cover_letter", "answers"])
        .nullable(),
      /**
       * The materials revision the open station is showing, or null.
       *
       * The board is a surface where somebody reads a document and then says
       * "send it", and `apply`'s ladder checks that the version they looked at
       * is the version that would go. Without this the board could satisfy
       * that check only by accident: the top-level `materialsRevision` and
       * `openDocument` are the pack page's fields, and the station publishes
       * them too, but a revision belongs to the row that is open and this is
       * where it is read from.
       */
      openDocRevision: z.number().nullable(),
      sections: z.object({
        up_next: z.object({ count: z.int() }),
        applied: z.object({
          count: z.int(),
          shown: z.int(),
          hidden: z.int(),
          expanded: z.boolean(),
        }),
        unsent: z.object({ count: z.int(), expanded: z.boolean() }),
        closed: z.object({ count: z.int(), expanded: z.boolean() }),
        autopilot: z.object({
          expanded: z.boolean(),
          picksShown: z.int(),
          picksHidden: z.int(),
          /**
           * The roles Autopilot is recommending, in the order shown.
           *
           * Counts alone said there were recommendations and gave the model no
           * way to talk about one: "save the first Autopilot pick" resolved
           * against nothing, and the assistant went searching the feed for a
           * row that was already on screen. Same reason and same bounds as
           * `visibleApplications` — employer-authored strings, capped, and
           * carried because a name in a sentence has to resolve to an id.
           */
          picks: z
            .array(
              z.object({
                listingId: z.string(),
                title: z.string().max(120),
                company: z.string().max(120),
              }),
            )
            .max(10),
        }),
      }),
    })
    .nullable(),
  /**
   * The receipts this conversation has produced, newest first.
   *
   * It exists so that a reference survives the thing it refers to. "Undo that
   * removal" and "restore the one you just removed" arrive AFTER the row has
   * left the board, so `visibleApplications` cannot resolve either of them and
   * the transcript carries a title at best — never the task id the reversal
   * takes. Five, because a person points back at the last thing they did and
   * not at the twentieth.
   *
   * Titles and ids only, like every other field here. No summaries: the
   * receipt's sentence is written for the person and the model has the action
   * id, which is what it acts on.
   */
  recentActions: z
    .array(
      z.object({
        taskId: z.string(),
        actionId: z.string(),
        objectType: z.string().nullable(),
        objectId: z.string().nullable(),
        title: z.string().max(120),
        status: z.string(),
        /** ISO instant the undo expires, or null when there is none. */
        undoUntil: z.string().nullable(),
      }),
    )
    .max(5),
  /** True while the user has unsaved text in a materials editor. */
  pendingUserEdits: z.boolean(),
  filters: z.object({
    chips: z.array(z.string()),
    sort: z.string().nullable(),
    query: z.string().nullable(),
    location: z.string().nullable(),
    /**
     * The feed has not caught up with these filters yet: a debounce still
     * open, a pool still being rebuilt, or the Personalizing poll still
     * chasing the ranked answer.
     *
     * Optional because a surface that has not been taught to publish it has
     * not measured it, and "I did not look" must not read as "it has
     * settled". What is on screen while this is true is the PREVIOUS answer,
     * so a turn that reports the new filters as done is describing rows
     * nobody has re-ranked.
     */
    personalizing: z.boolean().optional(),
    /**
     * Whether the Filters panel itself is showing.
     *
     * "Open up filters" on a page whose panel was already open changed
     * nothing and reported success, and the model had no way to know the
     * panel's state, so it could neither say "it is already open" nor notice
     * that nothing moved. Optional because only the Matches feed has a panel
     * to report on.
     */
    trayOpen: z.boolean().optional(),
    /**
     * Filter values this build offers that the action schema cannot name.
     *
     * NOT the tray's whole vocabulary. Most of `set_filters` is already
     * `z.enum` — functions, seniorities, work setting, match quality,
     * posted-within, sort, scope — and those travel in the tool block, which
     * is stable and served from the provider's prefix cache at a tenth of list
     * price. Repeating an enum here would cost about ten times as much per
     * step and tell the model nothing it was not already sent.
     *
     * What belongs here is the value list a schema cannot honestly hold.
     * `industry` renders only behind `NEXT_PUBLIC_INDUSTRY_FILTER_ENABLED`, a
     * web build flag the API never sees, so an enum would promise a control
     * some builds do not have. A control this build lacks is simply absent
     * here, which is what lets the assistant say so plainly rather than
     * sending a key the page can only refuse.
     *
     * BUDGET: keep the rendered block under roughly 300 tokens. It is built
     * per turn, sits after the cached prefix, and is billed at full rate every
     * turn spent on this surface — so it is a recurring tax, not a one-off.
     * The caps below bound the shape; the budget is the thing to hold.
     *
     * Optional because a surface that has not been taught to publish it has
     * not measured it, and an empty array would read as "this page's flags are
     * all off" rather than "nobody looked".
     */
    dimensions: z
      .array(
        z.object({
          /** The `set_filters` key this control is set through. */
          key: z.string().max(40),
          /** What the tray calls it, for a sentence the person reads. */
          label: z.string().max(60),
          select: z.enum(["one", "many", "toggle", "range", "text"]),
          /** Every value this build offers for the control. */
          values: z.array(z.string().max(60)).max(40).optional(),
          /**
           * What is selected now.
           *
           * Only where the situation's `Filters:` line does not already carry
           * it. That line holds the chips, the search and the location; the
           * industry chip is not one of them, which is why it travels here.
           */
          active: z.array(z.string().max(60)).max(40),
        }),
      )
      .max(4)
      .optional(),
  }),
  materialsRevision: z.number().nullable(),
  tier: z.enum(["free", "pro", "dreamer"]),
  packsLeftToday: z.number().nullable(),
  autopilot: z.enum(["off", "on", "paused", "unavailable"]),
  /** Action ids the attached browser can actually run from this surface. */
  availableActions: z.array(z.string()),
  voiceMinutesLeft: z.number().nullable(),
});

export type ContextEnvelope = z.infer<typeof contextEnvelopeSchema>;
