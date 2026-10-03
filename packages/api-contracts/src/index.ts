/**
 * @jobless/api-contracts — canonical HTTP wire contracts for the Dreamwork
 * product API.
 *
 * Public runtime surface: canonical wire schemas (Zod), operation
 * descriptors, and inferred types. The OpenAPI generator lives under
 * `src/generator/` and the `scripts/` entrypoints; it is deliberately not
 * exported here so generator-only code stays out of application runtime
 * import graphs.
 */

export type {
  ContractMaturity,
  HttpMethod,
  OperationAuth,
  OperationDescriptor,
  OperationParameter,
  OperationRequestBody,
  OperationResponse,
} from "./operation.js";
export { CONTRACT_MATURITIES } from "./operation.js";
export { operations } from "./operations.js";
export { listingStatsSchema, publicStatsSchema } from "./schemas/listing-stats.js";
export {
  applicationMaterialsResponseSchema,
  applicationMaterialsSchema,
  applicationMaterialsUpdateRequestSchema,
  applicationResumeAssetSchema,
  applicationResumeVariantSchema,
} from "./schemas/application-materials.js";
export {
  applicationRecoveryProjectionSchema,
  applicationTimelineCoverageSchema,
  applicationTimelineEventKindSchema,
  applicationTimelineEventSchema,
  applicationTimelineEventSourceSchema,
  applicationTimelineResponseSchema,
} from "./schemas/application-timeline.js";
export {
  assistantHypothesisConfirmResponseSchema,
  assistantHypothesisCreateRequestSchema,
  assistantHypothesisCreateResponseSchema,
  assistantHypothesisForgetResponseSchema,
  assistantHypothesisSchema,
  assistantMemoryResponseSchema,
  assistantWritingPreferencesSchema,
} from "./schemas/assistant-memory.js";
export {
  applicationSubmittedAnswerSchema,
  applicationSubmittedRecordSchema,
} from "./schemas/application-record.js";
export { applyNowTrialOfferSchema, billingCheckoutRequestSchema, billingCheckoutResponseSchema, billingCheckoutErrorSchema, billingDreamerUpgradeErrorSchema, billingDreamerUpgradePreviewSchema, billingDreamerUpgradeRequestSchema, billingDreamerUpgradeResponseSchema, billingDreamerUpgradeTermsSchema, billingPromoCardTermsSchema, billingPromoPreviewQuery, billingPromoPreviewSchema, checkoutConflictSchema, type ApplyNowTrialOffer, type BillingDreamerUpgradePreview, type BillingDreamerUpgradeTerms,type BillingPromoCardTerms, type BillingPromoPreview, type CheckoutConflict } from "./schemas/billing.js";

export {
  applicationMethodSchema,
  codedErrorResponseSchema,
  errorResponseSchema,
  accountRoleSchema,
  generationModelKeySchema,
  isoDateTime,
  jobStatusSchema,
  subscriptionSourceSchema,
  subscriptionTierSchema,
  uuidString,
  validationErrorResponseSchema,
  validationIssueSchema,
} from "./schemas/common.js";
export {
  packAssetSchema,
  packAssetsRequestSchema,
  packAssetsSchema,
  refinePackRequestSchema,
  refineScopeResultSchema,
  refineScopeSchema,
  type PackAsset,
  type PackAssets,
  type RefinePackRequest,
  type RefineScope,
  type RefineScopeResult,
} from "./schemas/pack.js";
export {
  jobListResponseSchema,
  jobRecordSchema,
  jobResponseSchema,
  listJobsQuery,
  prepareJobResponseSchema,
} from "./schemas/jobs.js";
export {
  appliedLocationFilterSchema,
  appliedLocationSchema,
  listingInventoryResponseSchema,
  listListingsQuery,
  listingsResponseSchema,
  publicListingSchema,
  recommendationTimingSchema,
  recommendedListingSchema,
  recommendedListingsQuery,
  recommendedListingsResponseSchema,
} from "./schemas/listings.js";
export {
  applicationRecoveryActionSchema,
  applicationSubmissionDispositionSchema,
  applicationSubmissionSummarySchema,
  pipelineBenefitsSchema,
  pipelineErrorResponseSchema,
  pipelineItemSchema,
  pipelineQuery,
  pipelineResponseSchema,
  productPipelineStatusSchema,
  submissionStatusSchema,
} from "./schemas/pipeline.js";
export {
  applicationAnswersPatchRequestSchema,
  applicationAnswersResponseSchema,
  applicationProfileSchema,
  expandedApplicationProfileSchema,
  mailingAddressSchema,
  meProfileSchema,
  profileAnalysisResponseSchema,
  profileAnalysisStatusResponseSchema,
  profileGetResponseSchema,
  profilePreferencesSchema,
  profileQuery,
  profileRecordSchema,
  profileProjectionSchema,
  profileRevisionConflictResponseSchema,
  profileResponseSchema,
  usSelfIdentificationDeleteRequestSchema,
  usSelfIdentificationPutRequestSchema,
  usSelfIdentificationResponseSchema,
  usVoluntarySelfIdentificationSchema,
} from "./schemas/profile.js";
export {
  statsApplicationsSchema,
  statsEscalationsSchema,
  statsJobsSchema,
  statsOutreachSchema,
  statsResponseSchema,
} from "./schemas/stats.js";
export {
  applicationUsageResponseSchema,
  generationModelUpdateRequestSchema,
  generationModelUpdateResponseSchema,
  instantApplyAccessSchema,
  meCountsSchema,
  meResponseSchema,
  meUserSchema,
  onboardingIncompleteResponseSchema,
  packUsageResponseSchema,
} from "./schemas/users.js";

import type { z } from "zod";
import type { listingStatsSchema } from "./schemas/listing-stats.js";
import type {
  applicationMaterialsResponseSchema,
  applicationMaterialsSchema,
  applicationMaterialsUpdateRequestSchema,
} from "./schemas/application-materials.js";
import type {
  applicationTimelineEventSchema,
  applicationTimelineResponseSchema,
} from "./schemas/application-timeline.js";
import type {
  assistantHypothesisSchema,
  assistantMemoryResponseSchema,
} from "./schemas/assistant-memory.js";
export type ListingStats = z.infer<typeof listingStatsSchema>;
import type {
  jobListResponseSchema,
  jobRecordSchema,
  jobResponseSchema,
  prepareJobResponseSchema,
} from "./schemas/jobs.js";
import type {
  applicationRecoveryActionSchema,
  applicationSubmissionSummarySchema,
  pipelineItemSchema,
  pipelineResponseSchema,
} from "./schemas/pipeline.js";
import type {
  applicationSubmittedAnswerSchema,
  applicationSubmittedRecordSchema,
} from "./schemas/application-record.js";
import type {
  listingsResponseSchema,
  publicListingSchema,
  recommendedListingSchema,
  recommendedListingsResponseSchema,
} from "./schemas/listings.js";
import type {
  profileAnalysisResponseSchema,
  profileGetResponseSchema,
  profileRecordSchema,
} from "./schemas/profile.js";
import type { statsResponseSchema } from "./schemas/stats.js";
import type {
  applicationUsageResponseSchema,
  generationModelUpdateRequestSchema,
  generationModelUpdateResponseSchema,
  meResponseSchema,
  onboardingIncompleteResponseSchema,
  packUsageResponseSchema,
} from "./schemas/users.js";

/** Inferred wire types for API/MCP consumers. */
export type ApplicationMaterials = z.infer<typeof applicationMaterialsSchema>;
export type ApplicationMaterialsResponse = z.infer<
  typeof applicationMaterialsResponseSchema
>;
export type ApplicationMaterialsUpdateRequest = z.infer<
  typeof applicationMaterialsUpdateRequestSchema
>;
export type ApplicationTimelineEvent = z.infer<
  typeof applicationTimelineEventSchema
>;
export type ApplicationTimelineResponse = z.infer<
  typeof applicationTimelineResponseSchema
>;
export type AssistantHypothesis = z.infer<typeof assistantHypothesisSchema>;
export type AssistantMemoryResponse = z.infer<
  typeof assistantMemoryResponseSchema
>;
export type JobRecord = z.infer<typeof jobRecordSchema>;
export type JobListResponse = z.infer<typeof jobListResponseSchema>;
export type JobResponse = z.infer<typeof jobResponseSchema>;
export type PrepareJobResponse = z.infer<typeof prepareJobResponseSchema>;
export type PipelineItem = z.infer<typeof pipelineItemSchema>;
export type PipelineResponse = z.infer<typeof pipelineResponseSchema>;
export type ApplicationRecoveryAction = z.infer<
  typeof applicationRecoveryActionSchema
>;
export type ApplicationSubmissionSummary = z.infer<
  typeof applicationSubmissionSummarySchema
>;
export type ApplicationSubmittedAnswer = z.infer<
  typeof applicationSubmittedAnswerSchema
>;
export type ApplicationSubmittedRecord = z.infer<
  typeof applicationSubmittedRecordSchema
>;
export type ProfileRecord = z.infer<typeof profileRecordSchema>;
export type ProfileGetResponse = z.infer<typeof profileGetResponseSchema>;
export type ProfileAnalysisResponse = z.infer<
  typeof profileAnalysisResponseSchema
>;
export type PublicListing = z.infer<typeof publicListingSchema>;
export type ListingsResponse = z.infer<typeof listingsResponseSchema>;
export type RecommendedListing = z.infer<typeof recommendedListingSchema>;
export type RecommendedListingsResponse = z.infer<
  typeof recommendedListingsResponseSchema
>;
export type StatsResponse = z.infer<typeof statsResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type OnboardingIncompleteResponse = z.infer<
  typeof onboardingIncompleteResponseSchema
>;
export type ApplicationUsageResponse = z.infer<
  typeof applicationUsageResponseSchema
>;
export type PackUsageResponse = z.infer<typeof packUsageResponseSchema>;
export type GenerationModelUpdateRequest = z.infer<
  typeof generationModelUpdateRequestSchema
>;
export type GenerationModelUpdateResponse = z.infer<
  typeof generationModelUpdateResponseSchema
>;

export {
  filteredMailDetailResponseSchema,
  filteredMailItemSchema,
  filteredMailListResponseSchema,
  filteredMailShowLabelSchema,
  filteredMailShowRequestSchema,
  type FilteredMailShowLabel,
} from "./schemas/filtered-mail.js";
export { conversationMessageContentSchema, type ConversationMessageContent, type EmailReplyAttachment } from "./schemas/messages.js";
export type { AdminSupportAssignment, AdminSupportAssignee } from "./admin-support.js";

export type { AdminSupportReplyRequest } from "./schemas/admin-support.js";

export { communicationPreferencesResponseSchema, communicationPreferencesUpdateRequestSchema, productActivityRequestSchema, type CommunicationPreferencesResponse, type CommunicationPreferencesUpdateRequest } from "./schemas/users.js";
