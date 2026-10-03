import { z } from "zod";

export const conversationMessageContentSchema = z.object({
  content: z.string(),
  contentHtml: z.string().optional().describe(
    "Untrusted original inbound email HTML. Consumers must sanitize before rendering; content remains the plain-text fallback. Never supplied for outbound messages.",
  ),
});

export type ConversationMessageContent = z.infer<typeof conversationMessageContentSchema>;

/** Email attachments carry canonical base64 bytes without a data URL prefix. */
export type EmailReplyAttachment = {
  filename: string;
  contentType: string;
  content: string;
};
