import { z } from "zod";
import {
  requestComponent,
  responseComponent,
  sharedComponent,
} from "../registry.js";
import { freeformJsonObject, isoDateTime, uuidString } from "./common.js";

const LEGACY_AUTHORIZATION_BASES = [
  "citizen",
  "permanent_resident",
  "asylee_or_refugee",
  "temporary_work_auth",
  "not_authorized",
] as const;

/** Bases that authorize work without any employer sponsorship. */
const LEGACY_UNSPONSORED_AUTHORIZATION_BASES: readonly string[] = [
  "citizen",
  "permanent_resident",
  "asylee_or_refugee",
];

const EXPANDED_AUTHORIZATION_BASES = [
  "citizen",
  "permanent_resident",
  "eu_freedom_of_movement",
  "asylee_or_refugee",
  "temporary_work_auth",
  "not_authorized",
] as const;

const EXPANDED_UNSPONSORED_AUTHORIZATION_BASES: readonly string[] = [
  ...LEGACY_UNSPONSORED_AUTHORIZATION_BASES,
  "eu_freedom_of_movement",
];

/**
 * The generic profile response is a published legacy contract. Expanded
 * application answers have a dedicated endpoint and a larger limit.
 */
const MAX_LEGACY_ELIGIBILITY_COUNTRIES = 20;
const MAX_EXPANDED_ELIGIBILITY_COUNTRIES = 40;
const SPONSORSHIP_TIMINGS = ["now", "future", "now_and_future"] as const;
const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
const EDUCATION_LEVELS = [
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
] as const;
const LANGUAGE_PROFICIENCIES = [
  "basic",
  "conversational",
  "professional",
  "fluent",
  "native_or_bilingual",
] as const;
const APPLICATION_SCREENING_FACT_KEYS = [
  "reliableTransportation",
  "workplaceAccommodation",
  "securityClearance",
  "foreignGovernmentFamilyTies",
  "criminalHistory",
  "governmentOrMilitaryEmployment",
  "clearanceEligibleToObtain",
  "attestationConsent",
  "backgroundCheckConsent",
  "pendingCriminalCharges",
  "fugitiveFromJustice",
  "subjectToRestrainingOrder",
  "unlawfulControlledSubstanceUse",
  "adjudicatedMentalIncompetenceOrCommitted",
  "dishonorablyDischarged",
  "registeredSexOffender",
  "canPerformEssentialFunctions",
  "drugScreenConsent",
  "preEmploymentMedicalExamConsent",
  "medicalHistoryDisclosure",
  "restrictedPartyStatus",
  "exportLicenseRequirement",
  "sanctionedRegionResidence",
] as const;
const EXPANDED_COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ",
  "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ",
  "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR",
  "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY",
  "HK", "HM", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT",
  "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM",
  "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ",
  "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
  "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "XK", "YE", "YT", "ZA", "ZM", "ZW",
] as const;

const eligibilityCountrySchema = z
  .object({
    code: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .describe("ISO-3166-1 alpha-2 country code"),
    authorized: z.boolean(),
    requiresSponsorship: z.boolean(),
    basis: z.enum(LEGACY_AUTHORIZATION_BASES),
  })
  .strict()
  .superRefine((answer, context) => {
    if (answer.authorized !== (answer.basis !== "not_authorized")) {
      context.addIssue({
        code: "custom",
        path: ["authorized"],
        message: "Authorization answer contradicts its basis",
      });
    }
    if (
      answer.requiresSponsorship &&
      LEGACY_UNSPONSORED_AUTHORIZATION_BASES.includes(answer.basis)
    ) {
      context.addIssue({
        code: "custom",
        path: ["requiresSponsorship"],
        message: "This authorization basis cannot require employer sponsorship",
      });
    }
  });

const applicationProfileWireSchema = z
  .object({
    eligibility: z
      .object({
        countries: z
          .array(eligibilityCountrySchema)
          .max(MAX_LEGACY_ELIGIBILITY_COUNTRIES)
          .superRefine((countries, context) => {
            const seen = new Set<string>();
            countries.forEach((country, index) => {
              if (seen.has(country.code)) {
                context.addIssue({
                  code: "custom",
                  path: [index, "code"],
                  message: `Duplicate eligibility answer for ${country.code}`,
                });
              }
              seen.add(country.code);
            });
          }),
      })
      .strict(),
  })
  .strict();

/** Eligibility-only application profile returned inside preferences JSON. */
export const applicationProfileSchema = responseComponent(
  applicationProfileWireSchema,
  {
    id: "ApplicationProfile",
    description:
      "User-confirmed, country-specific work authorization and sponsorship answers used by onboarding and application adapters.",
  },
);

const expandedCountryCodeSchema = z.enum(
  EXPANDED_COUNTRY_CODES,
);
const expandedCurrencyCodes = new Set(Intl.supportedValuesOf("currency"));
const expandedLocalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Expected a real calendar date");

function addExpandedDuplicateIssues(
  values: string[],
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({
        code: "custom",
        path: [index],
        message: `Duplicate value: ${value}`,
      });
    }
    seen.add(value);
  });
}

const expandedEligibilityCountrySchema = z
  .object({
    code: expandedCountryCodeSchema,
    authorized: z.boolean(),
    requiresSponsorship: z.boolean(),
    basis: z.enum(EXPANDED_AUTHORIZATION_BASES),
    sponsorshipTiming: z.enum(SPONSORSHIP_TIMINGS).optional(),
    authorizationType: z.string().min(1).max(100).optional(),
    authorizationExpiresOn: expandedLocalDateSchema.optional(),
  })
  .strict()
  .superRefine((answer, context) => {
    if (answer.authorized !== (answer.basis !== "not_authorized")) {
      context.addIssue({
        code: "custom",
        path: ["authorized"],
        message: "Authorization answer contradicts its basis",
      });
    }
    if (
      answer.requiresSponsorship &&
      EXPANDED_UNSPONSORED_AUTHORIZATION_BASES.includes(answer.basis)
    ) {
      context.addIssue({
        code: "custom",
        path: ["requiresSponsorship"],
        message: "This authorization basis cannot require employer sponsorship",
      });
    }
    if (answer.sponsorshipTiming && !answer.requiresSponsorship) {
      context.addIssue({
        code: "custom",
        path: ["sponsorshipTiming"],
        message: "Sponsorship timing requires sponsorship",
      });
    }
    if (
      (answer.authorizationType || answer.authorizationExpiresOn) &&
      answer.basis !== "temporary_work_auth"
    ) {
      context.addIssue({
        code: "custom",
        path: ["authorizationType"],
        message: "Authorization details require temporary work authorization",
      });
    }
  });

const expandedCountriesSchema = z
  .array(expandedEligibilityCountrySchema)
  .max(MAX_EXPANDED_ELIGIBILITY_COUNTRIES)
  .superRefine((countries, context) =>
    addExpandedDuplicateIssues(
      countries.map(({ code }) => code),
      context,
    ),
  );
const expandedCitizenshipsSchema = z
  .array(expandedCountryCodeSchema)
  .max(10)
  .superRefine(addExpandedDuplicateIssues);
const expandedEligibilityObjectSchema = z
  .object({
    citizenshipCountryCodes: expandedCitizenshipsSchema.optional(),
    countries: expandedCountriesSchema,
  })
  .strict();
const expandedEligibilitySchema = expandedEligibilityObjectSchema.superRefine(
  (eligibility, context) => {
    if (!eligibility.citizenshipCountryCodes) return;
    const citizenships = new Set(eligibility.citizenshipCountryCodes);
    eligibility.countries.forEach((country, index) => {
      if (country.basis === "citizen" && !citizenships.has(country.code)) {
        context.addIssue({
          code: "custom",
          path: ["countries", index, "basis"],
          message: "Citizen basis must match an explicit citizenship country",
        });
      }
      if (citizenships.has(country.code) && country.basis !== "citizen") {
        context.addIssue({
          code: "custom",
          path: ["countries", index, "basis"],
          message: "Explicit citizenship must use citizen basis for the same country",
        });
      }
    });
  },
);
const expandedEligibilityPatchSchema = z
  .object({
    citizenshipCountryCodes: expandedCitizenshipsSchema.optional(),
    countries: expandedCountriesSchema.optional(),
  })
  .strict()
  // Both halves in one patch replace the stored pair wholesale, so the
  // citizenship/basis contradiction is rejectable at the request boundary
  // (mirrors the API's eligibilityPatchSchema).
  .superRefine((patch, context) => {
    if (!patch.citizenshipCountryCodes || !patch.countries) return;
    const citizenships = new Set(patch.citizenshipCountryCodes);
    patch.countries.forEach((country, index) => {
      if (country.basis === "citizen" && !citizenships.has(country.code)) {
        context.addIssue({
          code: "custom",
          path: ["countries", index, "basis"],
          message: "Citizen basis must match an explicit citizenship country",
        });
      }
      if (citizenships.has(country.code) && country.basis !== "citizen") {
        context.addIssue({
          code: "custom",
          path: ["countries", index, "basis"],
          message: "Explicit citizenship must use citizen basis for the same country",
        });
      }
    });
  });

const expandedStructuredPlaceSchema = sharedComponent(
  z.object({
    label: z.string().trim().min(1).max(160),
    city: z.string().trim().min(1).max(120).nullable(),
    region: z.string().trim().min(1).max(120).nullable(),
    regionCode: z.string().trim().min(1).max(12).nullable(),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
    source: z.enum(["google_places", "gazetteer"]),
    placeId: z.string().trim().min(1).max(256).nullable().optional(),
    resolverVersion: z.string().trim().min(1).max(64).nullable().optional(),
  }).strict(),
  {
    id: "StructuredPlace",
    description: "Resolved city, region, and country metadata for a preferred work location.",
  },
);

const expandedWorkPreferencesSchema = z
  .object({
    targetFunctions: z
      .array(z.string().trim().min(1).max(120))
      .max(3)
      .superRefine(addExpandedDuplicateIssues)
      .optional(),
    preferredLocations: z
      .array(z.string().trim().min(1).max(120))
      .max(5)
      .superRefine(addExpandedDuplicateIssues)
      .optional(),
    preferredPlaces: z.array(expandedStructuredPlaceSchema).max(5).optional(),
    acceptedWorkModes: z
      .array(z.enum(WORK_MODES))
      .min(1)
      .max(WORK_MODES.length)
      .superRefine(addExpandedDuplicateIssues),
    willingToRelocate: z.boolean(),
    maxTravelPercent: z.number().int().min(0).max(100).optional(),
  })
  .strict();
const expandedAvailabilitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("immediate") }).strict(),
  z
    .object({
      kind: z.literal("specific_date"),
      date: expandedLocalDateSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("notice_period"),
      noticePeriodDays: z.number().int().min(1).max(365),
    })
    .strict(),
]);
const expandedCompensationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("open") }).strict(),
  z
    .object({
      kind: z.literal("minimum"),
      minimumAmount: z.number().positive().max(100_000_000),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .refine((value) => expandedCurrencyCodes.has(value)),
      period: z.enum(["hour", "year"]),
    })
    .strict(),
]);
// Mirrors @jobless/shared/src/salary-bounds; the response schema above stays
// tolerant so a stored value never breaks a read.
const expandedCompensationInputSchema = expandedCompensationSchema.refine(
  (value) => value.kind !== "minimum" || value.currency !== "USD" || value.period !== "year"
    || (value.minimumAmount >= 10_000 && value.minimumAmount <= 1_000_000),
  { message: "An annual USD minimum must be between $10,000 and $1,000,000", path: ["minimumAmount"] },
).describe("An annual USD minimum must be between 10,000 and 1,000,000.");
const expandedQualificationsSchema = z
  .object({
    highestEducationLevel: z.enum(EDUCATION_LEVELS).optional(),
    languages: z
      .array(
        z
          .object({
            code: z
              .string()
              .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/),
            proficiency: z.enum(LANGUAGE_PROFICIENCIES),
          })
          .strict(),
      )
      .max(20)
      .superRefine((languages, context) =>
        addExpandedDuplicateIssues(
          languages.map(({ code }) => code.toLowerCase()),
          context,
        ),
      )
      .optional(),
  })
  .strict();

const expandedScreeningAnswersSchema = z
  .object({
    reliableTransportation: z.boolean().optional(),
    workplaceAccommodation: z
      .enum(["yes", "no", "prefer_not_to_answer"])
      .optional(),
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
    criminalHistoryDetails: z.string().min(1).max(1000).optional(),
    governmentOrMilitaryEmployment: z.boolean().optional(),
    clearanceEligibleToObtain: z.enum(["yes", "no", "not_sure"]).optional(),
    backgroundCheckConsent: z.boolean().optional(),
    pendingCriminalCharges: z.boolean().optional(),
    fugitiveFromJustice: z.boolean().optional(),
    subjectToRestrainingOrder: z.boolean().optional(),
    unlawfulControlledSubstanceUse: z.boolean().optional(),
    adjudicatedMentalIncompetenceOrCommitted: z.boolean().optional(),
    dishonorablyDischarged: z.boolean().optional(),
    registeredSexOffender: z.boolean().optional(),
    canPerformEssentialFunctions: z.enum(["yes", "no", "not_sure"]).optional(),
    drugScreenConsent: z.boolean().optional(),
    preEmploymentMedicalExamConsent: z.boolean().optional(),
    medicalHistoryDisclosure: z
      .enum(["yes", "no", "prefer_not_to_answer"])
      .optional(),
    restrictedPartyStatus: z
      .enum(["listed", "not_listed", "not_sure"])
      .optional(),
    exportLicenseRequirement: z
      .enum(["required", "not_required", "not_sure"])
      .optional(),
    sanctionedRegionResidence: z.enum(["yes", "no", "not_sure"]).optional(),
    attestationConsent: z.boolean().optional(),
    attestationConsentAt: z.string().min(1).max(40).optional(),
    userConfirmedScreeningFields: z
      .array(z.enum(APPLICATION_SCREENING_FACT_KEYS))
      .max(APPLICATION_SCREENING_FACT_KEYS.length)
      .refine((values) => new Set(values).size === values.length)
      .optional(),
    screeningAnswerDetails: z
      .partialRecord(
        z.enum(APPLICATION_SCREENING_FACT_KEYS),
        z.string().trim().min(1).max(1000),
      )
      .optional(),
    confirmedVersion: z.number().int().min(1).max(1000).optional(),
  })
  .strict()
  .superRefine((answers, context) => {
    if (answers.attestationConsentAt && answers.attestationConsent === undefined) {
      context.addIssue({
        code: "custom",
        path: ["attestationConsentAt"],
        message: "A consent timestamp requires the consent answer",
      });
    }
    if (answers.criminalHistoryDetails && answers.criminalHistory !== "yes") {
      context.addIssue({
        code: "custom",
        path: ["criminalHistoryDetails"],
        message: "Details apply only to a yes answer",
      });
    }
  });

export const expandedApplicationProfileSchema = sharedComponent(
  z
    .object({
      eligibility: expandedEligibilitySchema,
      workPreferences: expandedWorkPreferencesSchema.optional(),
      availability: expandedAvailabilitySchema.optional(),
      compensation: expandedCompensationSchema.optional(),
      qualifications: expandedQualificationsSchema.optional(),
      screeningAnswers: expandedScreeningAnswersSchema.optional(),
    })
    .strict(),
  {
    id: "ExpandedApplicationProfile",
    description:
      "Canonical application answers, including application-scoped screening facts. Voluntary self-identification is stored separately.",
  },
);

export const applicationAnswersResponseSchema = responseComponent(
  z.object({
    profileIdentityVersion: z.number().int().positive(),
    applicationProfile: expandedApplicationProfileSchema.nullable(),
    education: z.object({
      value: z.enum(EDUCATION_LEVELS),
      source: z.enum(['saved', 'resume', 'default']),
    }).nullable().optional(),
  }),
  {
    id: "ApplicationAnswersResponse",
    description: "Expanded canonical application answers for the user.",
  },
);

export const applicationAnswersPatchRequestSchema = requestComponent(
  z
    .object({
      expectedProfileIdentityVersion: z.number().int().positive(),
      expectedApplicationProfile: expandedApplicationProfileSchema.nullable().optional(),
      expectedQualifications: expandedQualificationsSchema.nullable().optional(),
      applicationProfile: z
        .object({
          eligibility: expandedEligibilityPatchSchema.optional(),
          workPreferences: expandedWorkPreferencesSchema.nullable().optional(),
          availability: expandedAvailabilitySchema.nullable().optional(),
          compensation: expandedCompensationInputSchema.nullable().optional(),
          qualifications: expandedQualificationsSchema.nullable().optional(),
          screeningAnswers: expandedScreeningAnswersSchema.nullable().optional(),
        })
        .strict(),
    })
    .strict(),
  {
    id: "ApplicationAnswersPatchRequest",
    description:
      "Partial canonical-answer update. New groups replace atomically and null clears; eligibility retains nested partial compatibility.",
  },
);

export const profileRevisionConflictResponseSchema = responseComponent(
  z.object({ error: z.string(), code: z.string() }),
  {
    id: "ProfileRevisionConflictResponse",
    description:
      "Profile revision or identity-reset conflict with a stable machine-readable code.",
  },
);

const usRaceCategories = [
  "american_indian_or_alaska_native",
  "asian",
  "black_or_african_american",
  "native_hawaiian_or_other_pacific_islander",
  "white",
  "middle_eastern_or_north_african",
  "another_race",
] as const;
const usProtectedVeteranCategories = [
  "disabled_veteran",
  "recently_separated_veteran",
  "active_duty_wartime_or_campaign_badge_veteran",
  "armed_forces_service_medal_veteran",
] as const;
function uniqueSelfIdArray<T extends readonly [string, ...string[]]>(values: T) {
  return z
    .array(z.enum(values))
    .min(1)
    .max(values.length)
    .superRefine(addExpandedDuplicateIssues);
}

export const usVoluntarySelfIdentificationSchema = sharedComponent(
  z
    .object({
      gender: z
        .enum(["female", "male", "non_binary", "another_identity", "decline"])
        .optional(),
      hispanicOrLatino: z.enum(["yes", "no", "decline"]).optional(),
      race: z
        .discriminatedUnion("response", [
          z.object({ response: z.literal("decline") }).strict(),
          z
            .object({
              response: z.literal("provided"),
              values: uniqueSelfIdArray(usRaceCategories),
            })
            .strict(),
        ])
        .optional(),
      veteranStatus: z
        .discriminatedUnion("status", [
          z
            .object({
              status: z.literal("protected_veteran"),
              categories: uniqueSelfIdArray(
                usProtectedVeteranCategories,
              ).optional(),
            })
            .strict(),
          z.object({ status: z.literal("veteran_not_protected") }).strict(),
          z.object({ status: z.literal("not_a_veteran") }).strict(),
          z.object({ status: z.literal("decline") }).strict(),
        ])
        .optional(),
      disabilityStatus: z.enum(["yes", "no", "decline"]).optional(),
    })
    .strict()
    .refine((answers) => Object.keys(answers).length > 0),
  {
    id: "UsVoluntarySelfIdentification",
    description:
      "Strict nonempty US voluntary self-identification answer document.",
  },
);

const usSelfIdentificationRecordSchema = z.object({
  answers: usVoluntarySelfIdentificationSchema,
  noticeVersion: z.string().min(1),
  revision: z.number().int().positive(),
  confirmedAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const usSelfIdentificationResponseSchema = responseComponent(
  z.object({
    jurisdiction: z.literal("US"),
    noticeVersion: z.literal("us-eeo-v1"),
    profileIdentityVersion: z.number().int().positive(),
    selfIdentification: usSelfIdentificationRecordSchema.nullable(),
  }),
  {
    id: "UsSelfIdentificationResponse",
    description:
      "Restricted US voluntary self-identification record and current notice version.",
  },
);

export const usSelfIdentificationPutRequestSchema = requestComponent(
  z
    .object({
      expectedProfileIdentityVersion: z.number().int().positive(),
      noticeVersion: z.literal("us-eeo-v1"),
      expectedRevision: z.number().int().min(0),
      answers: usVoluntarySelfIdentificationSchema,
    })
    .strict(),
  {
    id: "UsSelfIdentificationPutRequest",
    description:
      "Whole-document US voluntary self-identification replacement with optimistic revision matching.",
  },
);

export const usSelfIdentificationDeleteRequestSchema = requestComponent(
  z
    .object({
      expectedProfileIdentityVersion: z.number().int().positive(),
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
  {
    id: "UsSelfIdentificationDeleteRequest",
    description:
      "Delete the restricted US self-identification row at an exact revision.",
  },
);

/**
 * Structured mailing address stored inside profile preferences (written by the
 * Google Places resolution flow).
 */
export const mailingAddressSchema = responseComponent(
  z
    .looseObject({
      line1: z.string(),
      line2: z.string().optional(),
      city: z.string(),
      region: z.string(),
      regionCode: z.string().optional(),
      postalCode: z.string(),
      country: z.string(),
      formatted: z.string().optional(),
      source: z.string().optional(),
      updatedAt: z.string().optional(),
    })
    .nullable(),
  {
    id: "MailingAddress",
    description:
      "Structured mailing address captured from address autocomplete; null when cleared.",
  },
);

/**
 * Profile preferences JSON. The stored blob is open-ended (feature flags and
 * user preference keys accrete here), so unknown keys are expected; the listed
 * keys are the stable, documented core. Internal keys prefixed with `_` are
 * stripped at the response boundary.
 */
export const profilePreferencesSchema = responseComponent(
  z.looseObject({
    roles: z.array(z.string()).optional(),
    // Nullable, not merely optional: PUT /profile accepts `z.number().nullish()`
    // (profile.ts:155) because the editor sends null to CLEAR the salary field,
    // and GET /profile returns that null verbatim. A read schema must tolerate
    // every state the write path can store — otherwise MCP fails closed on a
    // profile that saved successfully.
    salaryMin: z.number().nullable().optional(),
    salaryMax: z.number().nullable().optional(),
    /**
     * Where the user LIVES, as free text — resume-seeded and collected by the
     * profile-completion gate. Not where they want to work: that is
     * `applicationProfile.workPreferences.preferredLocations`, and no matching
     * surface reads this key.
     */
    locations: z.array(z.string()).optional(),
    /**
     * @deprecated Frozen legacy projection of the confirmed work preferences.
     * Nothing writes it: the application-answers store stopped mirroring it in
     * PON-3833, and `PUT`/`POST /profile` reject both keys with 400. Clients
     * read a stated location from `applicationProfile.workPreferences` and
     * fall back here only for a profile that carries no `applicationProfile`
     * at all — 1,866 profiles on 2026-09-08. The keys go when that reaches
     * zero; see `docs/LOCATION_ARCHITECTURE.md`.
     */
    preferredLocations: z.array(z.string()).optional(),
    /** @deprecated Structured companions of the frozen projection above. */
    preferredPlaces: z.array(expandedStructuredPlaceSchema).optional(),
    /**
     * @deprecated The other four keys of the same frozen projection, derived
     * on read from `applicationProfile.workPreferences` for a profile that has
     * a document. `remotePreference` is the single-mode shorthand for
     * `acceptedWorkModes`, never a separate answer. They leave with the two
     * above.
     */
    functions: z.array(z.string()).optional(),
    /** @deprecated See `functions`. */
    acceptedWorkModes: z.array(z.enum(["remote", "hybrid", "onsite"])).optional(),
    /** @deprecated See `functions`. */
    willingToRelocate: z.boolean().optional(),
    /** @deprecated See `functions`. */
    remotePreference: z.enum(["REMOTE", "ONSITE"]).nullable().optional(),
    remote: z.boolean().optional(),
    dealBreakers: z.array(z.string()).optional(),
    address: z.string().optional(),
    mailingAddress: mailingAddressSchema.optional(),
    applicationProfile: applicationProfileSchema.optional(),
    // Absent means enabled. Only an explicit false turns cover-letter
    // generation and every automated cover-letter use off — see
    // coverLettersEnabledFromPreferences in apps/api.
    coverLettersEnabled: z.boolean().optional(),
  }),
  {
    id: "ProfilePreferences",
    description:
      "Open-ended job-preferences JSON; documented keys are stable, unknown keys are allowed and expected.",
  },
);

/**
 * The `profile` object embedded in `GET /users/me` (subset selected by
 * getProfileForUser, internal preference keys stripped).
 */
export const meProfileSchema = responseComponent(
  z.object({
    id: uuidString,
    name: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
    phoneDialCode: z.string().nullable(),
    resumeText: z.string().nullable(),
    resumeUrl: z.string().nullable(),
    preferences: profilePreferencesSchema.nullable(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  }),
  {
    id: "MeProfile",
    description:
      "Profile subset embedded in GET /users/me: identity/contact fields plus client-safe preferences.",
  },
);

/** Physical `user_profiles` projection before derived response metadata. */
export const profileProjectionSchema = z.object({
  id: uuidString,
  userId: uuidString,
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  phoneDialCode: z.string().nullable(),
  resumeText: z.string().nullable(),
  resumeUrl: z.string().nullable(),
  profileIdentityVersion: z.number().int().positive(),
  preferences: profilePreferencesSchema.nullable(),
  tonePreferences: z.string().nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

/**
 * Full `user_profiles` row as returned by `GET /profile` (internal preference
 * keys stripped at the boundary), plus derived client-safe metadata.
 */
export const profileRecordSchema = responseComponent(
  profileProjectionSchema.extend({
    /** Derived from internal name provenance; not a user_profiles column. */
    nameStatus: z.enum(["pending", "resolved"]),
    /** Country to preselect for a missing mailing address: the person's explicit location, else the current resume's parsed residence. */
    mailingCountryHint: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
  }),
  {
    id: "ProfileRecord",
    description:
      "Full user_profiles row (client-safe preferences) as returned by GET /profile.",
  },
);

/** `GET /profile` default-view 200 body. */
export const profileResponseSchema = responseComponent(
  z.object({
    profile: profileRecordSchema,
    prefsVerifyPending: z.boolean(),
  }),
  {
    id: "ProfileResponse",
    description:
      "Current profile plus the re-verify nudge flag set when the default resume changed.",
  },
);

/** `GET /profile?view=analysis_status` 200 body. */
export const profileAnalysisStatusResponseSchema = responseComponent(
  z.object({
    profileId: uuidString,
    // `stale`: a stored analysis whose resumeFingerprint does not match
    // the current resume text -- the state an analysis failure leaves
    // behind. The blob still ships; the durable backstop is enqueued
    // server-side.
    status: z.enum(["ready", "pending", "stale"]),
    analysis: freeformJsonObject.nullable(),
  }),
  {
    id: "ProfileAnalysisStatusResponse",
    description:
      "Passive resume-analysis status view: durable analysis JSON when ready, null while pending.",
  },
);

/**
 * `GET /profile/analysis` 200 body.
 *
 * `analysis` is the durable resume-analysis JSON. It is nullable on the wire:
 * the cached branch returns the stored `_analysis` object, but the
 * freshly-analyzed branch returns `analyzeResume`'s result verbatim and that
 * function returns null when it cannot analyze the stored resume. The analysis
 * value space itself is deliberately open — it is an evolving LLM output, not
 * a stable wire domain.
 */
export const profileAnalysisResponseSchema = responseComponent(
  z.object({
    analysis: freeformJsonObject.nullable(),
    /**
     * The confirmed `workPreferences.preferredLocations`, `preferredPlaces`
     * and `targetFunctions`, resolved server-side so a client needs no second
     * fetch and no fallback rule of its own.
     */
    preferredLocations: z.array(z.string()),
    preferredPlaces: z.array(expandedStructuredPlaceSchema),
    preferredFunctions: z.array(z.string()),
    cached: z.boolean(),
  }),
  {
    id: "ProfileAnalysisResponse",
    description:
      "Cached or freshly computed resume analysis plus the user's stated location and function preferences.",
  },
);

/**
 * `GET /profile` 200 body: default full-profile view, or the narrow
 * analysis-status view when `view=analysis_status` is passed.
 */
export const profileGetResponseSchema = responseComponent(
  z.union([profileResponseSchema, profileAnalysisStatusResponseSchema]),
  {
    id: "ProfileGetResponse",
    description:
      "GET /profile payload: ProfileResponse by default, ProfileAnalysisStatusResponse for view=analysis_status.",
  },
);

/** `GET /profile` query parameters. */
export const profileQuery = {
  view: z
    .enum(["analysis_status"])
    .describe(
      "Optional narrow view selector; omit for the legacy full profile response.",
    ),
};
