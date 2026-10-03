import { z } from "zod";
import { defineAction } from "../action.js";
import { ASSISTANT_EVENTS } from "../events.js";
import { receiptSchema } from "../receipt.js";

/**
 * The three acts the person cannot take back: sending an application under
 * their name, writing to a recruiter as them, and spending their money. Each
 * runs only through the command ladder in the executor, and the model cannot
 * skip it by phrasing.
 */
export const applyActions = [
  defineAction({
    id: "apply",
    kind: "data",
    risk: "consequential",
    title: "Apply to a job",
    description:
      "Submit the person's application to a real employer, under their name, with the materials currently saved for it. This cannot be undone once sent. It runs only on an imperative naming one role — \"apply to this one\", \"send it\" — with `expectedRevision` equal to the revision they actually reviewed; anything else comes back as a confirmation request rather than a submission. Requires materials to exist and an application left on their plan. Do NOT call it to 'get ready', and do NOT retry a refusal by restating the request.",
    input: z.object({
      applicationId: z.string(),
      expectedRevision: z
        .int()
        .min(0)
        .describe(
          "The materials revision the person reviewed. A mismatch fences the send.",
        ),
    }),
    output: receiptSchema,
    authorization: {
      mode: "command",
      requires: ["explicit_verb", "unambiguous_target", "reviewed_revision"],
    },
    anchor: { route: "/pack/:listingId", target: "pack.apply" },
    invalidates: ["pipeline", "application-usage"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Submits one application to an employer under the account holder's name using the saved materials at expectedRevision. Submission requires existing materials and plan allowance and cannot be recalled. A confirmation hold returns the destination, material summary and a token bound to identical arguments; the reviewed revision is enforced.",
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    },
  }),

  defineAction({
    id: "reply_to_recruiter",
    kind: "data",
    risk: "consequential",
    title: "Reply to a recruiter",
    description:
      "Send a reply into an existing recruiter conversation, as the person. The mail leaves immediately and cannot be recalled, so it runs only on an explicit instruction to send with one thread unambiguously the target; otherwise it returns a confirmation request carrying the draft for them to approve. Read the thread with `get_inbox` first: a reply written without the message it answers is how a scheduling mail gets a salary answer. On a screen, `draft_reply` comes first and puts the words in the composer where they can be read; send the text that is in that box, character for character, so what leaves is what they saw. A thread id starting `inbound:` is mail outside any conversation and cannot be answered from here; tell them to reply from their own email. Do NOT accept an interview time, decline a role, state a salary, or agree to terms unless the person said to in this turn.",
    input: z.object({
      threadId: z.string(),
      body: z
        .string()
        .min(1)
        .max(4_000)
        .describe("The full reply text, as it will be sent."),
    }),
    output: receiptSchema,
    authorization: {
      mode: "command",
      requires: ["explicit_verb", "unambiguous_target"],
    },
    anchor: { route: "/messages", target: "messages.thread:<id>" },
    invalidates: ["relay-threads"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Sends the supplied reply text to one existing recruiter conversation under the account holder's identity. Sending requires explicit consent and an unambiguous thread; otherwise the result is a confirmation hold containing the draft. Sent mail cannot be recalled. Threads whose ids begin with inbound: cannot receive replies through this endpoint.",
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    },
  }),

  defineAction({
    id: "start_checkout",
    kind: "data",
    risk: "consequential",
    title: "Start checkout",
    description:
      "Begin a plan change by returning a checkout URL for the browser to open. It charges nothing by itself — payment details are entered and confirmed on the billing page — but it takes over their screen, so it runs only when they asked to upgrade or change plans. Do NOT call it to answer a question about pricing, to respond to a limit they merely noticed, or as a suggestion after a paywalled refusal: say what is blocked, and let them ask.",
    input: z.object({
      plan: z
        .enum(["pro", "dreamer"])
        .describe("The plan the person asked for."),
      promoCode: z
        .string()
        .max(64)
        .optional()
        .describe("Only when the person supplied one."),
      billingInterval: z
        .enum(["month", "quarter"])
        .optional()
        .describe(
          "How often to invoice, only when the person named one; omitted means monthly. Quarterly is one invoice every three months at about 15% less than three monthly ones. A promo code prices a monthly invoice, so the two cannot be combined.",
        ),
    }),
    output: z.object({
      checkoutUrl: z.url(),
      plan: z.enum(["pro", "dreamer"]),
      /**
       * The offer the session carries, when it carries one — a trial or a
       * promo. "You will be charged now" and "this starts a free trial" are
       * different sentences, and the route already knows which is true.
       */
      offerId: z.string().nullable(),
    }),
    authorization: { mode: "command", requires: ["explicit_verb"] },
    anchor: { route: "/billing", target: "billing.panel" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Returns a checkout URL for the requested plan change after explicit consent. A confirmation hold precedes checkout creation. This call does not charge the account; payment details and payment confirmation occur on the billing page.",
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  }),
] as const;
