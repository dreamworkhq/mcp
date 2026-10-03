import { z } from "zod";
import { requestComponent, responseComponent, sharedComponent } from "../registry.js";
import { isoDateTime, uuidString } from "./common.js";

/**
 * What the user says a filtered email was when they ask for it to be shown.
 * Stored as a `review` ground-truth label for the inbound classifier.
 */
export const filteredMailShowLabelSchema = sharedComponent(
  z.enum(["recruiter_reply", "interview", "assessment", "rejection"]),
  {
    id: "FilteredMailShowLabel",
    description:
      "The user's own label for an email that should have been shown: a recruiter message, an interview, an assessment or task, or a rejection.",
  },
);

export const filteredMailItemSchema = responseComponent(
  z.object({
    id: uuidString,
    from: z.string(),
    subject: z.string(),
    receivedAt: isoDateTime,
    /** The matched application's company; null for unmatched mail. */
    company: z.string().nullable(),
  }),
  {
    id: "FilteredMailItem",
    description:
      "One inbound email the owner's Messages inbox hides. Verification codes, support and own-address mail are never listed.",
  },
);

export const filteredMailListResponseSchema = responseComponent(
  z.object({
    emails: z.array(filteredMailItemSchema),
    /** How many days back the list reaches. */
    windowDays: z.number().int().positive(),
  }),
  {
    id: "FilteredMailListResponse",
    description: "The owner's filtered mail from the window, newest first, at most 100 rows.",
  },
);

export const filteredMailDetailResponseSchema = responseComponent(
  filteredMailItemSchema.extend({
    content: z.string(),
    contentHtml: z.string().optional().describe(
      "Untrusted original email HTML. Consumers must sanitize before rendering; content remains the plain-text fallback.",
    ),
  }),
  {
    id: "FilteredMailDetailResponse",
    description: "One filtered email, read-only, with the same body fields Messages uses.",
  },
);

export const filteredMailShowRequestSchema = requestComponent(
  z.object({ label: filteredMailShowLabelSchema.optional() }),
  {
    id: "FilteredMailShowRequest",
    description: "Optional user label; `recruiter_reply` when omitted.",
  },
);

export type FilteredMailShowLabel = z.infer<typeof filteredMailShowLabelSchema>;
