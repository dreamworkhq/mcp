import { z } from "zod";
import { defineAction } from "../action.js";
import { ASSISTANT_EVENTS } from "../events.js";
import { receiptSchema } from "../receipt.js";

export const autopilotStateSchema = z.enum([
  "off",
  "on",
  "paused",
  "unavailable",
]);

export const autopilotActions = [
  defineAction({
    id: "get_autopilot_settings",
    kind: "data",
    risk: "read",
    title: "Read Autopilot settings",
    description:
      "Read the saved minimum Matches score and whether Autopilot sends the default or tailored resume. This does not start applications. Cover-letter settings are available through profile preferences.",
    input: z.object({}),
    output: z.object({
      scoreFloor: z.number().nullable(),
      scoreFloorDefault: z.number(),
      resumeVariant: z.enum(["default", "tailored"]),
    }),
    authorization: { mode: "none" },
    anchor: { route: "/applications", target: "autopilot.settings" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Returns the saved minimum Matches score and default-versus-tailored resume choice for Autopilot. Reading settings starts no applications.",
      readOnlyHint: true,
      openWorldHint: false,
    },
  }),
  defineAction({
    id: "update_autopilot_settings",
    kind: "data",
    risk: "consequential",
    title: "Change Autopilot settings",
    description:
      "Change the hard minimum score shown in Matches (70–97, null restores 70) or use the person's default resume instead of tailoring. Requires an explicit instruction. Applies to waiting applications and is rechecked before submission. Does not enable, resume or start Autopilot. Applications already sent cannot be recalled; stopped applications are not automatically retried.",
    input: z
      .object({
        scoreFloor: z.number().int().min(70).max(97).nullable().optional(),
        resumeVariant: z.enum(["default", "tailored"]).optional(),
      })
      .refine(
        (input) =>
          input.scoreFloor !== undefined || input.resumeVariant !== undefined,
        "Specify a setting to change",
      ),
    output: receiptSchema,
    authorization: { mode: "command", requires: ["explicit_verb"] },
    anchor: { route: "/applications", target: "autopilot.settings" },
    invalidates: ["autopilot"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Changes the minimum Matches score from 70 to 97, with null restoring 70, or the default-versus-tailored resume choice. Explicit consent is required. Changes apply to waiting applications and are rechecked before submission. This does not enable or resume Autopilot, recall sent applications or retry stopped applications.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),
  defineAction({
    id: "get_autopilot_status",
    kind: "data",
    risk: "read",
    title: "Read Autopilot status",
    description:
      "Read whether Dreamwork is applying on the person's behalf: the state, applications sent today and this month against those limits, the match-score floor it applies at, how many roles clear it, how many submissions are still sending, and when the next batch goes out. `dailyLimit` is today's allowance and `usualDailyLimit` is the plan's usual daily limit. On the first day Autopilot sends in a monthly window, today's allowance is a larger first-day allowance; after that day the usual daily limit applies. When the two differ, say that today is the first-day allowance and name the usual limit for the days that follow. That first day is the first day it sends in the window, not the first day of the calendar month. `unavailable` means the plan does not allow it and `unavailableReason` answers \"why isn't it working\". Read it before saying anything about what Autopilot has done and before turning it on or off. There is no last-run timestamp — narrate cadence from `nextRunAt`. Which roles it applied to is `get_pipeline`.",
    input: z.object({}),
    output: z.object({
      state: autopilotStateSchema,
      sentToday: z.int(),
      /** Today's allowance: larger than `usualDailyLimit` on the first day
       *  Autopilot sends in a monthly window, equal to it after. */
      dailyLimit: z.int().nullable(),
      /** The plan's steady daily limit, whichever allowance applies today. */
      usualDailyLimit: z.int().nullable(),
      sentThisMonth: z.int(),
      monthlyLimit: z.int().nullable(),
      /** Display-percentage match floor a role must clear to be picked up. */
      scoreFloor: z.int().nullable(),
      /** Roles in the person's pool at or above that floor right now. */
      eligibleCount: z.int().nullable(),
      /** Submissions Autopilot started that have not settled. */
      inFlightCount: z.int().nullable(),
      /** When the next batch goes out, or the monthly reset when spent. */
      nextRunAt: z.string().nullable(),
      unavailableReason: z.string().nullable(),
    }),
    authorization: { mode: "none" },
    anchor: { route: "/applications", target: "autopilot.switch" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Returns Autopilot state, daily and monthly sent counts and plan limits, match-score floor, eligible and in-flight counts and nextRunAt. dailyLimit is today's allowance and usualDailyLimit is the plan's usual daily limit. On the first day Autopilot sends in a monthly window, dailyLimit is a larger first-day allowance; after that day it equals usualDailyLimit. That first day is the first day it sends in the window, not the first day of the calendar month. unavailableReason explains plan restrictions. No last-run timestamp is provided.",
      readOnlyHint: true,
      openWorldHint: false,
    },
  }),

  defineAction({
    id: "set_autopilot",
    kind: "data",
    risk: "consequential",
    title: "Turn Autopilot on or off",
    description:
      'Turn Autopilot on, off, or paused. On means real applications go to real employers under the person\'s name without asking each time, so it runs only on an explicit instruction — "turn on autopilot", "pause it", "stop applying for me" — and never as an inference from a complaint about volume. Pause keeps the configuration and stops sending; off clears the schedule. The state is the only thing it changes: how many go out a day is fixed by their plan and nothing in Dreamwork can move it, so answer "only send three a day" by naming the limit `get_autopilot_status` reports rather than calling this.',
    input: z.object({
      state: z.enum(["on", "off", "paused"]),
    }),
    output: receiptSchema,
    authorization: { mode: "command", requires: ["explicit_verb"] },
    anchor: { route: "/applications", target: "autopilot.switch" },
    invalidates: ["autopilot"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Sets Autopilot on, off or paused after explicit consent. On authorizes recurring real employer submissions under the account holder's name without per-application approval. Pause preserves configuration and stops sending; off clears the schedule. Daily and monthly limits remain determined by the plan.",
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    },
  }),
] as const;
