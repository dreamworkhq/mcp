import type { z } from "zod";

import { setFiltersInput } from "./actions/view.js";

/**
 * What a `set_filters` key costs the person in waiting.
 *
 * `cheap` is a serve-time predicate over the match pool the server already
 * holds — a round trip in milliseconds, and the person watches the feed
 * narrow. `rebuild` re-runs retrieval and re-ranks the whole pool, which is
 * why those two are confirmed before they run and nothing else is.
 *
 * THE AUTHORITY IS ONE FUNCTION. `getRecommendationPoolCacheKey`
 * (`apps/api/src/api/sources.ts`) keys the pool on `[userId, profileVersion,
 * search, function, includeIneligible]`, and its own contract comment says the
 * rest — posted-within, the chips, industry, AI role, location, minScore and
 * sort — are serve-time predicates and orderings over that one pool,
 * deliberately kept out of the key so a filtered request answers from the
 * entry the default feed seeded. If a parameter ever joins that key array, its
 * dimension becomes `rebuild` here.
 *
 * Restated as data rather than derived, because this package cannot import the
 * API. The record is exhaustive over the action's own input, so a filter added
 * to `setFiltersInput` without a cost fails to compile instead of defaulting
 * to cheap and skipping a wait the person would sit through.
 */
export type MatchFilterCost = "cheap" | "rebuild";

type SetFiltersKey = keyof z.infer<typeof setFiltersInput>;

export const MATCH_FILTER_COST: Readonly<Record<SetFiltersKey, MatchFilterCost>> =
  {
    // Matches description-bearing columns the slim pool rows do not carry, so
    // it stays a retrieval predicate and splits the key.
    query: "rebuild",
    // A function chip retrieves roles the similarity pool may never have held
    // (`recommendationFunctionSql`), and it is also the dimension where the
    // assistant replaces a selection the person built by hand.
    functions: "rebuild",
    seniorities: "cheap",
    internships: "cheap",
    aiRoles: "cheap",
    workSetting: "cheap",
    location: "cheap",
    nearMe: "cheap",
    minMatchPercent: "cheap",
    postedWithinDays: "cheap",
    minSalary: "cheap",
    maxSalary: "cheap",
    equity: "cheap",
    bonus: "cheap",
    healthcare: "cheap",
    industry: "cheap",
    scope: "cheap",
    // Ordering, not membership. It re-keys the client's query and re-serves
    // the same pool.
    sort: "cheap",
    // Showing or hiding the panel is a panel, not a predicate. Nothing is
    // re-served at all.
    tray: "cheap",
    // A reset returns the key to the DEFAULT feed, which is the one pool that
    // is persisted and grace-served. Going back to it costs nothing.
    reset: "cheap",
  };

/**
 * The rebuild-class keys a patch actually sets.
 *
 * SETTING one is what costs; clearing is not. Emptying the function selection
 * puts the request back on the default pool key, and the default pool is the
 * persisted one — so `null`, `remove`, and an empty `set` are all cheap, and
 * only a selection that ends up naming a function is not.
 *
 * Takes the action's parsed arguments. A key it does not recognise is ignored
 * rather than treated as a rebuild: the registry's own Zod input has already
 * refused anything the action does not declare.
 */
export function matchFilterRebuildKeys(args: unknown): SetFiltersKey[] {
  if (!args || typeof args !== "object") return [];
  const raw = args as Record<string, unknown>;
  const keys: SetFiltersKey[] = [];

  if (typeof raw.query === "string" && raw.query.trim().length > 0) {
    keys.push("query");
  }

  const functions = raw.functions;
  if (functions && typeof functions === "object" && !Array.isArray(functions)) {
    const selected = functions as Record<string, unknown>;
    const names = [
      ...(Array.isArray(selected.set) ? selected.set : []),
      ...(Array.isArray(selected.add) ? selected.add : []),
    ];
    if (names.length > 0) keys.push("functions");
  }

  return keys;
}
