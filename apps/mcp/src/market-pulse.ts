import {
  RECOMMENDATION_FETCH_BUFFER,
  buildMarketPulseOutput,
  buildTopHiringCompaniesOutput,
  marketPulseInputSchema,
  marketPulseOutputSchema,
  topHiringCompaniesInputSchema,
  topHiringCompaniesOutputSchema,
  topHiringCompaniesQuery,
} from "@jobless/assistant-contracts";

/**
 * `get_market_pulse` and `get_top_hiring_companies`: public research data the
 * website already serves (`/research/index`, `/research/layoffs`), reshaped
 * for an advisor agent.
 *
 * The agent's edge over a model's training cutoff is fresh corpus data: who
 * is hiring this week, who is pulling back, where layoffs are concentrating.
 * Both routes answer from the twice-daily precomputed research snapshot, so a
 * call is cheap and the data is at most ~12h old (generatedAt says which).
 *
 * The projection lives in `@jobless/assistant-contracts`
 * (`buildMarketPulseOutput`, `buildTopHiringCompaniesOutput`) — the same
 * builders the site assistant's executors run — so the two surfaces cannot
 * drift. What remains here is only the HTTP shape the MCP ApiClient speaks:
 * the origin for company URLs and the thin fetch wrappers below.
 */

/** The web origin for company URLs, a published-artifact default like the API origin. */
const DREAMWORK_WEB_ORIGIN =
  process.env.DREAMWORK_WEB_URL?.replace(/\/+$/, "") ?? "https://www.dreamworkhq.com";

interface Fetcher {
  get: (path: string) => Promise<unknown>;
}

export { marketPulseInputSchema, topHiringCompaniesInputSchema };

export async function fetchMarketPulse(
  api: Fetcher,
): Promise<ReturnType<typeof buildMarketPulseOutput>> {
  // No `country` param on purpose: the index route applies country ONLY to
  // `filtered.rows`/`filtered.matched`, while every figure this tool reads
  // (totals, weeklyMovement, standout, coverage) is scope-invariant — a
  // country param would change nothing while the output claimed it did.
  // Country-scoped questions belong in get_top_hiring_companies, whose rows
  // DO lens (openRoles becomes country-located roles, matched the country's
  // companies).
  const [indexBody, layoffsBody] = await Promise.all([
    api.get("/research/index?sort=active&limit=1"),
    api.get("/research/layoffs"),
  ]);
  return buildMarketPulseOutput({
    index: indexBody,
    layoffs: (layoffsBody as { layoffs?: unknown }).layoffs ?? null,
  });
}

export async function fetchTopHiringCompanies(
  api: Fetcher,
  input: {
    function?: string;
    country?: string;
    trend?: string;
    limit?: number;
  },
): Promise<ReturnType<typeof buildTopHiringCompaniesOutput>> {
  const limit = input.limit ?? 15;
  // Over-fetch by the promotion-gate buffer so review-blocked companies can
  // be excluded without short-delivering the requested count (the builder
  // owns the gate).
  const fetchLimit = Math.min(500, limit * RECOMMENDATION_FETCH_BUFFER);
  const body = await api.get(
    `/research/index${topHiringCompaniesQuery({
      function: input.function,
      country: input.country,
      trend: input.trend,
      fetchLimit,
    })}`,
  );
  return buildTopHiringCompaniesOutput(body, limit, DREAMWORK_WEB_ORIGIN);
}

export { marketPulseOutputSchema, topHiringCompaniesOutputSchema };
