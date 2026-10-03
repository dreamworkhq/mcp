import { z } from "zod";
import { openDestinationSchema, openParamsSchema } from "./destinations.js";

/**
 * Why the assistant stopped and handed the request back.
 *
 * Each one is a different thing standing in the way, and each one has a
 * different remedy, which is why this is a closed set rather than a sentence.
 * A reason that does not fit one of these is not a handoff — it is a failure,
 * and calling it a handoff would tell somebody to go somewhere that cannot
 * help them.
 *
 * - `needs_credentials`: a sign-in or a password that is theirs to type.
 * - `needs_payment_details`: a card or billing detail that never passes
 *   through the assistant.
 * - `needs_consent`: a permission or agreement only the person can give.
 * - `needs_entitlement`: their plan does not include the feature. A feature
 *   that is dark for everyone is NOT this — see `set_autopilot`.
 * - `needs_prerequisite`: something earlier is unfinished, and finishing it
 *   unblocks the request as asked.
 * - `person_must_do`: the product keeps this step in their hands on purpose.
 */
export const HANDOFF_REASONS = [
  "needs_credentials",
  "needs_payment_details",
  "needs_consent",
  "needs_entitlement",
  "needs_prerequisite",
  "person_must_do",
] as const;

export const handoffReasonSchema = z.enum(HANDOFF_REASONS);

export type HandoffReason = z.infer<typeof handoffReasonSchema>;

/**
 * An outcome that is neither a completion nor a failure.
 *
 * The assistant could not do the thing itself, so it took the person to the
 * step that can, kept what they had already entered, and said what is left.
 * That is a legitimate way for a request to end, and the whole point of giving
 * it a shape of its own is that it stops being reported as one of the other
 * two: "I took you there" read as "it is done" is the failure this replaces.
 *
 * `note` is for the record and for the brain — the specific thing, in a few
 * words. `remaining` is the sentence the PERSON reads, in their terms, naming
 * what they still have to do once they are there.
 */
export const handoffSchema = z.object({
  reason: handoffReasonSchema,
  /** The specific thing in the way, named in words. */
  note: z.string().max(200),
  destination: z.object({
    destination: openDestinationSchema,
    params: openParamsSchema.optional(),
  }),
  /** One sentence to the person: what is still theirs to do. */
  remaining: z.string().max(200),
  /**
   * Whether unsaved work was kept.
   *
   * True whenever the page reported pending edits and the handoff therefore
   * did NOT navigate away from them. A handoff never spends somebody's draft
   * to reach a page faster: it names the destination and stays put, and this
   * flag is how the person and the record can tell the two endings apart.
   */
  preserved: z.boolean(),
});

export type Handoff = z.infer<typeof handoffSchema>;
