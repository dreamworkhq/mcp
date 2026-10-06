import { z } from "zod";
import { responseComponent } from "../registry.js";

/** One generated application material. */
export const packAssetSchema = responseComponent(
  z.enum(["resume", "coverLetter", "answers"]),
  {
    id: "PackAsset",
    description:
      "One generated application material: the tailored resume, the cover letter, or the custom answers.",
  },
);

/**
 * Per-asset outcome of the last pack generation. `completed` and `failed` are
 * both subsets of `requested`; an asset the run could not apply to (a cover
 * letter on a letters-off application) is in neither.
 */
export const packAssetsSchema = responseComponent(
  z.object({
    requested: z.array(packAssetSchema),
    completed: z.array(packAssetSchema),
    failed: z.array(packAssetSchema),
  }),
  {
    id: "PackAssets",
    description:
      "Which assets the last pack generation was asked for and how each settled. Per-asset state is read from here, never from `packStatus`: a completed resume-only request is `partial` with `completed: [\"resume\"]`. Null on a pack generated before per-asset requests existed.",
  },
);

export type PackAsset = z.infer<typeof packAssetSchema>;
export type PackAssets = z.infer<typeof packAssetsSchema>;

/**
 * Wire shapes for the per-asset pack routes that are NOT published as OpenAPI
 * components. `POST /applications/:id/pack/refine` carries a reviewed
 * `deferred` decision in docs/contracts/api-contract-coverage.json — its
 * response is `refinePackAsset`'s return value, and freezing that as a
 * component while the refine modes are still moving is the thing the decision
 * refuses. These stay exported as types so the API's own Zod schemas and the
 * web client describe one shape; the registered components above are the
 * published surface.
 */
export const packAssetsRequestSchema = z.object({
  assets: z.array(packAssetSchema).min(1).max(3).optional(),
});

/** Draft answer fields needed to identify and review a scoped prose edit. */
export const packDraftAnswerSchema = z.object({
  id: z.string(),
  questionText: z.string(),
  generatedAnswer: z.string(),
  type: z.string(),
});

export type PackDraftAnswer = z.infer<typeof packDraftAnswerSchema>;

/** Where a scoped refine is allowed to change text. */
export const refineScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("paragraph"), index: z.number().int().min(0) }),
  z.object({ kind: z.literal("selection"), text: z.string().min(1).max(2_000) }),
  z.object({ kind: z.literal("section"), id: z.string().min(1).max(200) }),
  z.object({
    kind: z.literal("answer"),
    questionId: z.string().min(1).max(200),
  }),
]);

export const refinePackRequestSchema = z.object({
  asset: z.enum(["coverLetter", "resume", "answers"]),
  instruction: z.string().max(600).optional(),
  mode: z.enum(["revise", "fresh"]).default("revise"),
  scope: refineScopeSchema.optional(),
});

/** What a scoped refine changed: the one block, before and after. */
export const refineScopeResultSchema = z.object({
  scope: refineScopeSchema,
  before: z.string(),
  after: z.string(),
  blockIndex: z.number().int().min(0),
});

export type RefineScope = z.infer<typeof refineScopeSchema>;
export type RefinePackRequest = z.infer<typeof refinePackRequestSchema>;
export type RefineScopeResult = z.infer<typeof refineScopeResultSchema>;
