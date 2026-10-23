import { z } from "zod";
import { requestComponent, responseComponent } from "../registry.js";
import {
  accountRoleSchema,
  billingIntervalSchema,
  generationModelKeySchema,
  isoDateTime,
  subscriptionSourceSchema,
  subscriptionTierSchema,
  uuidString,
} from "./common.js";
import { applyNowTrialOfferSchema } from "./billing.js";
import { meProfileSchema } from "./profile.js";

export const onboardingGateSchema = responseComponent(
  z.object({
    required: z.boolean(),
    requiredVersion: z.int(),
    reason: z.enum([
      "rollout_off",
      "outside_canary",
      "missing_completion",
      "version_outdated",
      "profile_incomplete",
      "complete",
    ]),
  }),
  {
    id: "OnboardingGate",
    description:
      "Server-owned onboarding enforcement decision for the current account and rollout cohort.",
  },
);

/** The `user` object inside `GET /users/me`. */
export const meUserSchema = responseComponent(
  z.object({
    id: uuidString,
    email: z.string(),
    fullName: z
      .string()
      .nullable()
      .describe("Canonical display name from the profile; null when blank."),
    nameStatus: z.enum(["pending", "resolved"]),
    agentEmail: z.string().nullable(),
    agentEmailVerified: z.boolean(),
    // subscriptionTier honors an active admin tier preview;
    // actualSubscriptionTier is the stored subscription ignoring preview.
    // (Kept as bare component refs so the generated doc uses $ref.)
    subscriptionTier: subscriptionTierSchema,
    actualSubscriptionTier: subscriptionTierSchema,
    adminPreviewTier: subscriptionTierSchema.nullable(),
    subscriptionSource: subscriptionSourceSchema,
    subscriptionExpires: isoDateTime.nullable(),
    // Cadence of the Stripe subscription granting the stored tier; null for
    // free, for a plan that never went through Stripe, and for rows written
    // before the interval was recorded.
    subscriptionBillingInterval: billingIntervalSchema.nullable(),
    billingRecovery: z.object({
      kind: z.enum(["none", "update_payment", "resume_farcaster"]),
      paidThrough: isoDateTime.nullable(),
    }),
    proHaloSeenVersion: z.int(),
    proHaloCurrentVersion: z.int(),
    role: accountRoleSchema.describe(
      "Account role. `isAdmin` is derived from it (role === \"admin\") and kept for existing readers.",
    ),
    isAdmin: z.boolean(),
    applicationsEnabled: z
      .literal(true)
      .optional()
      .describe(
        "Deprecated: always true. Web bundles built before the Applications queue reached every account read it to choose the queue over the old board.",
      ),
    resumeDocumentEditorEnabled: z.boolean().optional(),
    accountPurpose: z.enum(["customer", "production_canary"]),
    emailUnsubscribed: z.boolean(),
    // Onboarding gate. `onboardingCompletedAt` is null until the wizard's last
    // step is submitted; the client blocks on that rather than inferring
    // completion from whichever profile fields happen to be filled.
    // `onboardingVersion` is what the user finished and
    // `onboardingRequiredVersion` is what the server now requires — a lower
    // stored version re-opens the gate for an existing user.
    onboardingCompletedAt: isoDateTime.nullable(),
    onboardingVersion: z.int(),
    onboardingRequiredVersion: z.int(),
    onboardingGate: onboardingGateSchema,
    // Raw stored choice (null when the user never chose) vs the model that
    // will actually run after tier and monthly-budget resolution.
    preferredGenerationModel: generationModelKeySchema.nullable(),
    effectiveGenerationModel: generationModelKeySchema,
    opusMonthlyCapReached: z.boolean(),
    createdAt: isoDateTime,
    proTrialEligible: z.boolean(),
    // The apply-now paywall trial: 7 free days, then the regular Pro price, one
    // redemption per account. Present only for accounts checkout will honour
    // it for, and only the apply-now gate may show or send it; null everywhere
    // else so no other checkout entry can promise it.
    applyNowTrial: applyNowTrialOfferSchema.nullable(),
  }),
  {
    id: "MeUser",
    description:
      "Authenticated user identity, entitlements, and generation-model resolution for GET /users/me.",
  },
);

export const instantApplyAccessSchema = responseComponent(
  z.object({
    enabled: z.boolean(),
    reason: z.enum(["disabled", "admin_allowance"]).nullable(),
  }),
  {
    id: "InstantApplyAccess",
    description:
      "Whether instant apply is available; reason is \"disabled\" when gated off, \"admin_allowance\" when an admin is enabled while the global switch is off, null when the global switch is on.",
  },
);

export const meCountsSchema = responseComponent(
  z.object({
    jobs: z.int(),
    applications: z.int(),
    recruiterReplied: z.boolean(),
  }),
  {
    id: "MeCounts",
    description:
      "User-scoped totals; recruiterReplied is the sticky has-any-recruiter-ever-replied signal.",
  },
);

export const meExperiencesSchema = responseComponent(
  z.object({
    autopilotFirst: z
      .boolean()
      .describe(
        "The Autopilot-first first week: Applications as the default page, the post-checkout launch sheet, the trial meter, free applications, and apply-after-pack. Set by the `autopilot_first_experience_mode` setting (off, admins, everyone).",
      ),
  }),
  {
    id: "MeExperiences",
    description:
      "Product experiences being ramped for this account. Each key is removed once its experience reaches everyone.",
  },
);

export const meFreeApplicationsSchema = responseComponent(
  z.object({
    limit: z.int(),
    used: z.int(),
    remaining: z.int(),
  }),
  {
    id: "MeFreeApplications",
    description:
      "A free account's lifetime applications in the Autopilot-first experience: sends through Apply that reached the employer or may have; a failure that did not gives its credit back.",
  },
);

export const applyPreferencesSchema = responseComponent(
  z.object({
    reviewBeforeSending: z
      .boolean()
      .describe(
        "When true, Apply saves the job and the person sends it from Applications; when false (the default), Apply sends once the pack is ready.",
      ),
  }),
  { id: "ApplyPreferences", description: "How Apply behaves for this account." },
);

export const applyPreferencesUpdateRequestSchema = requestComponent(
  z.strictObject({ reviewBeforeSending: z.boolean() }),
  {
    id: "ApplyPreferencesUpdateRequest",
    description: "The complete apply preference set; every key is required.",
  },
);
export type ApplyPreferences = z.infer<typeof applyPreferencesSchema>;
export type ApplyPreferencesUpdateRequest = z.infer<
  typeof applyPreferencesUpdateRequestSchema
>;

/** `GET /users/me` 200 body. */
export const meResponseSchema = responseComponent(
  z.object({
    user: meUserSchema,
    instantApply: instantApplyAccessSchema,
    experiences: meExperiencesSchema,
    freeApplications: meFreeApplicationsSchema
      .nullable()
      .describe(
        "Non-null only for a free account in the Autopilot-first experience.",
      ),
    applyPreferences: applyPreferencesSchema,
    recruiterReplyReceived: z.boolean(),
    profile: meProfileSchema.nullable(),
    profileId: uuidString.nullable(),
    counts: meCountsSchema,
  }),
  {
    id: "MeResponse",
    description:
      "Session identity probe: user, entitlement flags, profile, and headline counts.",
  },
);

/** `POST /users/me/onboarding/complete` 409 body. */
export const onboardingIncompleteResponseSchema = responseComponent(
  z.object({
    error: z.literal("onboarding_incomplete"),
    code: z.literal("missing_onboarding_fields"),
    message: z.string(),
    missingFields: z.array(
      z.object({
        field: z.string(),
        label: z.string(),
        profilePath: z.string(),
      }),
    ),
  }),
  {
    id: "OnboardingIncompleteResponse",
    description:
      "Stable missing-field response returned when canonical onboarding data is incomplete.",
  },
);

/** `GET /users/me/application-usage` 200 body. */
export const applicationUsageResponseSchema = responseComponent(
  z.object({
    tier: subscriptionTierSchema,
    saves: z.object({
      limit: z.int().nullable(),
      used: z.int(),
      remaining: z.int().nullable(),
    }),
    manualApplications: z.object({
      limit: z.int().nullable(),
      used: z.int(),
      remaining: z.int().nullable(),
    }),
    resetsAt: isoDateTime,
  }),
  {
    id: "ApplicationUsageResponse",
    description:
      "UTC-day usage for saved jobs and manual application sends in the admin Applications rollout.",
  },
);

/** `GET /users/me/pack-usage` 200 body. */
export const packUsageResponseSchema = responseComponent(
  z.object({
    tier: subscriptionTierSchema,
    limit: z
      .int()
      .nullable()
      .describe("Daily pack allowance; null means unlimited."),
    used: z.int(),
    remaining: z.int().nullable(),
    unlimited: z.boolean(),
    resetsAt: isoDateTime
      .nullable()
      .describe(
        "Absolute instant the daily allowance rolls over; null for unlimited plans.",
      ),
  }),
  {
    id: "PackUsageResponse",
    description:
      "Daily application-pack allowance and today's usage for the signed-in user.",
  },
);

/** `POST /users/me/generation-model` request body. */
export const generationModelUpdateRequestSchema = requestComponent(
  z.object({
    model: generationModelKeySchema,
  }),
  {
    id: "GenerationModelUpdateRequest",
    description:
      "Preferred pack-generation model choice. Unknown body keys are ignored by the server.",
  },
);

/** `POST /users/me/generation-model` 200 body. */
export const generationModelUpdateResponseSchema = responseComponent(
  z.object({
    preferredGenerationModel: generationModelKeySchema,
    effectiveGenerationModel: generationModelKeySchema,
    opusMonthlyCapReached: z.boolean(),
  }),
  {
    id: "GenerationModelUpdateResponse",
    description:
      "Stored preference plus the tier- and budget-resolved model that will actually run.",
  },
);


export const communicationPreferencesResponseSchema = responseComponent(z.object({
  jobAlerts: z.enum(["daily", "twice_weekly", "off"]),
  autopilotResults: z.enum(["individual", "daily_digest", "off"]),
  productUpdates: z.boolean(),
  allOptionalEmailsOff: z.boolean(),
  autopilotResultsOffAt: isoDateTime.nullable(),
  jobAlertEligibility: z.object({
    eligible: z.boolean(),
    reason: z.enum(["eligible", "off", "inactive", "unsubscribed", "address_suppressed", "banned", "retired"]),
    resumesOnActivity: z.boolean(),
  }),
}), { id: "CommunicationPreferences", description: "Saved communication choices and effective job-alert delivery eligibility." });

export const communicationPreferencesUpdateRequestSchema = requestComponent(z.strictObject({
  jobAlerts: z.enum(["daily", "twice_weekly", "off"]).optional(),
  autopilotResults: z.enum(["individual", "daily_digest", "off"]).optional(),
  productUpdates: z.boolean().optional(),
  allOptionalEmailsOff: z.literal(true).optional(),
}).refine((value) => Object.keys(value).length > 0 && (!value.allOptionalEmailsOff || Object.keys(value).length === 1), "Choose a category or turn off all optional emails"), { id: "CommunicationPreferencesUpdateRequest", description: "Updates only the supplied category, or disables every optional email." });
export type CommunicationPreferencesResponse = z.infer<typeof communicationPreferencesResponseSchema>;
export type CommunicationPreferencesUpdateRequest = z.infer<typeof communicationPreferencesUpdateRequestSchema>;

export const productActivityRequestSchema = requestComponent(z.strictObject({ event: z.enum(["visit", "interaction"]) }), { id: "ProductActivityRequest", description: "A foreground visit or deliberate product interaction; the server records its own timestamp." });
