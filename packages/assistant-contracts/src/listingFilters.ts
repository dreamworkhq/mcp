/**
 * The listing-filter vocabularies an agent can name, beside the job functions
 * in `jobFunctions.ts`.
 *
 * Restated here because this package cannot import the API or the web app,
 * and two callers refuse a label outside these lists by name instead of
 * letting a route drop it: the `list_matches` handler, and the hand-written
 * MCP tool `browse_listings`, which runs in a CLI that has only this package.
 * A route that meets a label it does not know ignores it and serves the
 * unfiltered set, which reads to the person as a filter that worked.
 */

/**
 * The Matches feed's seniority labels. Source of truth: `SENIORITY_CHIPS` in
 * `apps/web/src/lib/matchChipFilters.ts`; the API expands each one into
 * stored levels through `SENIORITY_CHIP_LEVELS`.
 */
export const MATCH_SENIORITIES = [
  "Junior",
  "Mid-Level",
  "Senior",
  "Staff+",
  "Director+",
] as const;

export type MatchSeniority = (typeof MATCH_SENIORITIES)[number];

/** The work settings a listing presents. A posting that states none counts
 *  as onsite, which is what its card prints. */
export const WORK_SETTINGS = ["remote", "hybrid", "onsite"] as const;

export type WorkSetting = (typeof WORK_SETTINGS)[number];

/**
 * Canonical employer industries. Source of truth: `INDUSTRIES` in
 * `apps/api/src/company-registry/industries.ts`, and
 * `apps/api/src/tests/industries-parity.test.ts` holds this copy to it.
 */
export const LISTING_INDUSTRIES = [
  "Software & Technology",
  "Financial Services",
  "Insurance",
  "Healthcare & Hospitals",
  "Pharma & Biotech",
  "Consulting & Professional Services",
  "Retail & Consumer Goods",
  "Manufacturing & Industrial",
  "Media & Entertainment",
  "Education",
  "Government & Public Sector",
  "Nonprofit & NGO",
  "Energy & Utilities",
  "Telecommunications",
  "Transportation & Logistics",
  "Real Estate & Construction",
  "Aerospace & Defense",
  "Hospitality & Travel",
  "Agriculture & Food",
  "Legal",
  "Marketing & Advertising",
  "Other",
] as const;

export type ListingIndustry = (typeof LISTING_INDUSTRIES)[number];

/**
 * The seniority label a word names: case, spacing, hyphens and the trailing
 * `+` are ignored, so "staff" is Staff+ and "mid level" is Mid-Level. Anything
 * else is `null`, never the nearest label.
 */
export function canonicalMatchSeniority(value: string): MatchSeniority | null {
  const key = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
  const wanted = key(value);
  if (!wanted) return null;
  return MATCH_SENIORITIES.find((label) => key(label) === wanted) ?? null;
}

/** The API's own industry key: case, `&`/`/` and runs of space collapse. */
function industryKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[&/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The industry a name spells, by the same rule the API's `toCanonicalIndustry`
 * applies, so a name accepted here is one the route filters by.
 */
export function canonicalListingIndustry(
  value: string,
): ListingIndustry | null {
  const wanted = industryKey(value);
  if (!wanted) return null;
  return (
    LISTING_INDUSTRIES.find((label) => industryKey(label) === wanted) ?? null
  );
}
