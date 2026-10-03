import type { ContextEnvelope } from "./envelope.js";

/**
 * Matching a person's words to a filter value the page actually has.
 *
 * The page publishes its controls and their values in the envelope. This is
 * the other half: turning "Pharma and biotech", "pharma", or "biotech" into
 * the one string the tray recognises — `Pharma & Biotech` — without asking the
 * model to reproduce an ampersand it was never shown.
 *
 * It lives beside the envelope schema because that is where the value list is
 * authoritative. Matching in the model would be guessing; matching in the
 * browser would be too late, because by then the argument has already been
 * reported as sent. This runs on the one path every action goes through.
 *
 * Nothing here is fuzzy in the sense of "close enough". Every rule below is a
 * rewrite of the SAME name — punctuation, case, `and` for `&` — or a word the
 * value itself contains. A phrase that matches two values is refused and both
 * are named, because picking one for somebody is how a filter they did not ask
 * for ends up on their screen.
 */

export type FilterDimension = NonNullable<
  ContextEnvelope["filters"]["dimensions"]
>[number];

export type FilterValueMatch =
  | { ok: true; value: string }
  | {
      ok: false;
      /** `absent` is a control this build does not have; `unmatched` is a
       *  control it has that carries no such value. */
      reason: "absent" | "unmatched" | "ambiguous";
      /** The sentence the person gets. It names what IS available, because
       *  "that isn't a filter" without the alternatives ends the exchange. */
      message: string;
      /** What the model should do instead, in its own terms. */
      modelHint: string;
    };

/** Letters and digits only, lower case, with `&` read as the word it is said
 *  as. "Pharma & Biotech" and "pharma and biotech" collapse to one string. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The words of a name, minus the ones that carry no meaning on their own. */
function words(value: string): string[] {
  const skip = new Set(["and", "the", "of"]);
  return normalize(value)
    .split(" ")
    .filter((word) => word.length > 0 && !skip.has(word));
}

function listValues(values: readonly string[]): string {
  return values.join(", ");
}

/**
 * The published value a person's words name, or a refusal that says what the
 * page does have.
 *
 * `dimensions` is the envelope's own list, so a build without the control has
 * no entry and the answer is `absent` rather than a guess.
 */
export function resolveFilterValue(
  dimensions: readonly FilterDimension[] | undefined,
  key: string,
  spoken: string,
): FilterValueMatch {
  const dimension = dimensions?.find((entry) => entry.key === key);
  if (!dimension || !dimension.values || dimension.values.length === 0) {
    return {
      ok: false,
      reason: "absent",
      // "This page", not "this build". The Matches route publishes nothing
      // while it is the landing or the no-resume state, and a build with the
      // control is not a build without it.
      message: `This page has no ${key} filter, so I have left the feed as it is.`,
      modelHint: `${key} is not in the situation's filter list, so this page does not offer it. Tell the person plainly that it is not a filter here; do not send this key again and do not set a different filter instead.`,
    };
  }

  const wanted = normalize(spoken);
  if (!wanted) {
    return {
      ok: false,
      reason: "unmatched",
      message: `I need a ${dimension.label.toLowerCase()} to filter by.`,
      modelHint: `Empty ${key}. The values are: ${listValues(dimension.values)}.`,
    };
  }

  const exact = dimension.values.filter((value) => normalize(value) === wanted);
  if (exact.length === 1) return { ok: true, value: exact[0]! };

  // Every significant word they said is a word of the value. This is what
  // turns "pharma" and "biotech" into "Pharma & Biotech" without turning
  // "tech" into "Software & Technology", which is a different word.
  const spokenWords = words(spoken);
  const contained = dimension.values.filter((value) => {
    const valueWords = new Set(words(value));
    return (
      spokenWords.length > 0 &&
      spokenWords.every((word) => valueWords.has(word))
    );
  });
  if (contained.length === 1) return { ok: true, value: contained[0]! };
  if (contained.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      message: `"${spoken}" could mean ${listValues(contained)}. Which did you want?`,
      modelHint: `${key} "${spoken}" matches more than one value: ${listValues(contained)}. Ask which, naming them; do not pick one.`,
    };
  }

  return {
    ok: false,
    reason: "unmatched",
    message: `There is no "${spoken}" ${dimension.label.toLowerCase()} filter. The ones there are: ${listValues(dimension.values)}.`,
    modelHint: `${key} "${spoken}" is not one of this page's values. They are: ${listValues(dimension.values)}. Pick the one that covers what they asked for, or tell them none of them does.`,
  };
}

/**
 * The `set_filters` keys that take a free string AND have a published value
 * list, which is the only combination this resolver can help with.
 *
 * Everything else in that action is already an enum the registry's own Zod
 * input refuses — a function or seniority the tray does not have never reaches
 * a page. `industry` is a string because the list is flag-dependent and could
 * not honestly be frozen into the schema, which is exactly why it needs this.
 */
export const RESOLVABLE_FILTER_KEYS = ["industry"] as const;

export type ResolvableFilterKey = (typeof RESOLVABLE_FILTER_KEYS)[number];

export type FilterArgumentResolution =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; key: ResolvableFilterKey; refusal: Extract<FilterValueMatch, { ok: false }> };

/**
 * Rewrite a `set_filters` patch so every free-string value is one the page
 * published, or refuse with the reason.
 *
 * A key set to `null` is a clear, not a value, and passes through untouched.
 */
export function resolveFilterArguments(
  dimensions: readonly FilterDimension[] | undefined,
  args: unknown,
): FilterArgumentResolution {
  if (!args || typeof args !== "object") {
    return { ok: true, args: {} };
  }
  // A surface that published NOTHING has not said it lacks anything, so there
  // is nothing here to resolve against and nothing to refuse on. The patch
  // travels as it is, and the page answers for its own controls.
  if (dimensions === undefined) {
    return { ok: true, args: { ...(args as Record<string, unknown>) } };
  }
  const next = { ...(args as Record<string, unknown>) };
  for (const key of RESOLVABLE_FILTER_KEYS) {
    const value = next[key];
    if (typeof value !== "string" || value.trim() === "") continue;
    const match = resolveFilterValue(dimensions, key, value);
    if (!match.ok) return { ok: false, key, refusal: match };
    next[key] = match.value;
  }
  return { ok: true, args: next };
}
