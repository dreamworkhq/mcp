/**
 * The job-function labels the product speaks, in the exact casing it stores
 * and renders.
 *
 * One list inside this package because two actions need it: `set_filters`
 * narrows the Matches feed by these labels and `update_preferences` writes one
 * to three of them as the person's target functions. Restated here because
 * this package cannot import the web app. Source of truth:
 * `JOB_FUNCTION_OPTIONS` in `apps/web/src/lib/jobPreferences.ts` and
 * `FUNCTION_CHIPS` in `apps/web/src/lib/matchChipFilters.ts`, both mirroring
 * the classifier's `functionPrimary` enum. An enum rather than free text
 * because the profile's select renders a stored `marketing` as blank.
 */
export const JOB_FUNCTIONS = [
  "Engineering",
  "Product",
  "Design",
  "Marketing",
  "Data Science",
  "Sales",
  "Operations",
  "Finance",
  "Legal",
  "HR",
  "Customer Success",
  "DevRel",
  "Security",
  "Research",
  "Executive",
] as const;

export type JobFunction = (typeof JOB_FUNCTIONS)[number];

/**
 * The label a person's word names, ignoring case and surrounding space, or
 * `null` when it names none. "marketing" is Marketing; "growth" is nothing.
 */
export function canonicalJobFunction(value: string): JobFunction | null {
  const wanted = value.trim().toLowerCase();
  return JOB_FUNCTIONS.find((label) => label.toLowerCase() === wanted) ?? null;
}
