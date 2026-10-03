import { z } from "zod";
import { handoffSchema } from "./handoff.js";

/**
 * What the assistant did, in the user's terms. Every mutation writes one to
 * `assistant_tasks` before the turn reports it, so the dock, the ledger route,
 * and the MCP caller all read the same record of the same act rather than
 * three retellings of it.
 *
 * `summary` is one past-tense sentence a person can check. `undo` and `cancel`
 * name the action that reverses or stops this one; a receipt that offers
 * neither is final.
 */
export const receiptSchema = z.object({
  taskId: z.string(),
  actionId: z.string(),
  status: z.enum([
    "completed",
    "queued",
    "verifying",
    "failed",
    "cancelled",
    /**
     * The assistant took the person to the step and stopped. It is NOT a
     * completion and NOT a failure, and it is a status rather than a flag so
     * that nothing downstream can render it as either: the ledger, the
     * receipts column, and an MCP caller all have to give it words of its own
     * before they compile.
     */
    "handoff",
  ]),
  /** The domain row the action touched, e.g. {type: "application", id}. */
  object: z.object({ type: z.string(), id: z.string() }).nullable(),
  revisionBefore: z.number().nullable(),
  revisionAfter: z.number().nullable(),
  summary: z.string(),
  /** `until` is an ISO instant after which the inverse is no longer offered. */
  undo: z
    .object({
      until: z.string(),
      actionId: z.string(),
      args: z.unknown(),
    })
    .nullable(),
  cancel: z
    .object({ actionId: z.string(), args: z.unknown() })
    .nullable(),
  /**
   * Present exactly when `status` is `handoff`, and null otherwise. It carries
   * where the person was taken, what is left for them there, and whether a
   * draft kept them where they were.
   */
  handoff: handoffSchema.nullable().default(null),
  source: z.enum(["site", "mcp"]),
  createdAt: z.string(),
  /**
   * A signed-in web page the person can open to see what the action produced.
   * Null when the action has nothing to show in a browser. An embedding that
   * renders its own review surface (the site's dock) may ignore it; a raw MCP
   * host hands it to the person instead of describing the result in prose.
   */
  webUrl: z.string().nullable().default(null),
});

export type Receipt = z.infer<typeof receiptSchema>;
