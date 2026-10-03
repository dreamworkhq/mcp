import { z } from "zod";
import { requestComponent, responseComponent } from "../registry.js";
import { isoDateTime, uuidString } from "./common.js";

/**
 * One thing the assistant believes about the candidate and was never told.
 *
 * `source` says who put it there: the assistant inferred it, or the person
 * typed it. Neither makes it a fact — a hypothesis is a question waiting to be
 * asked, and it leaves this list only by being confirmed or forgotten.
 */
export const assistantHypothesisSchema = responseComponent(
  z.object({
    id: uuidString,
    text: z.string().max(240),
    createdAt: isoDateTime,
    source: z.enum(["assistant", "user"]),
  }),
  {
    id: "AssistantHypothesis",
    description:
      "An unconfirmed belief about the candidate, held apart from the career record. Never a filter and never a claim until it is confirmed.",
  },
);

/**
 * Standing likes and dislikes for how the candidate wants to be written for.
 * Read-only on this route: the AI writing editor owns the sample and notes
 * these summarize, and nothing here writes them.
 */
export const assistantWritingPreferencesSchema = responseComponent(
  z.object({
    likes: z.array(z.string().max(200)),
    dislikes: z.array(z.string().max(200)),
  }),
  {
    id: "AssistantWritingPreferences",
    description:
      "What the candidate has said they want and do not want in generated writing.",
  },
);

export const assistantMemoryResponseSchema = responseComponent(
  z.object({
    hypotheses: z.array(assistantHypothesisSchema),
    writingPreferences: assistantWritingPreferencesSchema,
    /** How many hypotheses may be held at once, so a client can say so. */
    maxHypotheses: z.number().int().positive(),
  }),
  {
    id: "AssistantMemoryResponse",
    description:
      "`GET /profile/assistant-memory` 200 body: the assistant's working hypotheses and the candidate's writing preferences.",
  },
);

export const assistantHypothesisCreateRequestSchema = requestComponent(
  z.object({
    text: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .describe("The belief, in one sentence, phrased as a guess."),
    source: z.enum(["assistant", "user"]).optional(),
  }),
  {
    id: "AssistantHypothesisCreateRequest",
    description:
      "Record one working hypothesis. `source` defaults to `assistant`.",
  },
);

export const assistantHypothesisCreateResponseSchema = responseComponent(
  z.object({
    hypothesis: assistantHypothesisSchema,
    memory: assistantMemoryResponseSchema,
  }),
  {
    id: "AssistantHypothesisCreateResponse",
    description:
      "The stored hypothesis and the memory it now belongs to.",
  },
);

export const assistantHypothesisConfirmResponseSchema = responseComponent(
  z.object({
    /**
     * Where the confirmed text was written. A refusal becomes a stated
     * deal-breaker; anything else becomes a work-vault note, which filters
     * nothing.
     */
    destination: z.enum(["stated_preference", "vault_note"]),
    text: z.string().max(240),
    memory: assistantMemoryResponseSchema,
  }),
  {
    id: "AssistantHypothesisConfirmResponse",
    description:
      "The hypothesis was promoted into the career record and deleted from the memory. `destination` names where its text landed.",
  },
);

export const assistantHypothesisForgetResponseSchema = responseComponent(
  z.object({
    memory: assistantMemoryResponseSchema,
  }),
  {
    id: "AssistantHypothesisForgetResponse",
    description:
      "The hypothesis was deleted. Nothing was written to the career record.",
  },
);
