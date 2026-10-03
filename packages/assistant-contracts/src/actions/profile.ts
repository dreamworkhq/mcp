import { z } from "zod";
import { defineAction } from "../action.js";
import { ASSISTANT_EVENTS } from "../events.js";
import { JOB_FUNCTIONS } from "../jobFunctions.js";
import { receiptSchema } from "../receipt.js";

const workModeSchema = z.enum(["remote", "hybrid", "onsite"]);

/**
 * The seniority ladder, restated from `SENIORITY_RANK` in
 * `apps/api/src/engine/recommendations.ts`.
 *
 * A level outside that map scores as no level at all: the scorer looks the
 * string up and skips the comparison when it misses, so free text here would
 * store an answer that changes nothing. This package imports nothing from
 * `apps/*`, so the vocabulary is copied, and it has to equal that map's keys.
 */
const senioritySchema = z.enum([
  "INTERN",
  "JUNIOR",
  "MID",
  "SENIOR",
  "STAFF",
  "PRINCIPAL",
  "DIRECTOR",
  "VP",
  "C_SUITE",
]);

/** How interested the person is in AI-centred roles (`engine/ai-role.ts`). */
const aiRoleInterestSchema = z.enum(["HIGH", "OPEN", "LOW", "AVOID"]);

/**
 * The person's pay floor. This is where salary lives: the legacy
 * `salaryMin`/`salaryMax` keys are a frozen projection nothing writes, and a
 * number put there changes no matching and no application answer.
 */
const compensationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("open") }).strict(),
  z
    .object({
      kind: z.literal("minimum"),
      minimumAmount: z.number().positive().max(100_000_000),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .describe("ISO-4217 code, e.g. \"USD\"."),
      period: z.enum(["hour", "year"]),
    })
    .strict(),
]).refine(
  (value) => value.kind !== "minimum" || value.currency !== "USD" || value.period !== "year"
    || (value.minimumAmount >= 10_000 && value.minimumAmount <= 1_000_000),
  { message: "An annual USD minimum must be between $10,000 and $1,000,000", path: ["minimumAmount"] },
).describe("A USD per-year minimum must be between 10,000 and 1,000,000; other currencies and hourly rates are unbounded.");

const availabilitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("immediate") }).strict(),
  z
    .object({
      kind: z.literal("specific_date"),
      date: z.string().describe("Local date, YYYY-MM-DD."),
    })
    .strict(),
  z
    .object({
      kind: z.literal("notice_period"),
      noticePeriodDays: z.int().min(1).max(365),
    })
    .strict(),
]);

/**
 * Merge-patch shape for the person's job preferences. Absent keys are left
 * alone.
 *
 * The caps here are limits on what the assistant may WRITE, not claims about
 * what is stored — a person can answer through the profile editor in ways this
 * action would not compose. `storedPreferencesSchema` below is the read side
 * for exactly that reason.
 */
const preferencesPatchSchema = z
  .object({
    targetFunctions: z
      .array(z.enum(JOB_FUNCTIONS))
      .max(3)
      .optional()
      .describe(
        "Up to three of these labels; this REPLACES the list, so to add one include the current ones from get_preferences or the situation.",
      ),
    preferredLocations: z
      .array(z.string().min(1).max(120))
      .max(5)
      .optional()
      .describe("Where they want to work, not where they live."),
    acceptedWorkModes: z.array(workModeSchema).min(1).optional(),
    willingToRelocate: z.boolean().optional(),
    compensation: compensationSchema
      .nullable()
      .optional()
      .describe(
        "The person's pay floor. This is where salary lives. `null` withdraws it, which stops applications until it is answered again.",
      ),
    availability: availabilitySchema
      .nullable()
      .optional()
      .describe("`null` withdraws it, which stops applications until it is answered again."),
    dealBreakers: z.array(z.string().max(200)).max(10).optional(),
    coverLettersEnabled: z.boolean().optional(),
    // One level, because matching reads one: the overlay takes the first entry
    // and the profile editor is a single-select. A second entry would be
    // stored and never scored.
    seniorities: z
      .array(senioritySchema)
      .max(1)
      .optional()
      .describe(
        "The level to match at, as a one-item list. `[]` drops back to the level read off the resume.",
      ),
    aiRoleInterest: aiRoleInterestSchema
      .optional()
      .describe("How much they want AI-centred roles. AVOID demotes them."),
  })
  .strict();

/**
 * The same keys as they come BACK, without the write-side caps.
 *
 * A read has to be able to report an answer the person gave elsewhere. Reusing
 * the patch schema here would make `get_preferences` fail on a profile with
 * eleven deal-breakers rather than report eleven deal-breakers, which is the
 * one thing a read must never do.
 */
const storedPreferencesSchema = z
  .object({
    targetFunctions: z.array(z.string()).optional(),
    preferredLocations: z.array(z.string()).optional(),
    acceptedWorkModes: z.array(workModeSchema).optional(),
    willingToRelocate: z.boolean().optional(),
    compensation: compensationSchema.optional(),
    availability: availabilitySchema.optional(),
    dealBreakers: z.array(z.string()).optional(),
    coverLettersEnabled: z.boolean().optional(),
    seniorities: z.array(z.string()).optional(),
    aiRoleInterest: aiRoleInterestSchema.optional(),
  })
  .strict();

/**
 * What the natural-language parser actually writes.
 *
 * Deliberately NOT `preferencesPatchSchema`. That schema is the canonical
 * answer document `update_preferences` edits; the sentence parser writes an
 * older, looser set of preference keys, and describing its result in the
 * canonical vocabulary would claim it had set a target function or a work mode
 * when it set neither. Salary never appears here at all: the route refuses to
 * infer a currency or a pay period, which is what `salary_input_required`
 * means.
 */
const parsedPreferencesSchema = z
  .object({
    roles: z
      .array(z.string())
      .optional()
      .describe("Role keywords, which are not the canonical target functions."),
    locations: z.array(z.string()).optional(),
    remote: z.boolean().optional(),
    aiRoleInterest: aiRoleInterestSchema.optional(),
    dealBreakers: z.array(z.string()).optional(),
  })
  .strict();

/**
 * A stored hypothesis, exactly as `user_profiles.assistant_memory` holds it.
 *
 * There is no `confirmed` status: confirming moves the text into a stated
 * preference or a work-vault note and deletes the hypothesis, so a belief is
 * either an open question here or a fact in the record — never both, and never
 * a fact wearing a status field.
 */
const hypothesisSchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.string(),
  source: z
    .enum(["assistant", "user"])
    .describe("Who formed it. Neither makes it a fact."),
});

/**
 * The email categories, restated from `communicationPreferencesUpdateRequestSchema`
 * in `@jobless/api-contracts`.
 *
 * This package is zod-only and imports nothing from `apps/*` or from the wire
 * contracts, exactly as `@jobless/api-contracts` itself is, so the vocabulary
 * is copied rather than imported. It must equal that schema's: a value this
 * accepts and the route does not validates here and 400s there.
 */
const jobAlertsSchema = z.enum(["daily", "twice_weekly", "off"]);

/**
 * One thing standing between the person and an application going out, with
 * what an agent needs to ask for it. `field` is the evaluator's own name for
 * it and is a plain string here, because this package cannot see that union
 * and a read must report a field the build does not know yet rather than fail.
 */
const readinessItemSchema = z.object({
  field: z.string(),
  label: z.string(),
  group: z.enum([
    "setup",
    "contact",
    "resume",
    "eligibility",
    "workPreferences",
    "availability",
    "compensation",
  ]),
  question: z.string().describe("Ask the person this, in your own words."),
  answerShape: z
    .string()
    .nullable()
    .describe("The save_application_answers key that carries the answer. Null: only the person can fix it, at `webUrl`."),
  choices: z
    .object({
      for: z.string(),
      options: z.array(z.object({ value: z.string(), label: z.string() })),
    })
    .nullable(),
  current: z.unknown().describe("What is stored now, or null."),
  suggestion: z
    .object({
      value: z.unknown(),
      source: z.enum(["default", "profile"]),
      needsConfirmation: z.literal(true),
    })
    .nullable()
    .describe("Offer it as a question; save it only once they agree."),
  mustBeStatedByPerson: z.boolean(),
  webUrl: z.string(),
});

const readinessSchema = z.object({
  ready: z.boolean().describe("A one-off `apply` would pass every profile and plan check now."),
  autopilotReady: z.boolean(),
  autopilotAvailable: z.boolean(),
  entitlement: z.object({
    autoApply: z.boolean(),
    reason: z.enum(["tier", "lapsed"]).nullable(),
  }),
  onboarding: z.object({
    gateMode: z.enum(["off", "canary", "live"]),
    gated: z.boolean(),
    completed: z.boolean(),
    completedVersion: z.number().nullable(),
    requiredVersion: z.number(),
    needsCompletion: z.boolean(),
  }),
  missing: z.array(readinessItemSchema),
});

/**
 * The answer vocabularies below are restated from `@jobless/shared`
 * (`AUTHORIZATION_BASES`, `SPONSORSHIP_TIMINGS`, `EDUCATION_LEVELS`,
 * `LANGUAGE_PROFICIENCIES`, and the screening answer sets). This package
 * imports nothing outside zod, so they are copies, and they must equal those
 * lists: a value the shared list gains and this one lacks is refused here
 * before the route could accept it.
 *
 * Everything else is deliberately looser than `PATCH /profile/application-answers`.
 * Country codes, dates, currencies, and every cross-field rule (a basis that
 * contradicts `authorized`, a citizenship the basis needs) are the route's to
 * judge, and its refusal comes back naming the field.
 */
const eligibilityCountryAnswerSchema = z.object({
  code: z.string().describe("ISO-3166-1 alpha-2, e.g. \"US\"."),
  authorized: z.boolean(),
  requiresSponsorship: z.boolean(),
  basis: z.enum([
    "citizen",
    "permanent_resident",
    "eu_freedom_of_movement",
    "asylee_or_refugee",
    "temporary_work_auth",
    "not_authorized",
  ]),
  sponsorshipTiming: z
    .enum(["now", "future", "now_and_future"])
    .optional()
    .describe("Only when requiresSponsorship is true."),
  authorizationType: z
    .string()
    .optional()
    .describe("Temporary authorization only, e.g. \"H-1B\"."),
  authorizationExpiresOn: z
    .string()
    .optional()
    .describe("Temporary authorization only, YYYY-MM-DD."),
});

const applicationAnswersSchema = z.object({
  // Target roles and preferred locations are the same group, but they are
  // search preferences rather than gate answers and `update_preferences`
  // already carries them; restating the role vocabulary here would bill it
  // twice on every site turn.
  workPreferences: z
    .object({
      acceptedWorkModes: z.array(workModeSchema).min(1).optional(),
      willingToRelocate: z.boolean().optional(),
      maxTravelPercent: z.int().min(0).max(100).optional(),
    })
    .optional()
    .describe("Merged over what is stored."),
  compensation: compensationSchema.nullable().optional(),
  availability: availabilitySchema.nullable().optional(),
  eligibility: z
    .object({
      citizenshipCountryCodes: z.array(z.string()).optional(),
      countries: z
        .array(eligibilityCountryAnswerSchema)
        .optional()
        .describe("REPLACES the stored list: include every country, the stored ones too."),
    })
    .optional(),
  qualifications: z
    .object({
      highestEducationLevel: z
        .enum([
          "less_than_high_school",
          "high_school_or_equivalent",
          "some_college",
          "associate",
          "bachelor",
          "master",
          "professional",
          "doctorate",
          "other",
          "prefer_not_to_answer",
        ])
        .optional(),
      languages: z
        .array(
          z.object({
            code: z.string().describe("BCP-47, e.g. \"en\"."),
            proficiency: z.enum([
              "basic",
              "conversational",
              "professional",
              "fluent",
              "native_or_bilingual",
            ]),
          }),
        )
        .optional()
        .describe("Replaces the stored list."),
    })
    .optional(),
  screeningAnswers: z
    .object({
      reliableTransportation: z.boolean().optional(),
      workplaceAccommodation: z.enum(["yes", "no", "prefer_not_to_answer"]).optional(),
      securityClearance: z
        .enum([
          "none",
          "public_trust",
          "confidential",
          "secret",
          "top_secret",
          "top_secret_sci",
          "other_active",
        ])
        .optional(),
      foreignGovernmentFamilyTies: z.boolean().optional(),
      criminalHistory: z.enum(["none", "yes", "prefer_not_to_answer"]).optional(),
      criminalHistoryDetails: z.string().max(1_000).optional(),
      governmentOrMilitaryEmployment: z.boolean().optional(),
      clearanceEligibleToObtain: z.enum(["yes", "no", "not_sure"]).optional(),
      attestationConsent: z
        .boolean()
        .optional()
        .describe("Whether Dreamwork may sign accuracy statements on their behalf."),
      backgroundCheckConsent: z.boolean().optional(),
    })
    .optional()
    .describe("Merged over what is stored."),
});

const contactAnswersSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().max(40).optional(),
  phoneDialCode: z
    .string()
    .optional()
    .describe("Country calling code with its plus, e.g. \"+1\"."),
  mailingAddress: z
    .object({
      line1: z.string(),
      line2: z.string().optional(),
      city: z.string(),
      region: z.string().describe("State, province or region; \"\" where none."),
      postalCode: z.string().describe("\"\" where the country has none."),
      country: z.string(),
    })
    .optional(),
  currentLocation: z
    .string()
    .max(120)
    .optional()
    .describe("Where they live now, \"City, Region, Country\". Not where they want to work."),
  linkedinUrl: z.string().optional(),
  githubUrl: z.string().optional(),
  websiteUrl: z.union([z.url(), z.literal("")]).optional(),
  portfolioUrl: z.union([z.url(), z.literal("")]).optional(),
});
const autopilotResultsSchema = z.enum(["individual", "daily_digest", "off"]);

/**
 * Why job alerts would or would not actually arrive.
 *
 * Separate from the setting, and that separation is the point: a person can
 * have alerts set to daily and still receive none, because the address bounced
 * or they unsubscribed. Reporting the setting as the outcome is how "why am I
 * not getting emails" gets answered wrong.
 */
const jobAlertEligibilitySchema = z.object({
  eligible: z.boolean(),
  reason: z.enum([
    "eligible",
    "off",
    "inactive",
    "unsubscribed",
    "address_suppressed",
    "banned",
    "retired",
  ]),
  resumesOnActivity: z
    .boolean()
    .describe("Whether using the product again would start them up."),
});

export const profileActions = [
  defineAction({
    id: "get_preferences",
    kind: "data",
    risk: "read",
    title: "Read job preferences",
    description:
      "Read the person's stated job preferences: target functions, preferred locations, accepted work modes, relocation, pay floor, availability, deal-breakers, the level they match at, appetite for AI-centred roles, and whether cover letters are on. It also names the keys they have never answered, which is what makes a weak feed explicable. Read it before changing any of it and before explaining why their matches look the way they do. Resume content and work history are `get_career_record`.",
    input: z.object({}),
    output: z.object({
      preferences: storedPreferencesSchema,
      unanswered: z
        .array(z.string())
        .describe("Preference keys the person has never answered."),
    }),
    authorization: { mode: "none" },
    anchor: { route: "/profile", target: "profile.preferences" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Returns stated target functions, work locations and modes, relocation, pay floor, availability, deal-breakers, seniority, AI-role interest and cover-letter settings. unanswered identifies preference keys the account holder has not supplied. It does not return resume content or work history.",
      readOnlyHint: true,
      openWorldHint: false,
    },
  }),

  defineAction({
    id: "update_preferences",
    kind: "data",
    risk: "cheap",
    title: "Update job preferences",
    description:
      "Change the person's stated preferences as a merge patch: send only the keys that change. Salary belongs to `compensation` as a `minimum` with an amount, an ISO-4217 currency and a period; nowhere else stores pay the matcher reads. `seniorities` takes one level and overrides the resume, and `[]` hands that back to it. A change here re-runs matching, so the feed moves. Read `get_preferences` first before touching work modes or relocation: those two are stored as one group, so a patch omitting one carries the stored value forward. Do NOT send keys they did not mention, and do NOT infer a pay floor from a salary they admired on a listing.",
    input: z.object({
      patch: preferencesPatchSchema,
    }),
    output: receiptSchema,
    authorization: { mode: "receipt" },
    anchor: { route: "/profile", target: "profile.field:<id>" },
    invalidates: ["me", "matches"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Merges the supplied preference fields into the account's stored preferences and refreshes matching. compensation.kind is open or minimum; minimum requires minimumAmount, an ISO-4217 currency and an hour or year period. seniorities accepts one override level; an empty list restores resume-derived seniority. Work modes and relocation are stored together, with omitted values preserved.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),

  defineAction({
    id: "get_application_readiness",
    kind: "data",
    risk: "read",
    title: "Check what applying still needs",
    description:
      "Read whether Dreamwork can apply for the person right now and, if not, exactly what is missing. `ready` covers a one-off `apply`; `autopilotReady` covers turning Autopilot on; `entitlement` says whether the plan allows it at all. Each `missing` item carries the question to ask, the `save_application_answers` key that carries the answer (`answerShape`), valid `choices`, what is stored now, and a `suggestion` only where onboarding itself offers a default. `answerShape: null` means only the person can fix it, at `webUrl`. Call it before `apply` or `set_autopilot` when unsure, and after either is refused as `action_gated`.",
    input: z.object({}),
    output: readinessSchema,
    authorization: { mode: "none" },
    anchor: { route: "/profile", target: "profile.preferences" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Returns readiness for one-off submission and Autopilot, plan entitlement and missing onboarding answers. Missing items include question, answerShape, choices, current value, available suggestion and webUrl. A null answerShape means the step requires the person's action in the web app. This read sends nothing.",
      readOnlyHint: true,
      openWorldHint: false,
    },
  }),

  defineAction({
    id: "save_application_answers",
    kind: "data",
    risk: "cheap",
    title: "Save the person's application answers",
    description:
      "Save answers the person just gave you, through the same checks the onboarding wizard runs, then re-check readiness and finish setup once nothing is left. Send only what they said. `answers` holds the application-answer groups (`eligibility.countries` replaces the stored list, so resend every country); `contact` holds phone, mailing address, where they live now, and links. `statedByPerson: true` attests that every value came from the person in this conversation: never fill one from a resume, a listing, or a guess, and never default work eligibility, sponsorship or pay. With only `onboarding` missing, call it with no answers to finish setup. The result says `ready` and what is `stillMissing`. It sends no application; `apply` is still its own request.",
    input: z.object({
      answers: applicationAnswersSchema.optional(),
      contact: contactAnswersSchema.optional(),
      statedByPerson: z
        .literal(true)
        .describe(
          "The person gave every value here in this conversation. Never assumed.",
        ),
    }),
    output: z.object({
      receipt: receiptSchema,
      ready: z.boolean(),
      stillMissing: z.array(readinessItemSchema),
    }),
    authorization: { mode: "receipt" },
    anchor: { route: "/profile", target: "profile.preferences" },
    invalidates: ["me", "matches"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Saves person-stated application-answer and contact groups through onboarding validation, then rechecks readiness and completes setup when no requirements remain. statedByPerson:true attests that supplied values came from the person. eligibility.countries replaces the stored list. An empty answer set can finish otherwise-complete onboarding. Returns ready and stillMissing; no application is sent.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),

  defineAction({
    id: "parse_preferences_text",
    kind: "data",
    risk: "cheap",
    title: "Set several preferences from one sentence",
    description:
      "Turn one sentence describing several preferences at once — \"remote only, no crypto, AI-native companies\" — into keys and apply them. Report the `unparsed` fragments as well as what was set: a silently dropped constraint is how a feed goes wrong. It sets neither pay nor level; both come back unparsed and go through `update_preferences`, which is also the exact, cheaper action for a single clear preference.",
    input: z.object({
      text: z
        .string()
        .min(1)
        .max(1_000)
        .describe("The person's sentence, verbatim."),
    }),
    output: z.object({
      applied: parsedPreferencesSchema,
      unparsed: z
        .array(z.string())
        .describe("Fragments no preference key could carry."),
    }),
    authorization: { mode: "receipt" },
    anchor: { route: "/profile", target: "profile.preferences" },
    invalidates: ["me"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Parses a sentence describing job preferences, applies supported fields and returns applied values and unparsed fragments. Compensation and seniority are not set by this parser and remain unparsed.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),

  defineAction({
    id: "get_career_record",
    kind: "data",
    risk: "read",
    title: "Read the career record",
    description:
      "Read what Dreamwork knows about the person as a professional, in four separate lists: `facts` from the resume analysis (function, seniority, years, skills), `vault` naming the documents they have filed, `stated` for preferences they answered themselves, and `hypotheses` for what you have guessed and they have not confirmed. It carries titles and values, never resume text or a document body. Use it before writing anything about them and before judging fit. Their job-preference settings in full are `get_preferences`.",
    input: z.object({
      include: z
        .array(z.enum(["facts", "vault", "stated", "hypotheses"]))
        .optional()
        .describe(
          "Narrow the read. Omit for all four. A section you leave out comes back empty rather than absent, so do not read an omitted section as \"they have none\".",
        ),
    }),
    output: z.object({
      facts: z
        .object({
          functionPrimary: z.string().nullable(),
          functionSecondary: z.string().nullable(),
          yearsExperience: z.number().nullable(),
          seniority: z.string().nullable(),
          skills: z.array(z.string()),
        })
        .nullable()
        .describe("Null when no resume has been analyzed yet."),
      vault: z
        .array(z.object({ id: z.string(), title: z.string() }))
        .describe("Work-vault card titles and ids. Never their contents."),
      stated: z
        .object({
          targetFunctions: z.array(z.string()),
          preferredLocations: z.array(z.string()),
          dealBreakers: z.array(z.string()),
          coverLettersEnabled: z.boolean().nullable(),
        })
        .nullable(),
      writingPreferences: z
        .object({
          likes: z.array(z.string()),
          dislikes: z.array(z.string()),
        })
        .describe("Comes with `hypotheses`; both live in the same record."),
      hypotheses: z.array(hypothesisSchema),
    }),
    authorization: { mode: "none" },
    anchor: { route: "/profile", target: "profile.about" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Returns resume-derived professional facts, document-vault metadata, person-stated preferences, writing preferences and unconfirmed hypotheses as separate fields. Resume text and document bodies are excluded.",
      readOnlyHint: true,
      openWorldHint: false,
    },
  }),

  defineAction({
    id: "remember_hypothesis",
    kind: "data",
    risk: "cheap",
    title: "Remember a guess about the person",
    description:
      "Write down something you believe about the person but were not told outright — \"seems to be moving from IC to management\". It is stored apart from fact until `confirm_hypothesis` promotes it. Use it when a pattern across a session is worth carrying into the next one. At most twenty stand at once; past that the call is refused until one is confirmed or forgotten. Something they stated plainly is a preference or a profile fact, and recording it as a guess loses its certainty.",
    input: z.object({
      text: z
        .string()
        .min(1)
        .max(240)
        .describe("The belief, in one sentence, phrased as a guess."),
    }),
    output: receiptSchema,
    authorization: { mode: "receipt" },
    anchor: { route: "/profile", target: "profile.about" },
    invalidates: ["me"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Stores an unconfirmed career hypothesis separately from established facts. At most twenty hypotheses may be pending; further writes are refused at that limit. The statement does not change matching preferences or become a confirmed profile fact.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),

  defineAction({
    id: "confirm_hypothesis",
    kind: "data",
    risk: "cheap",
    title: "Confirm a guess",
    description:
      "Promote a stored hypothesis into the career record after the person has agreed with it, and delete the hypothesis. A refusal (\"no on-site roles\") becomes a stated deal-breaker the matcher reads; anything else becomes a work-vault note, which filters nothing, and the receipt names which happened. Requires that they actually answered: your own reasoning is not agreement and neither is silence.",
    input: z.object({
      hypothesisId: z.string(),
    }),
    output: receiptSchema,
    authorization: { mode: "receipt" },
    anchor: { route: "/profile", target: "profile.about" },
    invalidates: ["me"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Promotes a stored hypothesis after the person confirms it, then deletes the hypothesis. A stated refusal becomes a matching deal-breaker; other confirmations become work-vault notes that do not filter matches. The receipt identifies which record changed.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),

  defineAction({
    id: "forget_hypothesis",
    kind: "data",
    risk: "cheap",
    title: "Forget a guess",
    description:
      "Delete a stored belief about the person, because it was wrong or they asked you to drop it. Use it the moment they correct one: a contradicted belief left in memory is how the assistant keeps being wrong the same way. Do NOT delete one they merely qualified — record the corrected version with `remember_hypothesis` first.",
    input: z.object({
      hypothesisId: z.string(),
    }),
    output: receiptSchema,
    authorization: { mode: "receipt" },
    anchor: { route: "/profile", target: "profile.about" },
    invalidates: ["me"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Deletes the specified unconfirmed career hypothesis from the account's stored hypotheses. Existing confirmed career facts and stated preferences are unaffected.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: true,
    },
  }),
  defineAction({
    id: "get_communication_preferences",
    kind: "data",
    risk: "read",
    title: "Read email preferences",
    description:
      "Read which emails this person has asked for: job alerts and how often, Autopilot results as individual mail or a daily digest or off, product updates, and whether every optional email is off. `jobAlertEligibility` is separately whether alerts would actually arrive — a bounced address or an unsubscribe stops mail a setting says is on, and that gap is what \"why am I not getting emails\" is asking about. Account, security, billing and essential employer mail are not in this list. Job preferences are `get_preferences`.",
    input: z.object({}),
    output: z.object({
      jobAlerts: jobAlertsSchema,
      autopilotResults: autopilotResultsSchema,
      productUpdates: z.boolean(),
      allOptionalEmailsOff: z.boolean(),
      autopilotResultsOffAt: z
        .string()
        .nullable()
        .describe("When Autopilot results were last turned off."),
      jobAlertEligibility: jobAlertEligibilitySchema,
    }),
    authorization: { mode: "none" },
    anchor: { route: "/profile", target: "profile.preferences" },
    invalidates: [],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Returns job-alert settings and cadence, Autopilot result-email mode, product-update consent and the all-optional-emails-off state. jobAlertEligibility separately reports delivery restrictions such as bounce or unsubscribe. Account, security, billing and essential employer mail are outside these settings.",
      readOnlyHint: true,
      openWorldHint: false,
    },
  }),

  defineAction({
    id: "update_communication_preferences",
    kind: "data",
    risk: "cheap",
    title: "Change email preferences",
    description:
      "Change which emails this person receives; send only the categories that change. `allOptionalEmailsOff: true` turns all of them off and must travel alone — pairing it with a category is refused rather than reconciled. Turning Autopilot results off stops the routine mail and does NOT stop Autopilot, which keeps applying. Account, security, billing and essential employer messages are unaffected. Read `get_communication_preferences` first, so the receipt can say what the setting actually was.",
    input: z.object({
      jobAlerts: jobAlertsSchema.optional(),
      autopilotResults: autopilotResultsSchema.optional(),
      productUpdates: z.boolean().optional(),
      allOptionalEmailsOff: z
        .literal(true)
        .optional()
        .describe("Turn every optional email off. Send it on its own."),
    }),
    output: receiptSchema,
    authorization: { mode: "receipt", undoWindowMs: 8_000 },
    anchor: { route: "/profile", target: "profile.preferences" },
    invalidates: ["me"],
    event: ASSISTANT_EVENTS.ACTION_COMPLETED,
    mcp: {
      expose: true,
      description:
        "Changes the supplied optional email categories while preserving omitted settings. allOptionalEmailsOff:true must be supplied alone; conflicting category settings are refused. Disabling Autopilot result mail does not stop applications. Account, security, billing and essential employer mail are unaffected.",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  }),
] as const;
