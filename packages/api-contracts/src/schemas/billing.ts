import { z } from "zod";
import { requestComponent, responseComponent, sharedComponent } from "../registry.js";
import { billingIntervalSchema } from "./common.js";

export const checkoutConflictSchema = responseComponent(
  z.object({
    sessionId: z.string().min(1).max(255),
    url: z.url(),
  }),
  {
    id: "CheckoutConflict",
    description:
      "An owned open checkout that can be resumed or explicitly replaced using its expected session identifier.",
  },
);

export type CheckoutConflict = z.infer<typeof checkoutConflictSchema>;

export const billingCheckoutRequestSchema = requestComponent(
  z.object({
    tier: z.enum(["pro", "dreamer"]),
    billingInterval: billingIntervalSchema
      .optional()
      .describe(
        "Invoice cadence for the new subscription; omitted means month. Offers price a monthly invoice, so a promo code, a Farcaster resume, or the apply-now intent combined with quarter is refused.",
      ),
    recovery: z.literal("farcaster").optional(),
    replaceSessionId: z.string().min(1).max(255).optional(),
    returnTo: z.string().optional(),
    referral: z.string().max(100).optional(),
    promoCode: z.string().max(64).optional(),
    redditAttribution: z.unknown().optional(),
    intent: z
      .literal("apply_now")
      .optional()
      .describe(
        "Which paywall started this checkout. Only the apply-now gate sends it, and only that intent can carry the apply-now trial; every other entry is pay-now.",
      ),
  }),
  {
    id: "BillingCheckoutRequest",
    description:
      "Requested subscription terms. replaceSessionId explicitly authorizes replacement of that owned checkout only. intent names the paywall that opened checkout so the API can attach an entry-specific offer.",
  },
);

export const billingCheckoutResponseSchema = responseComponent(
  z.object({
    url: z.url(),
    offerId: z
      .string()
      .optional()
      .describe(
        "The tracked billing offer the session carries (e.g. the apply-now trial); absent on a plain pay-now checkout. Mirrors Stripe metadata.offerId so the client funnel can tag checkout_started with the same offer the webhook reports.",
      ),
  }),
  {
    id: "BillingCheckoutResponse",
    description: "Stripe-hosted checkout ready to open, either new or reused.",
  },
);

export const billingCheckoutErrorSchema = responseComponent(
  z.object({
    error: z.string(),
    message: z.string().optional(),
    checkoutConflict: checkoutConflictSchema.optional(),
  }),
  {
    id: "BillingCheckoutError",
    description:
      "Checkout rejection. A checkoutConflict supplies safe recovery for one unambiguous owned open session.",
  },
);

export const billingPromoPreviewQuery = {
  code: z
    .string()
    .min(1)
    .max(64)
    .describe("Customer-typed promo code; trimmed and upper-cased server-side."),
};

export const billingPromoCardTermsSchema = responseComponent(
  z.strictObject({
    trialDays: z
      .number()
      .int()
      .nullable()
      .describe("Free days before the first charge; null when the offer has no trial."),
    price: z
      .string()
      .nullable()
      .describe(
        'Monthly amount after any trial while the coupon applies, e.g. "$10"; null when the recurring price is unchanged.',
      ),
    priceNote: z
      .string()
      .describe('Cadence text beside the price, e.g. "/ month forever".'),
    cta: z.string().describe('Primary button label on the card, e.g. "Start 14 days free".'),
  }),
  {
    id: "BillingPromoCardTerms",
    description:
      "How the plan card renders a staged code's discount. All copy is owned by the API beside the coupon it describes; the web places it and never derives pricing itself.",
  },
);

export type BillingPromoCardTerms = z.infer<typeof billingPromoCardTermsSchema>;

export const applyNowTrialOfferSchema = responseComponent(
  z.strictObject({
    offerId: z
      .string()
      .describe("Tracked billing offer id, echoed on checkout_started and Stripe metadata."),
    terms: billingPromoCardTermsSchema,
  }),
  {
    id: "ApplyNowTrialOffer",
    description:
      "The free-trial-first offer checkout will attach when the apply-now paywall starts it. Card copy is owned by the API beside the offer it describes; the web places it.",
  },
);

export type ApplyNowTrialOffer = z.infer<typeof applyNowTrialOfferSchema>;

export const billingPromoPreviewSchema = responseComponent(
  z.discriminatedUnion("status", [
    z.object({
      status: z.literal("valid"),
      code: z.string(),
      hint: z.string(),
      terms: billingPromoCardTermsSchema,
      applicableTiers: z.array(z.enum(["pro", "dreamer"])),
      overridesFounders: z.boolean(),
    }),
    z.object({
      status: z.literal("founders"),
      code: z.string(),
      hint: z.string(),
      applicableTiers: z.array(z.enum(["pro", "dreamer"])),
      overridesFounders: z.boolean(),
    }),
    z.object({
      status: z.enum(["invalid", "expired", "already_redeemed", "not_available"]),
      code: z.string(),
      message: z.string(),
    }),
  ]),
  {
    id: "BillingPromoPreview",
    description:
      "What checkout will do with the code for this account. `valid` stages the code's own terms; `founders` means the auto-applied founders offer wins and the code is ignored; the rest are refusals checkout would also return.",
  },
);

export type BillingPromoPreview = z.infer<typeof billingPromoPreviewSchema>;

export const billingDreamerUpgradeTermsSchema = sharedComponent(
  z.strictObject({
    subscriptionId: z.string().min(1).max(255),
    fromPriceId: z.string().min(1).max(255).describe("The Price the subscription bills at when previewed."),
    toPriceId: z.string().min(1).max(255).describe("The Dreamer list Price the upgrade moves to."),
    trialEnd: z
      .number()
      .int()
      .nullable()
      .describe("Unix seconds the trial ends, or null outside a trial."),
    coupons: z
      .array(z.string().max(255))
      .max(20)
      .describe("Coupon ids the upgrade removes, sorted."),
    prorationDate: z
      .number()
      .int()
      .describe("Unix seconds Stripe prorated the preview at; the upgrade prorates at the same instant."),
  }),
  {
    id: "BillingDreamerUpgradeTerms",
    description:
      "The exact terms a preview priced. The upgrade echoes them back and is refused with billing_upgrade_terms_changed when the subscription no longer matches, so the charge is always the amount the subscriber confirmed.",
  },
);

export type BillingDreamerUpgradeTerms = z.infer<typeof billingDreamerUpgradeTermsSchema>;

export const billingDreamerUpgradePreviewSchema = responseComponent(
  z.strictObject({
    terms: billingDreamerUpgradeTermsSchema,
    interval: billingIntervalSchema.describe(
      "The cadence the subscription bills at today; the upgrade keeps it.",
    ),
    currency: z.string().describe("Lowercase ISO currency code of both amounts."),
    newPriceAmount: z
      .number()
      .int()
      .describe("Dreamer list price per invoice at that cadence, in the currency's minor unit."),
    amountDueToday: z
      .number()
      .int()
      .min(0)
      .describe(
        "Prorated charge the upgrade invoices immediately, in the currency's minor unit: remaining time at the Dreamer list price less unused time at the current rate. 0 during a free trial or when the credit covers it.",
      ),
    discountEnds: z
      .boolean()
      .describe("The subscription carries a discount or coupon that the upgrade removes."),
  }),
  {
    id: "BillingDreamerUpgradePreview",
    description:
      "What upgrading this Pro subscription to Dreamer at list price costs, read from Stripe without changing anything.",
  },
);

export type BillingDreamerUpgradePreview = z.infer<typeof billingDreamerUpgradePreviewSchema>;

export const billingDreamerUpgradeRequestSchema = requestComponent(
  z.strictObject({
    idempotencyKey: z
      .string()
      .regex(/^[A-Za-z0-9-]{16,64}$/)
      .describe(
        "Generated by the client once per confirmation and reused on a repeated click, so a double submit reaches Stripe as one update. A new attempt after a failure sends a new key.",
      ),
    terms: billingDreamerUpgradeTermsSchema,
  }),
  {
    id: "BillingDreamerUpgradeRequest",
    description: "Confirms the upgrade the preview described.",
  },
);

export const billingDreamerUpgradeResponseSchema = responseComponent(
  z.strictObject({
    upgraded: z.literal(true),
    entitlementApplied: z
      .boolean()
      .describe(
        "The account row already reflects Dreamer. False means Stripe accepted the change and the subscription webhook applies it.",
      ),
  }),
  {
    id: "BillingDreamerUpgradeResponse",
    description:
      "Stripe moved the subscription to the Dreamer list price and invoiced the prorated change.",
  },
);

export const billingDreamerUpgradeErrorSchema = responseComponent(
  z.object({
    error: z.string(),
    message: z.string().optional(),
  }),
  {
    id: "BillingDreamerUpgradeError",
    description:
      "Upgrade refusal. `billing_upgrade_use_portal` means the subscription changes plans in the Stripe portal instead; `billing_payment_failed` carries the processor's message and nothing changed; `billing_payment_requires_action` means the card needs 3-D Secure, which this upgrade cannot run, and nothing changed.",
  },
);
