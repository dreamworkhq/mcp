import { z } from "zod";

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

/** Case, spaces, hyphens and underscores do not distinguish two spellings. */
function spellingKey(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * The label a spelling names, or `null` when it names none. "marketing" is
 * Marketing, and "data-science", "data_science" and "DATA SCIENCE" are all
 * Data Science; "growth" is nothing.
 */
export function canonicalJobFunction(value: string): JobFunction | null {
  const wanted = spellingKey(value);
  return JOB_FUNCTIONS.find((label) => spellingKey(label) === wanted) ?? null;
}

/**
 * One job function as a tool input. It advertises the labels as its enum and
 * parses any spelling `canonicalJobFunction` resolves to the label, so a tool
 * that takes a function cannot disagree with another about its format. A
 * spelling that names no function fails with the labels listed.
 */
export const jobFunctionInputSchema = z.preprocess(
  (value) =>
    typeof value === "string" ? (canonicalJobFunction(value) ?? value) : value,
  z.enum(JOB_FUNCTIONS),
);

/** How every tool that filters by function describes the spellings it reads. */
export const JOB_FUNCTION_INPUT_HINT =
  'Case, spaces and hyphens are ignored: "data-science" is read as Data Science.';
