import { z } from "zod";

/**
 * Slack takes 40,000 characters in one message and escaping can turn one
 * character into five, so the two long fields together stay under that.
 */
const MAX_BODY_CHARS = 3000;

/**
 * What an agent reports when a Dreamwork tool got in its way. The MCP tool
 * advertises this as its input and `POST /public/mcp/feedback` parses the same
 * schema, so the two cannot drift.
 *
 * Every field is text an agent wrote, on a route that needs no account, and a
 * reader treats it as untrusted. `summary` is the one field the Slack message
 * prints outside a quote block, so it is held to one line: a line break there
 * would let a report draw its own header lines.
 */
export const mcpFeedbackInputSchema = z.object({
  tool: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,63}$/, {
      error: "tool is a tool name, e.g. browse_listings.",
    })
    .optional()
    .describe(
      "The tool the report is about, by name. Omit it when the report is about the server as a whole.",
    ),
  summary: z
    .string()
    .max(200)
    .regex(/^[^\r\n]*\S[^\r\n]*$/, {
      error: "summary is one line of text.",
    })
    .describe("One sentence naming the problem, on one line."),
  details: z
    .string()
    .max(MAX_BODY_CHARS)
    .regex(/\S/, { error: "details cannot be blank." })
    .describe(
      "What you called and with which arguments, what you expected, and what came back, including any error text. Write placeholders such as <person> or <company> in place of anything about the person.",
    ),
  proposedFix: z
    .string()
    .max(MAX_BODY_CHARS)
    .regex(/\S/, { error: "proposedFix cannot be blank." })
    .optional()
    .describe(
      "The change to the tool, its input schema or its description that would have prevented the problem.",
    ),
});

export type McpFeedbackInput = z.infer<typeof mcpFeedbackInputSchema>;
