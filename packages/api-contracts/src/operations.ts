import { listingStatsSchema, publicStatsSchema } from "./schemas/listing-stats.js";
import {
  applicationMaterialsResponseSchema,
  applicationMaterialsUpdateRequestSchema,
  applicationResumeVariantSchema,
  resumeDocumentSeedSchema,
} from "./schemas/application-materials.js";
import { applicationTimelineResponseSchema } from "./schemas/application-timeline.js";
import {
  assistantHypothesisConfirmResponseSchema,
  assistantHypothesisCreateRequestSchema,
  assistantHypothesisCreateResponseSchema,
  assistantHypothesisForgetResponseSchema,
  assistantMemoryResponseSchema,
} from "./schemas/assistant-memory.js";
import { z } from "zod";
import {
  billingCheckoutRequestSchema,
  billingCheckoutResponseSchema,
  billingCheckoutErrorSchema,
  billingDreamerUpgradeErrorSchema,
  billingDreamerUpgradePreviewSchema,
  billingDreamerUpgradeRequestSchema,
  billingDreamerUpgradeResponseSchema,
  billingPromoPreviewQuery,
  billingPromoPreviewSchema,
} from "./schemas/billing.js";
import type { OperationDescriptor, OperationResponse } from "./operation.js";
import {
  codedErrorResponseSchema,
  errorResponseSchema,
  validationErrorResponseSchema,
  uuidString,
} from "./schemas/common.js";
import {
  filteredMailDetailResponseSchema,
  filteredMailListResponseSchema,
  filteredMailShowRequestSchema,
} from "./schemas/filtered-mail.js";
import {
  jobListResponseSchema,
  jobResponseSchema,
  listJobsQuery,
  prepareJobResponseSchema,
} from "./schemas/jobs.js";
import {
  listListingsQuery,
  listingsPageResponseSchema,
  recommendedListingsQuery,
  recommendedListingsResponseSchema,
} from "./schemas/listings.js";
import {
  pipelineErrorResponseSchema,
  pipelineQuery,
  pipelineResponseSchema,
} from "./schemas/pipeline.js";
import {
  applicationAnswersPatchRequestSchema,
  applicationAnswersResponseSchema,
  profileAnalysisResponseSchema,
  profileRevisionConflictResponseSchema,
  profileGetResponseSchema,
  profileQuery,
  usSelfIdentificationDeleteRequestSchema,
  usSelfIdentificationPutRequestSchema,
  usSelfIdentificationResponseSchema,
} from "./schemas/profile.js";
import { statsResponseSchema } from "./schemas/stats.js";
import {
  communicationPreferencesResponseSchema,
  communicationPreferencesUpdateRequestSchema,
  productActivityRequestSchema,
  applicationUsageResponseSchema,
  generationModelUpdateRequestSchema,
  generationModelUpdateResponseSchema,
  meResponseSchema,
  onboardingIncompleteResponseSchema,
  packUsageResponseSchema,
} from "./schemas/users.js";

const unauthorized: OperationResponse = {
  description: "Missing or invalid session.",
  schema: errorResponseSchema,
};

/**
 * The typed-contract operation registry. Covers the PON-3393 canary set (six
 * schema-stable, high-traffic user-session reads) plus the two PON-3395
 * starter operations (pack usage read, generation-model write).
 *
 * Kept sorted by (path, method); `assertRegistryInvariants` in the generator
 * enforces ordering and operationId uniqueness.
 */
export const operations: readonly OperationDescriptor[] = [
  {
    operationId: "updateApplicationMaterials",
    method: "patch",
    path: "/applications/{id}/materials",
    fastifyPath: "/applications/:id/materials",
    summary: "Persist one application's selected resume and cover letter",
    description:
      "Admin Applications editor. Uses an optimistic revision and stores resume edits only on the application; it never changes the profile resume.",
    tags: ["applications"],
    auth: "user-session",
    contractMaturity: "documented",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Owned application id.",
        schema: uuidString,
      },
    ],
    requestBody: {
      description: "Expected revision and the per-job material fields to edit.",
      contentType: "application/json",
      required: true,
      schema: applicationMaterialsUpdateRequestSchema,
    },
    responses: {
      "200": {
        description: "Updated persisted material revision.",
        schema: applicationMaterialsResponseSchema,
      },
      "400": {
        description: "Body validation failed.",
        schema: validationErrorResponseSchema,
      },
      "401": unauthorized,
      "403": {
        description: "The Applications editor is restricted to administrators.",
        schema: errorResponseSchema,
      },
      "404": {
        description: "Application was not found for this owner.",
        schema: errorResponseSchema,
      },
      "409": {
        description:
          "Revision changed, materials are locked for sending, or the selected resume is unavailable.",
        schema: errorResponseSchema,
      },
    },
  },
  {
    operationId: "reopenApplicationMaterials",
    method: "post",
    path: "/applications/{id}/materials/reopen",
    fastifyPath: "/applications/:id/materials/reopen",
    summary: "Open a proven-safe failed application's materials for retry",
    description:
      "Admin Applications editor. Adopts legacy materials or unlocks an exact frozen revision only after durable submission-safety and queue-ownership checks.",
    tags: ["applications"],
    auth: "user-session",
    contractMaturity: "documented",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Owned failed application id.",
        schema: uuidString,
      },
    ],
    responses: {
      "200": {
        description: "New editable material revision.",
        schema: applicationMaterialsResponseSchema,
      },
      "400": {
        description: "Application id or body validation failed.",
        schema: validationErrorResponseSchema,
      },
      "401": unauthorized,
      "403": {
        description: "The Applications editor is restricted to administrators.",
        schema: errorResponseSchema,
      },
      "404": {
        description: "Application was not found for this owner.",
        schema: errorResponseSchema,
      },
      "409": {
        description:
          "The attempt is not proven safe to retry or its material/submission state changed.",
        schema: errorResponseSchema,
      },
    },
  },
  {
    operationId: "getApplicationResumeDocument",
    method: "get",
    path: "/applications/{id}/resume/document",
    fastifyPath: "/applications/:id/resume/document",
    summary: "Seed for the page-faithful resume editor",
    description:
      "The stored tailored resume with the PDF parser's per-line kinds and layout roles, so the editor can show each line as the PDF will draw it. Read-only.",
    tags: ["applications"],
    auth: "user-session",
    contractMaturity: "documented",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Owned application id.",
        schema: uuidString,
      },
      {
        name: "variant",
        in: "query",
        required: false,
        description:
          "Which per-job resume to seed from, resolved through the application's materials the way the station shows them. Omitted: the latest tailored resume row, which is what the pack editor edits.",
        schema: applicationResumeVariantSchema,
      },
    ],
    responses: {
      "200": {
        description: "Resume text, per-line kinds and roles, and the stored overlay if any.",
        schema: resumeDocumentSeedSchema,
      },
      "401": unauthorized,
      "404": {
        description: "Application or its tailored resume was not found for this owner.",
        schema: errorResponseSchema,
      },
    },
  },
  {
    operationId: "getApplicationTimeline",
    method: "get",
    path: "/applications/{id}/timeline",
    fastifyPath: "/applications/:id/timeline",
    summary: "Read one application's truthful status timeline",
    description:
      "Ordered facts for a single owned application, each backed by a stored row: apply/submission columns, user-facing inbound mail, the interview row, and escalations. `submitted` reads the status vocabulary and `received` reads employer_confirmed_at; neither is inferred from the other. The coverage block states how far the read could see.",
    tags: ["applications"],
    auth: "user-session",
    contractMaturity: "consumer-adopted",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Owned application id.",
        schema: uuidString,
      },
    ],
    responses: {
      "200": {
        description: "The application's ordered events and coverage.",
        schema: applicationTimelineResponseSchema,
      },
      "401": unauthorized,
      "404": {
        description:
          "No application with that id is owned by the caller. Unknown, non-owned and malformed ids are indistinguishable.",
        schema: errorResponseSchema,
      },
    },
  },
  {
    operationId: "createBillingCheckout",
    method: "post",
    path: "/billing/checkout",
    fastifyPath: "/billing/checkout",
    summary: "Open or safely replace a subscription checkout",
    tags: ["billing"],
    auth: "user-session",
    contractMaturity: "consumer-adopted",
    requestBody: {
      description:
        "Subscription terms and optional explicit replacement of the expected owned session.",
      contentType: "application/json",
      required: true,
      schema: billingCheckoutRequestSchema,
    },
    responses: {
      "200": {
        description: "Owned Stripe checkout ready to open.",
        schema: billingCheckoutResponseSchema,
      },
      "400": {
        description: "Invalid plan, promo, or request.",
        schema: billingCheckoutErrorSchema,
      },
      "401": unauthorized,
      "403": {
        description: "Account cannot perform billing side effects.",
        schema: billingCheckoutErrorSchema,
      },
      "404": {
        description: "Account was not found.",
        schema: billingCheckoutErrorSchema,
      },
      "409": {
        description:
          "Existing checkout or entitlement requires reconciliation, with actionable recovery when safe.",
        schema: billingCheckoutErrorSchema,
      },
      "502": {
        description: "Stripe checkout could not be confirmed.",
        schema: billingCheckoutErrorSchema,
      },
      "503": {
        description: "Billing provider unavailable or unconfigured.",
        schema: billingCheckoutErrorSchema,
      },
    },
  },
  {
    operationId: "previewBillingPromo",
    method: "get",
    path: "/billing/promo",
    fastifyPath: "/billing/promo",
    summary: "Preview what checkout will do with a promo code",
    description:
      "Read-only. Runs the checkout promo validator for the signed-in account without creating a session or touching Stripe. Checkout re-validates on its own.",
    tags: ["billing"],
    auth: "user-session",
    contractMaturity: "consumer-adopted",
    parameters: [
      {
        name: "code",
        in: "query",
        required: true,
        description: "Customer-typed promo code; trimmed and upper-cased server-side.",
        schema: billingPromoPreviewQuery.code,
      },
    ],
    responses: {
      "200": {
        description: "Validation result for this account, refusals included.",
        schema: billingPromoPreviewSchema,
      },
      "400": {
        description: "Missing or malformed code.",
        schema: errorResponseSchema,
      },
      "401": unauthorized,
      "404": {
        description: "Account was not found.",
        schema: errorResponseSchema,
      },
    },
  },
  {
    operationId: "previewBillingDreamerUpgrade",
    method: "get",
    path: "/billing/upgrade-to-dreamer",
    fastifyPath: "/billing/upgrade-to-dreamer",
    summary: "Preview a Pro subscription's upgrade to Dreamer at list price",
    description:
      "Read-only. For the caller's own Pro subscription that the plan-change portal cannot switch (a legacy Price, a discount, or a promo offer), returns the Dreamer list price at the same cadence, the prorated amount invoiced immediately, and whether a discount ends.",
    tags: ["billing"],
    auth: "user-session",
    contractMaturity: "consumer-adopted",
    responses: {
      "200": {
        description: "Terms of the upgrade.",
        schema: billingDreamerUpgradePreviewSchema,
      },
      "400": {
        description: "The Dreamer plan is not available.",
        schema: billingDreamerUpgradeErrorSchema,
      },
      "401": unauthorized,
      "403": {
        description: "Account cannot perform billing side effects.",
        schema: billingDreamerUpgradeErrorSchema,
      },
      "409": {
        description:
          "Not upgradable here: the portal handles it (billing_upgrade_use_portal), the plan is not Pro (billing_upgrade_not_pro), or there is no active, renewing, single-item subscription (billing_upgrade_unavailable).",
        schema: billingDreamerUpgradeErrorSchema,
      },
      "502": {
        description: "Stripe could not be read.",
        schema: billingDreamerUpgradeErrorSchema,
      },
      "503": {
        description: "Billing is not configured.",
        schema: billingDreamerUpgradeErrorSchema,
      },
    },
  },
  {
    operationId: "upgradeBillingToDreamer",
    method: "post",
    path: "/billing/upgrade-to-dreamer",
    fastifyPath: "/billing/upgrade-to-dreamer",
    summary: "Upgrade a Pro subscription to Dreamer at list price",
    description:
      "Moves the caller's own subscription to the Dreamer list Price at the same cadence, removes every discount, and invoices the proration immediately. A declined payment leaves the subscription unchanged. The subscription webhook mapping sets the tier.",
    tags: ["billing"],
    auth: "user-session",
    contractMaturity: "consumer-adopted",
    requestBody: {
      description: "Confirmation carrying the idempotency key for this attempt.",
      contentType: "application/json",
      required: true,
      schema: billingDreamerUpgradeRequestSchema,
    },
    responses: {
      "200": {
        description: "Stripe accepted the upgrade.",
        schema: billingDreamerUpgradeResponseSchema,
      },
      "400": {
        description: "Missing idempotency key, or the Dreamer plan is not available.",
        schema: billingDreamerUpgradeErrorSchema,
      },
      "401": unauthorized,
      "402": {
        description:
          "The prorated payment failed (billing_payment_failed) or needs 3-D Secure (billing_payment_requires_action); nothing changed.",
        schema: billingDreamerUpgradeErrorSchema,
      },
      "403": {
        description: "Account cannot perform billing side effects.",
        schema: billingDreamerUpgradeErrorSchema,
      },
      "409": {
        description:
          "Not upgradable here (the same codes as the preview), the subscription or its prices no longer match the confirmed terms or the preview is too old (billing_upgrade_terms_changed; preview again), or the same attempt is still in flight at Stripe (billing_upgrade_in_progress).",
        schema: billingDreamerUpgradeErrorSchema,
      },
      "502": {
        description: "Stripe did not confirm the change.",
        schema: billingDreamerUpgradeErrorSchema,
      },
      "503": {
        description: "Billing is not configured.",
        schema: billingDreamerUpgradeErrorSchema,
      },
    },
  },
  {
    operationId: "listFilteredMail",
    method: "get",
    path: "/conversations/filtered",
    fastifyPath: "/conversations/filtered",
    summary: "List the owner's mail that Messages hides",
    description:
      "Inbound mail for the signed-in account from the last 30 days that Messages does not show, newest first, at most 100 rows. Verification codes (including link-only verification, activation and password-reset mail), support mail, own-address mail, the user's own mail, unclaimed personal-inbox mail and mail still being routed never appear; a code the user asked for reaches them through the code forward.",
    tags: ["messages"],
    auth: "user-session",
    contractMaturity: "consumer-adopted",
    responses: {
      "200": {
        description: "Filtered mail, newest first.",
        schema: filteredMailListResponseSchema,
      },
      "401": unauthorized,
      "403": {
        description: "An API key; filtered mail answers only a signed-in session (`session_required`).",
        schema: errorResponseSchema,
      },
    },
  },
  {
    operationId: "getFilteredMail",
    method: "get",
    path: "/conversations/filtered/{id}",
    fastifyPath: "/conversations/filtered/:id",
    summary: "Read one filtered email",
    description:
      "Read-only detail of one email the list would return. The body carries the same `content` and untrusted `contentHtml` fields as Messages.",
    tags: ["messages"],
    auth: "user-session",
    contractMaturity: "consumer-adopted",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Inbound email id from the filtered list.",
        schema: uuidString,
      },
    ],
    responses: {
      "200": {
        description: "The email.",
        schema: filteredMailDetailResponseSchema,
      },
      "401": unauthorized,
      "403": {
        description: "An API key; filtered mail answers only a signed-in session (`session_required`).",
        schema: errorResponseSchema,
      },
      "404": {
        description:
          "No filtered email with that id belongs to the caller. Unknown, non-owned, excluded and malformed ids are indistinguishable.",
        schema: errorResponseSchema,
      },
    },
  },
  {
    operationId: "showFilteredMail",
    method: "post",
    path: "/conversations/filtered/{id}/show",
    fastifyPath: "/conversations/filtered/:id/show",
    summary: "Say a filtered email should have been shown",
    description:
      "Records the user's label as classifier ground truth and moves the email into Messages, threaded into its application's conversation when it matched one. Nothing is emailed. A receipt keeps its `ats_confirmation` label. Idempotent while the email stays shown.",
    tags: ["messages"],
    auth: "user-session",
    contractMaturity: "consumer-adopted",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Inbound email id from the filtered list.",
        schema: uuidString,
      },
    ],
    requestBody: {
      description: "Optional label; `recruiter_reply` when omitted.",
      contentType: "application/json",
      required: false,
      schema: filteredMailShowRequestSchema,
    },
    responses: {
      "204": {
        description: "The email is in Messages: moved now, or already moved by an earlier press, whose unfinished steps this one completes.",
      },
      "400": {
        description: "Unknown label (`Unknown label`), or a body that is not JSON.",
        schema: errorResponseSchema,
      },
      "401": unauthorized,
      "403": {
        description: "An API key; filtered mail answers only a signed-in session (`session_required`).",
        schema: errorResponseSchema,
      },
      "404": {
        description:
          "No filtered email with that id belongs to the caller. Unknown, non-owned, excluded and malformed ids are indistinguishable.",
        schema: errorResponseSchema,
      },
      "500": {
        description:
          "Threading into the application's conversation failed. Pressing again finishes the move.",
        schema: errorResponseSchema,
      },
    },
  },
  {
    operationId: "listJobs",
    method: "get",
    path: "/jobs",
    fastifyPath: "/jobs",
    summary: "List the user's jobs",
    description:
      "Core pipeline list ordered by createdAt descending, with optional worker-status filter and offset pagination.",
    tags: ["jobs"],
    auth: "user-session",
    contractMaturity: "handler-verified",
    parameters: [
      {
        name: "status",
        in: "query",
        required: false,
        description: "Filter to a single worker status.",
        schema: listJobsQuery.status,
      },
      {
        name: "limit",
        in: "query",
        required: false,
        description: "Page size, 1-100. Defaults to 50.",
        schema: listJobsQuery.limit,
      },
      {
        name: "offset",
        in: "query",
        required: false,
        description: "Row offset. Defaults to 0.",
        schema: listJobsQuery.offset,
      },
    ],
    responses: {
      "200": {
        description: "Page of jobs plus the returned row count.",
        schema: jobListResponseSchema,
      },
      "400": {
        description: "Query validation failed.",
        schema: validationErrorResponseSchema,
      },
      "401": unauthorized,
    },
  },
  {
    operationId: "getJob",
    method: "get",
    path: "/jobs/{id}",
    fastifyPath: "/jobs/:id",
    summary: "Get one job",
    description: "Single job read scoped to the authenticated user.",
    tags: ["jobs"],
    auth: "user-session",
    contractMaturity: "handler-verified",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Job id.",
        schema: z.uuid(),
      },
    ],
    responses: {
      "200": {
        description: "The job.",
        schema: jobResponseSchema,
      },
      "401": unauthorized,
      "404": {
        description: "No job with this id belongs to the user.",
        schema: errorResponseSchema,
      },
    },
  },
  {
    operationId: "prepareJobApplication",
    method: "post",
    path: "/jobs/{id}/prepare",
    fastifyPath: "/jobs/:id/prepare",
    summary: "Prepare one saved job's application materials",
    description:
      "Admin-only lazy bridge for a saved job. Creates or adopts one workflow, initializes per-job materials, and durably queues pack generation.",
    tags: ["jobs"],
    auth: "user-session",
    contractMaturity: "documented",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Owned saved job id.",
        schema: uuidString,
      },
    ],
    responses: {
      "200": {
        description: "The stable application id and pack preparation status.",
        schema: prepareJobResponseSchema,
      },
      "401": unauthorized,
      "403": {
        description: "The Applications preview is unavailable for this account.",
        schema: errorResponseSchema,
      },
      "404": {
        description: "No job with this id belongs to the user.",
        schema: errorResponseSchema,
      },
      "409": {
        description: "The job, application, profile, or materials are not safe to prepare.",
        schema: errorResponseSchema,
      },
      "503": {
        description: "The durable pack enqueue could not be established.",
        schema: errorResponseSchema,
      },
    },
  },
  {
    operationId: "listListings",
    method: "get",
    path: "/listings",
    fastifyPath: "/listings",
    summary: "Browse the public listing corpus",
    description:
      "Unauthenticated corpus browse with filtering, sorting, and offset pagination. Page size ceilings are plan-owned; anonymous callers get the Free cap. Totals are bounded at 1000 with `totalCapped` reporting the truncation. Opt-in pagination=cursor returns a count-free inventory page with nextCursor, uses UUID order, and excludes rows inserted after the walk began.",
    tags: ["listings"],
    auth: "public",
    contractMaturity: "runtime-validated",
    parameters: [
      {
        name: "pagination",
        description: "Use cursor for complete, count-free inventory traversal.",
        in: "query",
        required: false,
        schema: listListingsQuery.pagination,
      },
      {
        name: "cursor",
        description: "Continuation token; keep the original filters.",
        in: "query",
        required: false,
        schema: listListingsQuery.cursor,
      },
      {
        name: "limit",
        in: "query",
        required: false,
        description: "Page size. Defaults to 25; larger values are clamped.",
        schema: listListingsQuery.limit,
      },
      {
        name: "offset",
        in: "query",
        required: false,
        description: "Row offset. Defaults to 0.",
        schema: listListingsQuery.offset,
      },
      {
        name: "search",
        in: "query",
        required: false,
        description: "Free-text search over the indexed title/company columns.",
        schema: listListingsQuery.search,
      },
      {
        name: "remote",
        in: "query",
        required: false,
        description: "Remote-only filter.",
        schema: listListingsQuery.remote,
      },
      {
        name: "workType",
        in: "query",
        required: false,
        description: "Comma-separated remote_type values (union).",
        schema: listListingsQuery.workType,
      },
      {
        name: "location",
        in: "query",
        required: false,
        description: "Display label for a structured location filter.",
        schema: listListingsQuery.location,
      },
      {
        name: "locationCity",
        in: "query",
        required: false,
        description: "Resolved city label.",
        schema: listListingsQuery.locationCity,
      },
      {
        name: "locationRegionCode",
        in: "query",
        required: false,
        description: "Resolved ISO subdivision code.",
        schema: listListingsQuery.locationRegionCode,
      },
      {
        name: "locationCountryCode",
        in: "query",
        required: false,
        description: "Resolved ISO country code.",
        schema: listListingsQuery.locationCountryCode,
      },
      {
        name: "locationLat",
        in: "query",
        required: false,
        description: "Resolved city latitude.",
        schema: listListingsQuery.locationLat,
      },
      {
        name: "locationLng",
        in: "query",
        required: false,
        description: "Resolved city longitude.",
        schema: listListingsQuery.locationLng,
      },
      {
        name: "country",
        in: "query",
        required: false,
        description:
          "ISO-3166-1 alpha-2 country filter; keeps fully-remote listings.",
        schema: listListingsQuery.country,
      },
      {
        name: "countryExact",
        in: "query",
        required: false,
        description:
          "Exact country filter for machine consumers; repeatable, no remote union.",
        schema: listListingsQuery.countryExact,
      },
      {
        name: "geo",
        in: "query",
        required: false,
        description:
          'Set to "auto" to default the country from coarse edge geo headers.',
        schema: listListingsQuery.geo,
      },
      {
        name: "company",
        in: "query",
        required: false,
        description: "Company name or domain search.",
        schema: listListingsQuery.company,
      },
      {
        name: "companyDomainExact",
        in: "query",
        required: false,
        description: "Exact company domain filter.",
        schema: listListingsQuery.companyDomainExact,
      },
      {
        name: "sort",
        in: "query",
        required: false,
        description: "Ordering selector; unknown values fall back.",
        schema: listListingsQuery.sort,
      },
      {
        name: "function",
        in: "query",
        required: false,
        description: "Comma-separated function_primary values.",
        schema: listListingsQuery.function,
      },
      {
        name: "seniority",
        in: "query",
        required: false,
        description: "Comma-separated seniority chip labels.",
        schema: listListingsQuery.seniority,
      },
      {
        name: "seniorityExact",
        in: "query",
        required: false,
        description: "Exact canonical seniority; repeatable.",
        schema: listListingsQuery.seniorityExact,
      },
      {
        name: "dreamwork500",
        in: "query",
        required: false,
        description: "Restrict to Dreamwork-500 companies.",
        schema: listListingsQuery.dreamwork500,
      },
      {
        name: "aiRole",
        in: "query",
        required: false,
        description: "Restrict to AI roles.",
        schema: listListingsQuery.aiRole,
      },
      {
        name: "newOnly",
        in: "query",
        required: false,
        description: "Restrict to the 7-day freshness window.",
        schema: listListingsQuery.newOnly,
      },
      {
        name: "postedWithin",
        in: "query",
        required: false,
        description: "Freshness window in days (1-90); wins over newOnly.",
        schema: listListingsQuery.postedWithin,
      },
      {
        name: "industry",
        in: "query",
        required: false,
        description: "Canonical company industry filter.",
        schema: listListingsQuery.industry,
      },
      {
        name: "minSalary",
        in: "query",
        required: false,
        description: "Pay floor in thousands of annual USD; keeps listings whose band reaches it.",
        schema: listListingsQuery.minSalary,
      },
      {
        name: "maxSalary",
        in: "query",
        required: false,
        description: "Pay ceiling in thousands of annual USD; keeps listings whose band starts at or under it.",
        schema: listListingsQuery.maxSalary,
      },
      {
        name: "equity",
        in: "query",
        required: false,
        description: "Require an equity signal.",
        schema: listListingsQuery.equity,
      },
      {
        name: "bonus",
        in: "query",
        required: false,
        description: "Require a bonus signal.",
        schema: listListingsQuery.bonus,
      },
      {
        name: "healthcare",
        in: "query",
        required: false,
        description: "Require a healthcare signal.",
        schema: listListingsQuery.healthcare,
      },
      {
        name: "internship",
        in: "query",
        required: false,
        description: "Internships, co-ops, and apprenticeships only.",
        schema: listListingsQuery.internship,
      },
      {
        name: "addedAfter",
        in: "query",
        required: false,
        description:
          "Only listings first seen after this ISO 8601 date-time; part of the inventory cursor's filters.",
        schema: listListingsQuery.addedAfter,
      },
    ],
    responses: {
      "200": {
        description: "Browse page with bounded totals, or an inventory page with nextCursor.",
        schema: listingsPageResponseSchema,
      },
      "400": {
        description: "Invalid, expired, or mismatched inventory cursor, incompatible pagination options, or a malformed addedAfter.",
        schema: errorResponseSchema,
      },
    },
  },
  {
    operationId: "getRecommendedListings",
    method: "get",
    path: "/listings/recommended",
    fastifyPath: "/listings/recommended",
    summary: "Get the personalized recommendation feed",
    description:
      "Scored, paged recommendations for the current user. Malformed numeric filters are clamped or ignored rather than rejected; the one validation failure is a malformed addedAfter.",
    tags: ["listings"],
    auth: "user-session",
    contractMaturity: "consumer-adopted",
    parameters: [
      {
        name: "limit",
        in: "query",
        required: false,
        description: "Page size, clamped to 1-250. Defaults to 200.",
        schema: recommendedListingsQuery.limit,
      },
      {
        name: "offset",
        in: "query",
        required: false,
        description: "Row offset. Defaults to 0.",
        schema: recommendedListingsQuery.offset,
      },
      {
        name: "aiRole",
        in: "query",
        required: false,
        description: "Restrict to AI roles.",
        schema: recommendedListingsQuery.aiRole,
      },
      {
        name: "function",
        in: "query",
        required: false,
        description: "Comma-separated function_primary values.",
        schema: recommendedListingsQuery.function,
      },
      {
        name: "seniority",
        in: "query",
        required: false,
        description: "Comma-separated seniority chip labels.",
        schema: recommendedListingsQuery.seniority,
      },
      {
        name: "remote",
        in: "query",
        required: false,
        description: "Remote-only filter.",
        schema: recommendedListingsQuery.remote,
      },
      {
        name: "workType",
        in: "query",
        required: false,
        description: "Comma-separated remote_type values (union).",
        schema: recommendedListingsQuery.workType,
      },
      {
        name: "search",
        in: "query",
        required: false,
        description: "Free-text search over the candidate pool.",
        schema: recommendedListingsQuery.search,
      },
      {
        name: "location",
        in: "query",
        required: false,
        description: "Display label for a structured location filter.",
        schema: recommendedListingsQuery.location,
      },
      {
        name: "locationCity",
        in: "query",
        required: false,
        description: "Resolved city label.",
        schema: recommendedListingsQuery.locationCity,
      },
      {
        name: "locationRegionCode",
        in: "query",
        required: false,
        description: "Resolved ISO subdivision code.",
        schema: recommendedListingsQuery.locationRegionCode,
      },
      {
        name: "locationCountryCode",
        in: "query",
        required: false,
        description: "Resolved ISO country code.",
        schema: recommendedListingsQuery.locationCountryCode,
      },
      {
        name: "locationLat",
        in: "query",
        required: false,
        description: "Resolved city latitude.",
        schema: recommendedListingsQuery.locationLat,
      },
      {
        name: "locationLng",
        in: "query",
        required: false,
        description: "Resolved city longitude.",
        schema: recommendedListingsQuery.locationLng,
      },
      {
        name: "industry",
        in: "query",
        required: false,
        description: "Canonical company industry filter.",
        schema: recommendedListingsQuery.industry,
      },
      {
        name: "includeIneligible",
        in: "query",
        required: false,
        description: "Escape hatch that disables the work-eligibility filter.",
        schema: recommendedListingsQuery.includeIneligible,
      },
      {
        name: "minSalary",
        in: "query",
        required: false,
        description: "Pay floor in thousands of annual USD; keeps listings whose band reaches it.",
        schema: recommendedListingsQuery.minSalary,
      },
      {
        name: "maxSalary",
        in: "query",
        required: false,
        description: "Pay ceiling in thousands of annual USD; keeps listings whose band starts at or under it.",
        schema: recommendedListingsQuery.maxSalary,
      },
      {
        name: "equity",
        in: "query",
        required: false,
        description: "Require an equity signal.",
        schema: recommendedListingsQuery.equity,
      },
      {
        name: "bonus",
        in: "query",
        required: false,
        description: "Require a bonus signal.",
        schema: recommendedListingsQuery.bonus,
      },
      {
        name: "healthcare",
        in: "query",
        required: false,
        description: "Require a healthcare signal.",
        schema: recommendedListingsQuery.healthcare,
      },
      {
        name: "internship",
        in: "query",
        required: false,
        description: "Internships, co-ops, and apprenticeships only.",
        schema: recommendedListingsQuery.internship,
      },
      {
        name: "newOnly",
        in: "query",
        required: false,
        description: "Restrict to the 7-day freshness window.",
        schema: recommendedListingsQuery.newOnly,
      },
      {
        name: "postedWithin",
        in: "query",
        required: false,
        description: "Freshness window in days (1-90); wins over newOnly.",
        schema: recommendedListingsQuery.postedWithin,
      },
      {
        name: "minScore",
        in: "query",
        required: false,
        description: "Match-quality floor on the raw blended matchScore.",
        schema: recommendedListingsQuery.minScore,
      },
      {
        name: "sort",
        in: "query",
        required: false,
        description: "Ordering override; omit for match-score order.",
        schema: recommendedListingsQuery.sort,
      },
      {
        name: "addedAfter",
        in: "query",
        required: false,
        description: "Only listings first seen after this ISO 8601 date-time.",
        schema: recommendedListingsQuery.addedAfter,
      },
    ],
    responses: {
      "200": {
        description:
          "Scored recommendation page plus pool, eligibility, and serving diagnostics.",
        schema: recommendedListingsResponseSchema,
      },
      "400": {
        description: "addedAfter is not an ISO 8601 date-time.",
        schema: errorResponseSchema,
      },
      "401": unauthorized,
    },
  },
  {
    operationId: "getPipeline",
    method: "get",
    path: "/pipeline",
    fastifyPath: "/pipeline",
    summary: "Get the product pipeline board",
    description:
      "Deduplicated, product-shaped pipeline cards for the current user: active cards first, then closed ones, each by last pipeline activity, with a tenth of `limit` held for the most recently closed cards.",
    tags: ["pipeline"],
    auth: "user-session",
    contractMaturity: "consumer-adopted",
    parameters: [
      {
        name: "limit",
        in: "query",
        required: false,
        description: "Maximum cards returned, 1-500. Defaults to 200.",
        schema: pipelineQuery.limit,
      },
    ],
    responses: {
      "200": {
        description: "Pipeline cards plus pagination signals.",
        schema: pipelineResponseSchema,
      },
      "400": {
        description: "Query validation failed.",
        schema: validationErrorResponseSchema,
      },
      "401": unauthorized,
      "500": {
        description:
          "Pipeline query failed; empty board payload with an error message.",
        schema: pipelineErrorResponseSchema,
      },
    },
  },
  {
    operationId: "getProfile",
    method: "get",
    path: "/profile",
    fastifyPath: "/profile",
    summary: "Get the user profile",
    description:
      "Full profile by default; `view=analysis_status` selects the narrow resume-analysis status view.",
    tags: ["profile"],
    auth: "user-session",
    contractMaturity: "runtime-validated",
    parameters: [
      {
        name: "view",
        in: "query",
        required: false,
        description:
          "Set to `analysis_status` for the narrow analysis-status view.",
        schema: profileQuery.view,
      },
    ],
    responses: {
      "200": {
        description:
          "Profile payload; shape depends on the `view` query parameter.",
        schema: profileGetResponseSchema,
      },
      "401": unauthorized,
      "404": {
        description: "No profile configured for this user.",
        schema: errorResponseSchema,
      },
      "409": {
        description:
          "Profile identity reset is in progress; identity-bound profile data is temporarily unavailable.",
        schema: profileRevisionConflictResponseSchema,
      },
    },
  },
  {
    operationId: "getProfileAnalysis",
    method: "get",
    path: "/profile/analysis",
    fastifyPath: "/profile/analysis",
    summary: "Get or create resume analysis",
    description:
      "Returns cached analysis when available; otherwise may synchronously analyze the stored resume.",
    tags: ["profile"],
    auth: "user-session",
    contractMaturity: "consumer-adopted",
    responses: {
      "200": {
        description: "Cached or freshly computed resume analysis.",
        schema: profileAnalysisResponseSchema,
      },
      "400": {
        description: "The profile has no uploaded resume.",
        schema: errorResponseSchema,
      },
      "401": unauthorized,
      "404": {
        description:
          "No profile configured for this user, or an analysis is still in flight — retry until it resolves.",
        schema: errorResponseSchema,
      },
    },
  },
  {
    operationId: "getApplicationAnswers",
    method: "get",
    path: "/profile/application-answers",
    fastifyPath: "/profile/application-answers",
    summary: "Get reusable application answers",
    description:
      "Returns the authenticated user's expanded canonical application-answer document, including application-scoped screening facts.",
    tags: ["profile"],
    auth: "user-session",
    contractMaturity: "handler-verified",
    parameters: [{ name: 'includeEducation', in: 'query', required: false,
      description: 'Opt in to effective education and its saved/resume/default source. Omitted for older strict clients.',
      schema: z.enum(['true', 'false']), }],
    responses: {
      "200": {
        description: "Expanded canonical application answers.",
        schema: applicationAnswersResponseSchema,
      },
      "401": unauthorized,
      "404": {
        description: "No profile configured for this user.",
        schema: errorResponseSchema,
      },
      "409": {
        description: "A profile identity reset is in progress.",
        schema: profileRevisionConflictResponseSchema,
      },
    },
  },
  {
    operationId: "patchApplicationAnswers",
    method: "patch",
    path: "/profile/application-answers",
    fastifyPath: "/profile/application-answers",
    summary: "Update reusable application answers",
    description:
      "CAS-safe partial update for canonical application answers, including application-scoped screening facts; voluntary self-identification is excluded.",
    tags: ["profile"],
    auth: "user-session",
    contractMaturity: "handler-verified",
    parameters: [{ name: 'includeEducation', in: 'query', required: false,
      description: 'Opt in to effective education and its source in the response.',
      schema: z.enum(['true', 'false']), }],
    requestBody: {
      description: "Canonical application-answer patch.",
      contentType: "application/json",
      required: true,
      schema: applicationAnswersPatchRequestSchema,
    },
    responses: {
      "200": {
        description: "Updated expanded canonical application answers.",
        schema: applicationAnswersResponseSchema,
      },
      "400": {
        description: "Body validation failed.",
        schema: validationErrorResponseSchema,
      },
      "401": unauthorized,
      "404": {
        description: "No profile configured for this user.",
        schema: errorResponseSchema,
      },
      "409": {
        description: "Stored base is invalid or the optimistic write conflicted.",
        schema: profileRevisionConflictResponseSchema,
      },
    },
  },
  {
    operationId: "getAssistantMemory",
    method: "get",
    path: "/profile/assistant-memory",
    fastifyPath: "/profile/assistant-memory",
    summary: "Read the assistant's working hypotheses",
    description:
      "What the assistant believes about the candidate and was never told, plus the candidate's standing writing likes and dislikes. Hypotheses are held apart from the career record: nothing that reads preferences reads this, and a hypothesis is never a claim or a filter until it is confirmed.",
    tags: ["profile"],
    auth: "user-session",
    contractMaturity: "consumer-adopted",
    responses: {
      "200": {
        description: "The stored hypotheses and writing preferences.",
        schema: assistantMemoryResponseSchema,
      },
      "401": unauthorized,
      "404": {
        description: "No profile configured for this user.",
        schema: errorResponseSchema,
      },
      "409": {
        description: "A profile identity reset is in progress.",
        schema: profileRevisionConflictResponseSchema,
      },
    },
  },
  {
    operationId: "createAssistantHypothesis",
    method: "post",
    path: "/profile/assistant-memory/hypotheses",
    fastifyPath: "/profile/assistant-memory/hypotheses",
    summary: "Record one working hypothesis",
    description:
      "Store a belief about the candidate that they have not stated. Refused once the memory holds its cap of hypotheses, so an unreviewed second profile cannot accumulate.",
    tags: ["profile"],
    auth: "user-session",
    contractMaturity: "handler-verified",
    requestBody: {
      description: "The belief, in one sentence, and who formed it.",
      contentType: "application/json",
      required: true,
      schema: assistantHypothesisCreateRequestSchema,
    },
    responses: {
      "201": {
        description: "The stored hypothesis and the memory it belongs to.",
        schema: assistantHypothesisCreateResponseSchema,
      },
      "400": {
        description: "Body validation failed.",
        schema: validationErrorResponseSchema,
      },
      "401": unauthorized,
      "404": {
        description: "No profile configured for this user.",
        schema: errorResponseSchema,
      },
      "409": {
        description:
          "The memory already holds its cap of hypotheses, a profile identity reset is in progress, or the write conflicted.",
        schema: errorResponseSchema,
      },
    },
  },
  {
    operationId: "deleteAssistantHypothesis",
    method: "delete",
    path: "/profile/assistant-memory/hypotheses/{id}",
    fastifyPath: "/profile/assistant-memory/hypotheses/:id",
    summary: "Forget one working hypothesis",
    description:
      "Delete a stored belief. Nothing is written to the career record. Unknown, non-owned and malformed ids are indistinguishable.",
    tags: ["profile"],
    auth: "user-session",
    contractMaturity: "handler-verified",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Owned hypothesis id.",
        schema: uuidString,
      },
    ],
    responses: {
      "200": {
        description: "The hypothesis is gone and the memory is returned.",
        schema: assistantHypothesisForgetResponseSchema,
      },
      "401": unauthorized,
      "404": {
        description:
          "No hypothesis with that id belongs to the caller. Unknown, non-owned and malformed ids are indistinguishable.",
        schema: errorResponseSchema,
      },
      "409": {
        description:
          "A profile identity reset is in progress, or the write conflicted.",
        schema: errorResponseSchema,
      },
    },
  },
  {
    operationId: "confirmAssistantHypothesis",
    method: "post",
    path: "/profile/assistant-memory/hypotheses/{id}/confirm",
    fastifyPath: "/profile/assistant-memory/hypotheses/:id/confirm",
    summary: "Promote a hypothesis the candidate agreed with",
    description:
      "Move the hypothesis text into the career record and delete the hypothesis. A refusal (\"no on-site roles\") becomes a stated deal-breaker; anything else becomes a work-vault note, which filters nothing. `destination` says which happened.",
    tags: ["profile"],
    auth: "user-session",
    contractMaturity: "handler-verified",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Owned hypothesis id.",
        schema: uuidString,
      },
    ],
    responses: {
      "200": {
        description: "Where the confirmed text landed, and the memory after.",
        schema: assistantHypothesisConfirmResponseSchema,
      },
      "401": unauthorized,
      "404": {
        description:
          "No hypothesis with that id belongs to the caller. Unknown, non-owned and malformed ids are indistinguishable.",
        schema: errorResponseSchema,
      },
      "409": {
        description:
          "The work vault is full, a profile identity reset is in progress, or the write conflicted.",
        schema: errorResponseSchema,
      },
    },
  },
  {
    operationId: "getUsVoluntarySelfIdentification",
    method: "get",
    path: "/profile/voluntary-self-identification/us",
    fastifyPath: "/profile/voluntary-self-identification/us",
    summary: "Get US voluntary self-identification",
    description:
      "Returns the authenticated user's restricted US self-identification record, if any.",
    tags: ["profile"],
    auth: "user-session",
    contractMaturity: "handler-verified",
    responses: {
      "200": {
        description: "Restricted US self-identification state.",
        schema: usSelfIdentificationResponseSchema,
      },
      "401": unauthorized,
      "404": {
        description: "No profile configured for this user.",
        schema: errorResponseSchema,
      },
      "409": {
        description: "A profile identity reset is in progress.",
        schema: profileRevisionConflictResponseSchema,
      },
    },
  },
  {
    operationId: "putUsVoluntarySelfIdentification",
    method: "put",
    path: "/profile/voluntary-self-identification/us",
    fastifyPath: "/profile/voluntary-self-identification/us",
    summary: "Replace US voluntary self-identification",
    description:
      "Creates or replaces the complete restricted document at an expected revision.",
    tags: ["profile"],
    auth: "user-session",
    contractMaturity: "handler-verified",
    requestBody: {
      description: "Strict whole-document replacement.",
      contentType: "application/json",
      required: true,
      schema: usSelfIdentificationPutRequestSchema,
    },
    responses: {
      "200": {
        description: "Updated restricted US self-identification state.",
        schema: usSelfIdentificationResponseSchema,
      },
      "400": {
        description: "Body or notice-version validation failed.",
        schema: validationErrorResponseSchema,
      },
      "401": unauthorized,
      "409": {
        description: "Expected revision did not match.",
        schema: profileRevisionConflictResponseSchema,
      },
    },
  },
  {
    operationId: "deleteUsVoluntarySelfIdentification",
    method: "delete",
    path: "/profile/voluntary-self-identification/us",
    fastifyPath: "/profile/voluntary-self-identification/us",
    summary: "Clear US voluntary self-identification",
    description: "Deletes the restricted row at an expected revision.",
    tags: ["profile"],
    auth: "user-session",
    contractMaturity: "handler-verified",
    requestBody: {
      description: "Exact revision to clear.",
      contentType: "application/json",
      required: true,
      schema: usSelfIdentificationDeleteRequestSchema,
    },
    responses: {
      "204": { description: "Restricted self-identification row deleted." },
      "400": {
        description: "Body validation failed.",
        schema: validationErrorResponseSchema,
      },
      "401": unauthorized,
      "409": {
        description: "Expected revision did not match.",
        schema: profileRevisionConflictResponseSchema,
      },
    },
  },
  {
    operationId: "previewPublicBillingPromo",
    method: "get",
    path: "/public/billing/promo",
    fastifyPath: "/public/billing/promo",
    summary: "Preview what a promo code is worth, without a session",
    description:
      "Read-only catalog lookup: whether the code names a live offer and which tiers it touches. Whether a given account may redeem it is answered by GET /billing/promo and enforced by checkout.",
    tags: ["billing"],
    auth: "public",
    contractMaturity: "consumer-adopted",
    parameters: [
      {
        name: "code",
        in: "query",
        required: true,
        description: "Customer-typed promo code; trimmed and upper-cased server-side.",
        schema: billingPromoPreviewQuery.code,
      },
    ],
    responses: {
      "200": {
        description: "Catalog result for the code, refusals included; never the per-account statuses.",
        schema: billingPromoPreviewSchema,
      },
      "400": { description: "Missing or malformed code.", schema: errorResponseSchema },
    },
  },
  {
    operationId: "getListingStats",
    method: "get",
    path: "/public/listing-stats",
    fastifyPath: "/public/listing-stats",
    summary: "Read the canonical active-job observation",
    tags: ["listings"],
    auth: "public",
    contractMaturity: "consumer-adopted",
    responses: {
      "200": { description: "The shared active-job count and observation time.", schema: listingStatsSchema },
      "503": { description: "No fresh active-job observation is available.", schema: errorResponseSchema },
    },
  },
  {
    operationId: "getPublicStats",
    method: "get",
    path: "/public/stats",
    fastifyPath: "/public/stats",
    summary: "Read public product statistics",
    tags: ["listings"],
    auth: "public",
    contractMaturity: "handler-verified",
    responses: {
      "200": { description: "Product statistics with the shared active-job observation.", schema: publicStatsSchema },
      "503": { description: "No fresh active-job observation is available.", schema: errorResponseSchema },
    },
  },
  {
    operationId: "getStats",
    method: "get",
    path: "/stats",
    fastifyPath: "/stats",
    summary: "Get aggregate pipeline stats",
    description:
      "Dashboard aggregates across jobs, applications, escalations, and outreach for the current user.",
    tags: ["stats"],
    auth: "user-session",
    contractMaturity: "handler-verified",
    responses: {
      "200": {
        description: "Aggregate stats.",
        schema: statsResponseSchema,
      },
      "401": unauthorized,
    },
  },
  {
    operationId: "getMe",
    method: "get",
    path: "/users/me",
    fastifyPath: "/users/me",
    summary: "Get the authenticated user",
    description:
      "Session identity probe: user identity, entitlements, profile, and headline counts.",
    tags: ["users"],
    auth: "user-session",
    contractMaturity: "consumer-adopted",
    responses: {
      "200": {
        description: "The authenticated user and profile context.",
        schema: meResponseSchema,
      },
      "401": unauthorized,
      "404": {
        description: "Session user no longer exists.",
        schema: errorResponseSchema,
      },
    },
  },
  {
    operationId: "recordProductActivity", method: "post",
    path: "/users/me/activity", fastifyPath: "/users/me/activity",
    summary: "Record a deliberate foreground product interaction", tags: ["users"], auth: "user-session", contractMaturity: "documented",
    requestBody: { description: "Foreground event", contentType: "application/json", required: true, schema: productActivityRequestSchema },
    responses: { "204": { description: "Activity recorded" }, "400": { description: "Invalid event", schema: errorResponseSchema }, "401": unauthorized },
  },
  {
    operationId: "getApplicationUsage",
    method: "get",
    path: "/users/me/application-usage",
    fastifyPath: "/users/me/application-usage",
    summary: "Get today's Applications usage",
    description:
      "Admin-only rollout counter for saved jobs and manual applications. An active tier preview determines whether the five-per-day free limits apply.",
    tags: ["users"],
    auth: "user-session",
    contractMaturity: "documented",
    responses: {
      "200": {
        description: "Save and manual-application usage through the next UTC reset.",
        schema: applicationUsageResponseSchema,
      },
      "401": unauthorized,
      "403": {
        description: "The Applications rollout is restricted to administrators.",
        schema: errorResponseSchema,
      },
      "404": {
        description: "Session user no longer exists.",
        schema: errorResponseSchema,
      },
    },
  },
  {
    operationId: "getCommunicationPreferences", method: "get",
    path: "/users/me/communication-preferences", fastifyPath: "/users/me/communication-preferences",
    summary: "Read communication preferences", tags: ["users"], auth: "user-session", contractMaturity: "consumer-adopted",

    responses: { "200": { description: "Current preferences and delivery eligibility", schema: communicationPreferencesResponseSchema }, "401": unauthorized, "404": { description: "User not found", schema: errorResponseSchema } },
  },
  {
    operationId: "updateCommunicationPreferences", method: "patch",
    path: "/users/me/communication-preferences", fastifyPath: "/users/me/communication-preferences",
    summary: "Update communication preferences", tags: ["users"], auth: "user-session", contractMaturity: "consumer-adopted",
    requestBody: { description: "Edited preference", contentType: "application/json", required: true, schema: communicationPreferencesUpdateRequestSchema },
    responses: { "200": { description: "Current preferences and delivery eligibility", schema: communicationPreferencesResponseSchema }, "400": { description: "Invalid preference update", schema: errorResponseSchema }, "401": unauthorized, "409": { description: "A retired guest account cannot re-enable communications", schema: errorResponseSchema }, "404": { description: "User not found", schema: errorResponseSchema } },
  },
  {
    operationId: "setGenerationModel",
    method: "post",
    path: "/users/me/generation-model",
    fastifyPath: "/users/me/generation-model",
    summary: "Set the preferred generation model",
    description:
      "Stores the user's pack-generation model choice. Tier-gated: Opus requires Pro or Dreamer; Mythos is not available yet.",
    tags: ["users"],
    auth: "user-session",
    contractMaturity: "consumer-adopted",
    requestBody: {
      description: "The model to prefer.",
      contentType: "application/json",
      required: true,
      schema: generationModelUpdateRequestSchema,
    },
    responses: {
      "200": {
        description: "Stored preference and the resolved effective model.",
        schema: generationModelUpdateResponseSchema,
      },
      "400": {
        description: "Body validation failed (`invalid_model`).",
        schema: codedErrorResponseSchema,
      },
      "401": unauthorized,
      "403": {
        description:
          "Model not available (`mythos_unavailable`) or requires an upgrade (`model_requires_upgrade`).",
        schema: codedErrorResponseSchema,
      },
      "404": {
        description: "Session user no longer exists.",
        schema: errorResponseSchema,
      },
    },
  },
  {
    operationId: "completeOnboarding",
    method: "post",
    path: "/users/me/onboarding/complete",
    fastifyPath: "/users/me/onboarding/complete",
    summary: "Complete onboarding",
    description:
      "Validates the signed-in user's canonical profile and eligibility answers before recording the server-owned onboarding completion stamp.",
    tags: ["users"],
    auth: "user-session",
    contractMaturity: "handler-verified",
    responses: {
      "204": {
        description: "Onboarding completion recorded.",
      },
      "401": unauthorized,
      "409": {
        description: "Required canonical onboarding data is incomplete.",
        schema: onboardingIncompleteResponseSchema,
      },
    },
  },
  {
    operationId: "getPackUsage",
    method: "get",
    path: "/users/me/pack-usage",
    fastifyPath: "/users/me/pack-usage",
    summary: "Get today's pack allowance and usage",
    description:
      "Daily application-pack allowance and today's usage; unlimited plans return null limit/remaining.",
    tags: ["users"],
    auth: "user-session",
    contractMaturity: "consumer-adopted",
    responses: {
      "200": {
        description: "Allowance, usage, and reset instant.",
        schema: packUsageResponseSchema,
      },
      "401": unauthorized,
      "404": {
        description: "Session user no longer exists.",
        schema: errorResponseSchema,
      },
    },
  },
];
