import { z } from "zod";
import {
  requestComponent,
  responseComponent,
  sharedComponent,
} from "../registry.js";

export const applicationResumeVariantSchema = sharedComponent(
  z.enum(["default", "tailored"]),
  {
    id: "ApplicationResumeVariant",
    description: "The job-owned resume version selected for this application.",
  },
);

export const applicationResumeAssetSchema = responseComponent(
  z.object({
    html: z.string(),
    pdfBase64: z.string().nullable(),
  }),
  {
    id: "ApplicationResumeAsset",
    description:
      "Editable resume source and its matching rendered PDF. Both are scoped to one application.",
  },
);

export const applicationMaterialsSchema = responseComponent(
  z.object({
    revision: z.int().min(0),
    resumeVariant: applicationResumeVariantSchema,
    coverLetter: z.string(),
    coverLetterIncluded: z.boolean(),
    locked: z.boolean(),
    defaultResume: applicationResumeAssetSchema,
    tailoredResume: applicationResumeAssetSchema.nullable(),
  }),
  {
    id: "ApplicationMaterials",
    description:
      "Revisioned, per-application material selection. Revision zero is the legacy fallback view; an Apply confirmation must persist a positive revision.",
  },
);

export const resumeLineKindSchema = sharedComponent(
  z.enum(["name", "heading1", "heading2", "paragraph", "bullet", "orderedItem"]),
  {
    id: "ResumeLineKind",
    description: "What a resume line is, in the closed set both renderers can draw.",
  },
);

export const resumeLineRoleSchema = sharedComponent(
  z.enum(["name", "contact", "heading", "entry", "title", "context", "bullet", "paragraph"]),
  {
    id: "ResumeLineRole",
    description:
      "The layout the PDF renderer draws a line as. View-only: it seeds the editor's display and is never stored.",
  },
);

export const resumeDocumentSchema = responseComponent(
  z.object({
    version: z.literal(1),
    textHash: z.string(),
    overlay: z.array(
      z.object({
        line: z.int().min(0),
        kind: resumeLineKindSchema.optional(),
        align: z.enum(["left", "center"]).optional(),
        runs: z
          .array(
            z.object({
              text: z.string(),
              marks: z.array(z.enum(["bold", "italic", "underline"])).optional(),
            }),
          )
          .optional(),
      }),
    ),
  }),
  {
    id: "ResumeDocument",
    description:
      "Formatting stored beside resume text as a sparse per-line overlay, paired to the text by hash.",
  },
);

export const resumeDocumentSeedSchema = responseComponent(
  z.object({
    text: z.string(),
    inferredKinds: z.array(resumeLineKindSchema),
    roles: z.array(resumeLineRoleSchema),
    document: resumeDocumentSchema.nullable(),
  }),
  {
    id: "ResumeDocumentSeed",
    description:
      "What the page-faithful editor opens with: the stored resume text, the parser's kind and layout role for each non-blank line in order, and the stored overlay if any.",
  },
);

/**
 * The editor's own document (Tiptap JSON) for a resume edit. Loosely typed on
 * purpose: the API's exporter reads the node types and marks it understands
 * and ignores the rest, and pinning the editor's schema here would make every
 * Tiptap upgrade a contract change.
 */
export const resumeEditorDocumentSchema = requestComponent(
  z.looseObject({
    type: z.literal("doc"),
    content: z.array(z.looseObject({ type: z.string() })).optional(),
  }),
  {
    id: "ResumeEditorDocument",
    description:
      "The editor's document for a resume edit, sent beside resumeHtml so bold, italic, underline, alignment and heading choices survive the save.",
  },
);

export const applicationMaterialsUpdateRequestSchema = requestComponent(
  z
    .object({
      expectedRevision: z.int().min(0),
      resumeVariant: applicationResumeVariantSchema.optional(),
      resumeHtml: z.string().max(100_000).optional(),
      resumeDocument: resumeEditorDocumentSchema.optional(),
      coverLetter: z.string().max(50_000).optional(),
      coverLetterIncluded: z.boolean().optional(),
    })
    .refine(
      (value) =>
        value.resumeVariant !== undefined ||
        value.resumeHtml !== undefined ||
        value.coverLetter !== undefined ||
        value.coverLetterIncluded !== undefined,
      { message: "At least one material field is required." },
    ),
  {
    id: "ApplicationMaterialsUpdateRequest",
    description:
      "Optimistic per-job edit. resumeHtml applies to resumeVariant and is rendered to a matching PDF before commit.",
  },
);

export const applicationMaterialsResponseSchema = responseComponent(
  z.object({ materials: applicationMaterialsSchema }),
  {
    id: "ApplicationMaterialsResponse",
    description: "The persisted material revision returned after an edit.",
  },
);
