import { z } from "zod";
import { defineAction } from "../action.js";
import { ASSISTANT_EVENTS } from "../events.js";
import { receiptSchema } from "../receipt.js";

/**
 * The three assets a pack can contain, spelled as the pack generation request
 * spells them. Deliberately not the snake_case vocabulary the context envelope
 * uses for an open document: that one names a rendered surface, this one names
 * a request parameter, and collapsing them would hide which side a value came
 * from.
 */
export const packAssetSchema = z.enum(["resume", "coverLetter", "answers"]);

/**
 * Which part of an asset an edit is allowed to touch. A scoped edit changes
 * the targeted block and leaves every other byte identical; the engine splices
 * the model's replacement back in and verifies that before saving, rejecting
 * with `scope_guard_failed` when anything else moved.
 *
 * Omitting the scope is a whole-asset rewrite, which is a different and louder
 * act. Prefer a scope whenever the person pointed at something.
 */
export const editScopeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("paragraph"),
      index: z
        .int()
        .min(0)
        .describe("Blank-line-separated paragraph index in the cover letter."),
    })
    .strict(),
  z
    .object({
      kind: z.literal("selection"),
      text: z
        .string()
        .min(1)
        .max(600)
        .describe(
          "Exact substring of the asset, which must occur exactly once.",
        ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("section"),
      id: z.string().describe("Resume block id from the HTML block map."),
    })
    .strict(),
  z
    .object({
      kind: z.literal("answer"),
      questionId: z.string(),
    })
    .strict(),
]);

export type EditScope = z.infer<typeof editScopeSchema>;

/** What changed, for the diff reveal and the receipt. */
export const diffSummarySchema = z.object({
  scope: editScopeSchema.nullable(),
  blockIndex: z.int().nullable(),
  before: z.string(),
  after: z.string(),
});

export type DiffSummary = z.infer<typeof diffSummarySchema>;

/**
 * Mirrors `ASSET_REFINE_INSTRUCTION_MAX_CHARS` in `@jobless/shared`, which
 * `refinePackBodySchema` enforces on `POST /applications/:id/pack/refine`.
 * This package stays zod-only, like `@jobless/api-contracts`, so the value is
 * copied rather than imported. It must equal that constant: a registry cap
 * above the API's would let the brain send an instruction that validates here
 * and 400s at the route.
 */
const REFINE_INSTRUCTION_MAX_CHARS = 600;

/**
 * How long an edit to the materials can be put back through its receipt.
 *
 * Fifteen minutes rather than the eight seconds the other writes carry,
 * because the inverse here is a stored revision or the exact text the receipt
 * recorded, never prose of the model's own, so a late restore is as safe as an
 * early one, and "undo that" after reading the result is the normal way
 * somebody reviews an edit to their own document. Mirrors
 * `UNDO_WINDOW_MS` in `apps/api/src/assistant/actions/materials.ts`.
 */
export const MATERIAL_UNDO_WINDOW_MS = 15 * 60_000;

const editResult = z.object({
  receipt: receiptSchema,
  diff: diffSummarySchema,
});

/**
 * Work-vault references that license a claim the ENGINE would add.
 *
 * Only `strengthen_application` takes these, and the reason is provenance. The
 * `edit_*` actions carry an instruction the person wrote about their own
 * document, which is authority enough on its own. `strengthen_application` runs
 * without the person naming the change, so the engine composes the instruction,
 * and its evidence gate is deterministic: an emphasis that introduces a number,
 * a title, an employer, a date, or a credential is refused unless one of these
 * resolves to a document the person actually filed, or to a fact on one. It is
 * not a model judgement, so naming an id the vault does not hold fails exactly
 * as omitting it does.
 */
const evidenceIdsInput = z
  .array(z.string())
  .max(10)
  .optional()
  .describe(
    "Ids of the person's work-vault documents, or of facts on them, that support a claim the emphasis adds.",
  );

/**
 * How a document reaches the assistant: whether it exists and how long it is,
 * never a byte of it.
 *
 * The bodies belong to the person. The brain reads a role through `get_job`
 * and changes a document through the `edit_*` actions, which carry an
 * instruction to the writing model rather than prose of the brain's own — so
 * there is no act in this registry that needs the text, and a length is
 * enough to answer "is there a cover letter" and "is the tailored resume
 * empty". `apps/mcp`'s hand-written `get_application_materials` still returns
 * the bodies to an agent whose caller is a person reading them; this one is
 * for a model choosing between them.
 */
const documentPresence = z.object({
  present: z.boolean(),
  characters: z.int().describe("Length of the document. Never its text."),
});

/** The two resume versions one application can send. */
const resumeVariantSchema = z.enum(["default", "tailored"]);

/**
 * Most roles one `prepare_applications` call takes. The batch runs one role
 * after another, because the pack allowance is counted and then written in two
 * statements, and parallel requests could each pass the count before any of
 * them wrote; ten keeps a sequential call inside one turn.
 */
const PREPARE_BATCH_MAX = 10;

/**
 * What became of one role in a `prepare_applications` call. `queued` is the
 * only outcome this call started work for; everything else is either work that
 * already existed or a reason nothing was started.
 */
const prepareOutcomeSchema = z.enum([
  "already_prepared",
  "queued",
  "in_progress",
  "quota_blocked",
  "failed",
  "not_found",
]);

/** Which assets the last generation asked for and how each one settled. */
const packAssetOutcomesSchema = z.object({
  requested: z.array(packAssetSchema),
  completed: z.array(packAssetSchema),
  failed: z.array(packAssetSchema),
});

/** Ids an action takes once each, so a repeated id is refused, not run twice. */
function distinct(ids: readonly string[]): boolean {
  return new Set(ids).size === ids.length;
}

/** How a document the person handed in arrived: pasted text or a file. */
const personDocumentFormatSchema = z.enum(["text", "pdf", "docx", "txt", "md"]);

/** Where a document a person handed in came from, when it did. */
const personDocumentFields = {
  format: personDocumentFormatSchema.optional(),
  filename: z.string().optional(),
  updatedAt: z.string().optional(),
};

/**
 * The largest file `replace_application_document` carries, in base64
 * characters. The action route takes the API's default 2 MiB body
 * (`apps/api/src/server.ts`) and the file travels inside that JSON, so this is
 * about a 1.4 MB file; the route behind it accepts up to the profile upload's
 * 10 MB, which a caller with a bigger file reaches as pasted text instead.
 */
const REPLACE_FILE_MAX_BASE64_CHARS = 1_900_000;

export const materialsActions = [
  defineAction({
    id: "generate_pack",
    kind: "data",
    risk: "async",
    title: "Generate application materials",
    description:
      "Write the person's materials for one saved role: a tailored resume, a cover letter, and answers to the employer's questions. Pass `assets` for a subset, omit it for all three. One request costs one pack allowance whatever it asks for, so batching is cheaper for them than three calls, and generation takes tens of seconds. Requires the role saved first. Do NOT use it to change materials that already exist — `edit_resume`, `edit_cover_letter` and `edit_answer` keep the person's edits instead of overwriting them.",
    input: z.object({
      jobId: z
        .string()
        .describe("Listing or private-job id, for a role not yet prepared."),
      assets: z
        .array(packAssetSchema)
        .min(1)
        .max(3)
        .optional()
        .describe("Subset to generate. Omit for all three."),
    }),
    output: receiptSchema,
    authorization: { mode: "receipt" },
    anchor: { route: "/pack/:listingId", target: "pack.header" },
    invalidates: ["pipeline", "pack-usage"],
    event: ASSISTANT_EVENTS.ASSET_GENERATED,
    mcp: {
      expose: true,
      description:
        "Queues a tailored resume, cover letter and employer-question answers for one saved role. assets optionally selects a subset; omission requests all three. Each request spends one pack allowance, regardless of subset, and generation settles asynchronously. Existing materials can be overwritten by generation.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),

  defineAction({
    id: "prepare_applications",
    kind: "data",
    risk: "async",
    title: "Prepare applications for several roles",
    description:
      "Save and prepare materials for up to 10 roles in one call, one role after another: a role not yet saved is saved, then its tailored resume, cover letter and answers are written. Pass the exact ids of the roles the person chose, resolving \"these\" to the ids you showed them. It never applies. A role not yet saved is saved and prepared the way saving it in the app is, which counts against the daily save limit; a saved role whose materials must be written costs one pack allowance. If they ask about cost, read `get_usage` first. Every role gets its own outcome, so report those counts and never a blanket success. Calling it again is safe: finished and in-flight work is reused, and materials the person edited are never rewritten. Follow progress with `get_pack_status`.",
    input: z.object({
      jobIds: z
        .array(z.string())
        .min(1)
        .max(PREPARE_BATCH_MAX)
        .refine(distinct, { message: "Name each role once." })
        .describe("Listing or private-job ids, each once."),
      assets: z
        .array(packAssetSchema)
        .min(1)
        .max(3)
        .optional()
        .describe("Subset to write for every role. Omit for all three."),
    }),
    output: z.object({
      receipt: receiptSchema,
      results: z.array(
        z.object({
          jobId: z.string(),
          applicationId: z.string().nullable(),
          outcome: prepareOutcomeSchema,
          message: z.string(),
        }),
      ),
      allowance: z.object({
        /** Null on a plan with no daily pack limit. */
        limit: z.int().nullable(),
        usedBefore: z.int(),
        /** Roles this call started materials for. */
        admitted: z.int(),
        remaining: z.int().nullable(),
        resetsAt: z.string().nullable(),
      }),
    }),
    authorization: { mode: "receipt" },
    anchor: { route: "/applications", target: "pipeline.board" },
    invalidates: ["pipeline", "pack-usage"],
    event: ASSISTANT_EVENTS.ASSET_GENERATED,
    mcp: {
      expose: true,
      description:
        "Saves and prepares materials for up to ten specified roles sequentially without submitting applications. Unsaved roles consume the daily save allowance; generation for saved roles consumes pack allowance. Finished or in-flight preparation is reused, and person-edited materials are preserved. Each role returns its own outcome.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),

  defineAction({
    id: "get_pack_status",
    kind: "data",
    risk: "read",
    title: "Check whether materials are ready",
    description:
      "Read where each application's materials stand: queued, generating, ready, partial, failed, stale (written from an earlier resume), not started, or not found; which assets were asked for and which landed; whether the person edited them; and the page where they review them. Poll this after `prepare_applications` or `generate_pack`. It starts and changes nothing.",
    input: z.object({
      applicationIds: z
        .array(z.string())
        .min(1)
        .max(PREPARE_BATCH_MAX)
        .describe(
          "Application ids from a receipt or a result; a card or listing id on the board also resolves.",
        ),
    }),
    output: z.object({
      packs: z.array(
        z.object({
          /** The id as it was asked for. */
          id: z.string(),
          applicationId: z.string().nullable(),
          status: z.enum([
            "queued",
            "generating",
            "ready",
            "partial",
            "failed",
            "stale",
            "not_started",
            "not_found",
          ]),
          assets: packAssetOutcomesSchema.nullable(),
          edited: z.boolean(),
          materialsRevision: z.int().nullable(),
          locked: z.boolean(),
          coverLettersDisabled: z.boolean(),
          webUrl: z.string().nullable(),
        }),
      ),
    }),
    authorization: { mode: "none" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Returns material preparation state for the specified application, board-card or listing ids: queued, generating, ready, partial, failed, stale, not_started or not_found. Includes requested and completed assets, edit and lock state, material revision and review-page URL. Reading starts no generation and changes no materials.",
      readOnlyHint: true,
      openWorldHint: false,
    },
  }),

  defineAction({
    id: "edit_cover_letter",
    kind: "data",
    risk: "cheap",
    title: "Edit the cover letter",
    description:
      "Revise an existing cover letter against an instruction in the person's own words. Its `scope` is a paragraph index or the text they selected, which the situation carries as `selection`; with no scope the tool locates the paragraph the instruction names itself, and an instruction about the whole letter rewrites the whole letter. Requires materials to exist for the application.",
    input: z.object({
      applicationId: z.string(),
      instruction: z
        .string()
        .min(1)
        .max(REFINE_INSTRUCTION_MAX_CHARS)
        .describe("What to change, in the person's words."),
      scope: editScopeSchema.optional(),
    }),
    output: editResult,
    authorization: { mode: "receipt", undoWindowMs: MATERIAL_UNDO_WINDOW_MS },
    anchor: { route: "/pack/:listingId", target: "pack.coverLetter" },
    invalidates: ["application-materials"],
    event: ASSISTANT_EVENTS.ASSET_REFINED,
    mcp: {
      expose: true,
      description:
        "Revises an existing application's cover letter using the supplied instruction. scope can identify a paragraph or selected passage. Without scope, the targeted passage is located from the instruction; a whole-letter instruction revises the whole letter. Existing materials are required.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),

  defineAction({
    id: "edit_resume",
    kind: "data",
    risk: "cheap",
    title: "Edit the tailored resume",
    description:
      "Revise the tailored resume for one application against an instruction. An application holds TWO resumes behind one control, the person's own upload and this tailored copy, and this writes only the tailored one — when the situation says the open document is the `default` variant it refuses, so switch with `update_application_materials` and retry the edit in the same turn rather than asking whether to switch. Its `scope` is a `section` block id or the text they selected; when no scope is given the tool locates the block the instruction addresses itself, so pass the person's instruction as they gave it, including the target they named (\"next to Princeton University\", \"the Ponder entry\"), rather than asking which entry first. Formatting the resume already carries survives the edit; for a look-only change use `format_resume`. The PDF is regenerated from the result, so the download and the screen never disagree. Requires materials to exist.",
    input: z.object({
      applicationId: z.string(),
      instruction: z.string().min(1).max(REFINE_INSTRUCTION_MAX_CHARS),
      scope: editScopeSchema.optional(),
    }),
    output: editResult,
    authorization: { mode: "receipt", undoWindowMs: MATERIAL_UNDO_WINDOW_MS },
    anchor: { route: "/pack/:listingId", target: "pack.resume" },
    invalidates: ["application-materials"],
    event: ASSISTANT_EVENTS.ASSET_REFINED,
    mcp: {
      expose: true,
      description:
        "Revises one application's tailored resume using the supplied instruction, preserving its formatting and regenerating the PDF. scope identifies a section block or selected passage; otherwise the target is located from the instruction. The person's default uploaded resume is not modified; an active default variant is refused. Existing materials are required.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),

  defineAction({
    id: "format_resume",
    kind: "data",
    risk: "cheap",
    title: "Change how part of the resume looks",
    description:
      "Change how part of the tailored resume looks without changing its words: center or left-align it, or bold/italic/underline it or a phrase in it. Point at one line by a few of its words (`line`), or at a whole section by its heading (`section`), whose lines are styled together. When the situation says the person has selected text in the resume, that selection IS the target: call with no `line` or `section` and the highlighted lines are formatted. For wording changes use edit_resume. No writing model runs and no allowance is spent; the receipt carries an undo.",
    input: z
      .object({
        applicationId: z.string(),
        line: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe(
            "A few words that identify one non-blank line of the tailored resume, matched case-insensitively.",
          ),
        section: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe(
            "A heading as it appears on the resume, such as SUMMARY or EXPERIENCE; the section's lines under it are styled together. The heading line itself is not — to style it, name it as a `line`.",
          ),
        text: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe(
            "A phrase within the targeted lines. When given, the marks apply to it alone; otherwise to the whole of each line.",
          ),
        align: z.enum(["left", "center"]).optional(),
        bold: z.boolean().optional().describe("`false` removes the mark."),
        italic: z.boolean().optional().describe("`false` removes the mark."),
        underline: z.boolean().optional().describe("`false` removes the mark."),
      })
      .refine(
        (input) =>
          input.align !== undefined ||
          input.bold !== undefined ||
          input.italic !== undefined ||
          input.underline !== undefined,
        { message: "At least one of align, bold, italic or underline is required." },
      )
      .refine((input) => input.line === undefined || input.section === undefined, {
        message: "Pass `line` or `section`, not both.",
      }),
    output: receiptSchema,
    authorization: { mode: "receipt", undoWindowMs: MATERIAL_UNDO_WINDOW_MS },
    anchor: { route: "/pack/:listingId", target: "pack.resume" },
    invalidates: ["application-materials"],
    event: ASSISTANT_EVENTS.ASSET_REFINED,
    mcp: {
      expose: true,
      description:
        "Changes alignment, bold, italic or underline formatting of a tailored resume without changing its words. line identifies a passage and section identifies a heading; selected text can supply the target when neither is given. No writing model or allowance is used. The receipt includes undo.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),

  defineAction({
    id: "edit_answer",
    kind: "data",
    risk: "cheap",
    title: "Edit one application answer",
    description:
      "Revise a single answer to one of the employer's application questions. `questionId` is the scope, so no other answer moves. Do NOT use it for the cover letter or the resume, which have their own actions, and do NOT change a factual screening answer here — work authorization, salary, start date live in the person's profile and change through `update_preferences`.",
    input: z.object({
      applicationId: z.string(),
      questionId: z.string(),
      instruction: z.string().min(1).max(REFINE_INSTRUCTION_MAX_CHARS),
    }),
    output: editResult,
    authorization: { mode: "receipt", undoWindowMs: MATERIAL_UNDO_WINDOW_MS },
    anchor: { route: "/pack/:listingId", target: "pack.answer:<id>" },
    invalidates: ["application-materials"],
    event: ASSISTANT_EVENTS.ASSET_REFINED,
    mcp: {
      expose: true,
      description:
        "Revises one employer-question answer identified by questionId; other answers and documents remain unchanged. This edits application prose rather than the account's factual screening, work-authorization, compensation or availability settings.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),

  defineAction({
    id: "strengthen_application",
    kind: "data",
    risk: "async",
    title: "Strengthen a whole application",
    description:
      "Improve every asset of one application together: it reads the role, the existing materials and the person's recorded evidence, then composes one edit per asset itself. That takes appreciably longer than a single edit and spends one refine allowance per asset it changes. Because it picks the content, it is checked for invention at both ends: `emphasis` passes an evidence gate first, and an emphasis adding a number, title, employer, date or credential needs `evidenceIds` or the person is asked where the fact comes from; then a resume whose ENTRY HEADERS name an employer, school or degree the record does not carry is discarded, which stops the pass with the earlier assets kept. That check reads entry headers only, not every name in a bullet. Use it when they ask for a better application without naming the change; when they named it, a single `edit_*` is faster and cheaper.",
    input: z.object({
      applicationId: z.string(),
      /**
       * Not a refine instruction and deliberately not capped to match one:
       * the handler composes a per-asset instruction from the role, the
       * materials, and the person's evidence, and this is one input to
       * that. Kept well under the route's cap regardless.
       */
      emphasis: z
        .string()
        .max(400)
        .optional()
        .describe(
          "What the person wants foregrounded, when they said. Omit otherwise.",
        ),
      evidenceIds: evidenceIdsInput,
    }),
    // One receipt for the whole pass. `diff` is the last asset's, because a
    // reveal can only highlight one block and the per-asset story is in the
    // summary; it is null when nothing changed.
    output: z.object({
      receipt: receiptSchema,
      diff: diffSummarySchema.nullable(),
    }),
    authorization: { mode: "receipt" },
    anchor: { route: "/pack/:listingId", target: "pack.header" },
    invalidates: ["application-materials"],
    event: ASSISTANT_EVENTS.ASSET_REFINED,
    mcp: {
      expose: true,
      description:
        "Improves an application's existing materials against its role and recorded career evidence, spending one refine allowance per changed asset. emphasis adding numbers, titles, employers, dates or credentials requires evidenceIds. Unsupported resume entry headers are rejected; previously completed asset edits are retained if a later asset fails.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),

  defineAction({
    id: "restore_material",
    kind: "data",
    risk: "cheap",
    title: "Put a document back the way it was",
    description:
      "Put a cover letter, the tailored resume, or one answer back the way it stood before an edit. It is the inverse the `edit_*` receipts declare: pass that receipt's `undo.args` unchanged, because arguments that do not match a recorded edit inside its still-open undo window are refused — this rewinds an edit, it cannot write text of your own. A letter and an answer carry their previous `text`; the resume names `resumeRevisionId` instead, and restoring it also puts back the copy this application would send.",
    input: z.object({
      applicationId: z.string(),
      asset: z
        .enum(["coverLetter", "resume", "answers"])
        .describe("Which asset the edit changed."),
      question: z
        .string()
        .max(2_000)
        .optional()
        .describe("The answer's question text; required for `answers`."),
      text: z
        .string()
        .max(50_000)
        .optional()
        .describe(
          "The text that stood before the edit, from its receipt. Required for `coverLetter` and `answers`; a resume restore names a revision instead.",
        ),
      resumeRevisionId: z
        .string()
        .max(200)
        .optional()
        .describe(
          "The tailored-resume revision to put back, from the `edit_resume` receipt. Required for `resume`.",
        ),
    }),
    output: receiptSchema,
    authorization: { mode: "receipt" },
    anchor: { route: "/pack/:listingId", target: "pack.header" },
    invalidates: ["application-materials"],
    event: ASSISTANT_EVENTS.ASSET_REFINED,
    mcp: {
      expose: true,
      description:
        "Restores a cover letter, tailored resume or answer to a recorded pre-edit version within its undo window. Arguments must match the recorded edit; arbitrary replacement text is refused. Resume restoration uses resumeRevisionId and restores the application's sendable copy.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),
  defineAction({
    id: "get_application_materials",
    kind: "data",
    risk: "read",
    title: "Read what one application will send",
    description:
      "Read what one application will actually send to this employer: which resume version is selected, whether the cover letter is included, whether a send in flight has locked it, and the `revision` every write against it quotes. Read it before changing any of that and before proposing to apply. It says whether each document exists and how long it is, never its text. Do NOT confuse it with the standing cover-letter setting, `get_preferences`' `coverLettersEnabled`, which applies to packs not yet written.",
    input: z.object({
      applicationId: z.string(),
    }),
    output: z.object({
      revision: z.int(),
      resumeVariant: resumeVariantSchema,
      defaultResume: documentPresence,
      tailoredResume: documentPresence,
      coverLetter: documentPresence,
      coverLetterIncluded: z.boolean(),
      locked: z
        .boolean()
        .describe("A send is in flight; nothing about it can be changed."),
    }),
    authorization: { mode: "none" },
    anchor: { route: "/applications", target: "pipeline.board" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: false,
      reason: "duplicate_of_mcp_tool",
      note: "the hand-written tool of this name returns the document bodies, which an agent reading them for a person needs and this twin withholds.",
    },
  }),

  defineAction({
    id: "update_application_materials",
    kind: "data",
    risk: "cheap",
    title: "Choose what one application sends",
    description:
      "Change what this one application will send: `resumeVariant` picks the person's own uploaded resume or the tailored one, `coverLetterIncluded` decides whether the letter goes with it. Send only the keys that change. Run it the moment they ask, with no confirming question: it changes which of their own documents this application shows and sends, and the receipt carries an undo. It writes no prose — the documents themselves change through `edit_resume` and `edit_cover_letter` — and it is the per-application choice, not the standing `update_preferences` setting for whether packs get a letter at all. Refused on an application that is locked or already sent.",
    input: z.object({
      applicationId: z.string(),
      expectedRevision: z
        .int()
        .min(0)
        .describe(
          "The revision the person is looking at: the situation's open document revision, or the `revision` from `get_application_materials`.",
        ),
      resumeVariant: resumeVariantSchema.optional(),
      coverLetterIncluded: z.boolean().optional(),
    }),
    output: receiptSchema,
    authorization: { mode: "receipt", undoWindowMs: MATERIAL_UNDO_WINDOW_MS },
    anchor: { route: "/applications", target: "pipeline.board" },
    invalidates: ["application-materials", "pipeline"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: false,
      reason: "duplicate_of_mcp_tool",
      note: "the hand-written tool of this name also writes `resumeHtml` and `coverLetter` as free text, which nothing in this registry does.",
    },
  }),

  defineAction({
    id: "reopen_application_materials",
    kind: "data",
    risk: "cheap",
    title: "Reopen a failed application's materials",
    description:
      "Start a new editable revision of an application whose send FAILED, so its materials can be changed before a retry. The API decides, not you: it reopens only when it can prove the failed attempt cannot still submit, because editing materials underneath a run that is still going would change what a real employer receives mid-submission. There is no undo — the new revision is the current one from then on. Materials on an application that was never sent are already editable.",
    input: z.object({
      applicationId: z.string(),
    }),
    output: receiptSchema,
    authorization: { mode: "receipt" },
    anchor: { route: "/applications", target: "pipeline.board" },
    invalidates: ["application-materials", "pipeline"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: false,
      reason: "duplicate_of_mcp_tool",
      note: "the hand-written tool of this name answers with the reopened materials block rather than a receipt.",
    },
  }),

  defineAction({
    id: "get_application_documents",
    kind: "data",
    risk: "read",
    title: "Get links to one application's documents",
    description:
      "Links to download what one application will send: its resume as PDF and as DOCX, its cover letter as PDF (there is no letter DOCX), and the whole pack as one PDF. Give the person the links exactly as returned. Each opens in any browser without signing in, for about ten minutes, and only for the version that existed when it was made, so fetch fresh links rather than reusing old ones. A null link means that document is missing or left out. `packPageUrl` opens the application in Dreamwork and needs them signed in. Also says where each document came from — `person` means one they handed in — and the `revision` `replace_application_document` quotes.",
    input: z.object({
      applicationId: z.string(),
    }),
    output: z.object({
      applicationId: z.string(),
      revision: z.int(),
      locked: z
        .boolean()
        .describe("A send is in flight; nothing about it can be changed."),
      resume: z.object({
        present: z.boolean(),
        source: z
          .enum(["tailored", "default", "person"])
          .describe(
            "`default` is their profile resume, `tailored` the copy written for this role, `person` one they handed in for it.",
          ),
        sentAs: z.enum(["original_pdf", "rendered_from_text"]).optional(),
        ...personDocumentFields,
      }),
      coverLetter: z.object({
        present: z.boolean(),
        included: z.boolean(),
        source: z.enum(["generated", "person"]).nullable(),
        ...personDocumentFields,
      }),
      links: z.object({
        resumePdf: z.string().nullable(),
        resumeDocx: z.string().nullable(),
        coverLetterPdf: z.string().nullable(),
        packPdf: z.string().nullable(),
      }),
      expiresAt: z.string(),
      packPageUrl: z.string(),
    }),
    authorization: { mode: "none" },
    anchor: { route: "/applications", target: "pipeline.board" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Returns version-specific resume PDF and DOCX, cover-letter PDF and combined-pack PDF download links for one application, plus source, inclusion, lock state and revision. Links open without login for about ten minutes. Null links indicate missing or excluded documents. packPageUrl requires sign-in. There is no cover-letter DOCX.",
      readOnlyHint: true,
      openWorldHint: false,
    },
  }),

  defineAction({
    id: "replace_application_document",
    kind: "data",
    risk: "cheap",
    title: "Use the person's own document for one application",
    description:
      "Replace one application's resume or cover letter with a document the person edited themselves: their pasted text, or their file (PDF, DOCX, TXT or MD) as raw base64. Do not convert a file to text yourself. It is stored exactly as given, no model rewrites it, and it becomes what this application sends: a resume becomes its tailored copy and is selected, a letter is included. A PDF resume is sent as their own file (`sentAs` in `get_application_documents`); anything else is rendered from its text, so its formatting is rebuilt. Only for the person's own document for THIS application, when they hand one over. Never use it to write or improve a document yourself (`edit_resume` and `edit_cover_letter` do that), and never for their main resume, which is `upload_resume`. On the site, pass only text the person pasted in their message, unchanged. Quote `expectedRevision`; refused when the application is locked or already sent.",
    input: z
      .object({
        applicationId: z.string(),
        document: z.enum(["resume", "coverLetter"]),
        expectedRevision: z
          .int()
          .min(0)
          .describe(
            "The `revision` from get_application_documents or get_application_materials.",
          ),
        text: z
          .string()
          .min(1)
          .max(100_000)
          .optional()
          .describe("The whole document as the person wrote it. Send this or `file`."),
        file: z
          .object({
            contentBase64: z
              .string()
              .min(1)
              .max(REPLACE_FILE_MAX_BASE64_CHARS)
              .describe("The file's raw bytes, base64-encoded; about 1.4 MB at most."),
            format: z.enum(["pdf", "docx", "txt", "md"]),
            filename: z.string().max(255).optional(),
          })
          .optional(),
      })
      .refine((input) => (input.text === undefined) !== (input.file === undefined), {
        message: "Send exactly one of `text` or `file`.",
      }),
    output: receiptSchema,
    authorization: { mode: "receipt", undoWindowMs: MATERIAL_UNDO_WINDOW_MS },
    anchor: { route: "/applications", target: "pipeline.board" },
    invalidates: ["application-materials", "pipeline"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Replaces one application's resume or cover letter with the person's supplied text or raw-base64 PDF, DOCX, TXT or MD. The stored content is not rewritten by a model. A resume becomes the selected tailored copy; a letter becomes included. PDF resumes retain their original file, while other formats are rendered from extracted text. expectedRevision is required; locked or sent applications are refused. The account's main resume is unaffected.",
      readOnlyHint: false,
      openWorldHint: false,
      // A replaced letter keeps no prior version, the way `upload_resume`
      // keeps no prior profile resume.
      destructiveHint: true,
    },
  }),
] as const;
