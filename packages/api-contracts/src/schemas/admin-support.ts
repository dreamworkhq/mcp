import type { EmailReplyAttachment } from "./messages.js";

export type AdminSupportReplyRequest = {
  content: string;
  subject?: string;
  replyToInboundId: string;
  requestId: string;
  attachments?: EmailReplyAttachment[];
};
