import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { ApiClient } from "../src/client.js";
import { fetchMarketPulse } from "../src/market-pulse.js";
import { createMcpServer } from "../src/mcp.js";

/**
 * The CALLERS of the shared market builders, fed the research routes' FULL
 * responses.
 *
 * WHY THIS FILE EXISTS. The builders in `@jobless/assistant-contracts` were
 * tested the day they were written, and every builder test passed while the
 * published package was broken: the bug lived in the callers, which
 * pre-unwrapped `body.layoffs` before a builder whose schema expects the
 * whole route response. `get_market_pulse` failed on every call, live, with
 * the builder suite green (review finding). This test runs the MCP fetcher
 * itself against a route-shaped fixture, so restoring the unwrap here fails
 * this file instead of a person's conversation.
 */

// Fixture shaped from the live production response of /research/layoffs and
// /research/index (verified 2026-10-20): every key at the level the builder
// reads.
const indexRouteBody = {
  coverage: {
    jobsIndexed: 3_626_813,
    addedLast60d: 400_000,
    firstIndexedAt: "2024-01-01",
  },
  totals: {
    companies: 41_874,
    activeRoles: 774_415,
    newLast7d: 199_541,
    growingCount: 14_065,
    contractingCount: 5_830,
    medianSalary: 132_000,
    aiRoles: 120_000,
  },
  weeklyMovement: { hiringUp: 1_200, pullingBack: 800 },
  standout: {
    domain: "example.com",
    name: "Example",
    currentRoles: 410,
    pct: 74.5,
    addedRoles: 175,
    searchPromotionAllowed: true,
  },
  filtered: { matched: 0, rows: [] },
  query: {},
  generatedAt: "2026-10-20T17:01:43.740Z",
};

const layoffsRouteBody = {
  layoffs: {
    totals: {
      impacted: 87_707,
      companies: 60,
      events: 70,
      matched: 40,
      days: 90,
    },
    recent: [
      {
        company: "Example Corp",
        domain: "examplecorp.com",
        laidOff: 250,
        workforcePct: 5,
        date: "2026-10-18",
        industry: "Technology",
        source: "https://example.com",
        country: "US",
        inIndex: true,
      },
    ],
    industries: [{ industry: "Technology", impacted: 30_000, events: 20 }],
    topCompanies: [
      {
        company: "Example Corp",
        domain: "examplecorp.com",
        totalLaidOff: 5_000,
        eventCount: 2,
        latestDate: "2026-10-18",
        industry: "Technology",
        latestSource: "https://example.com",
        inIndex: true,
      },
    ],
    windowStart: "2026-07-22",
    windowEnd: "2026-10-20",
    sourceLatestDate: "2026-10-18",
    generatedAt: "2026-10-20T17:01:49.475Z",
  },
};

/** An ApiClient stand-in whose get answers the routes with real shapes. */
function apiServing(responses: Record<string, unknown>) {
  return {
    get: async (path: string) => {
      const body = responses[path];
      assert.ok(body !== undefined, `unexpected path: ${path}`);
      return body;
    },
  };
}

/**
 * Calls the tool through a real MCP client, which checks `structuredContent`
 * against the advertised `outputSchema` the way a host connector does. The
 * advertised object schemas forbid keys they do not list, so a route field
 * the builder passes through (`inIndex`, `latestSource`) fails the call.
 */
test("get_market_pulse answers the routes' FULL responses within its advertised schema", async () => {
  const bodies: Record<string, unknown> = {
    "/research/index?sort=active&limit=1": indexRouteBody,
    "/research/layoffs": layoffsRouteBody,
  };
  const original = globalThis.fetch;
  const server = createMcpServer(new ApiClient("https://api.example.test", ""));
  const client = new Client({ name: "market-pulse-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    globalThis.fetch = (async (url: string) => {
      const { pathname, search } = new URL(url);
      const body = bodies[`${pathname}${search}`];
      assert.ok(body !== undefined, `unexpected request: ${url}`);
      return { status: 200, ok: true, json: async () => body } as Response;
    }) as typeof fetch;
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    // The client validates a call only against a schema it has listed.
    const { tools } = await client.listTools();
    assert.ok(tools.find((tool) => tool.name === "get_market_pulse")?.outputSchema);
    const result = await client.callTool({ name: "get_market_pulse", arguments: {} });
    assert.equal(result.isError, undefined);
    const output = result.structuredContent as Awaited<ReturnType<typeof fetchMarketPulse>>;
    assert.equal(output.hiring.companiesTracked, 41_874);
    // The builder takes the route's whole body; a caller that unwraps
    // `body.layoffs` first fails every call.
    assert.equal(output.layoffs?.peopleImpacted, 87_707);
    assert.equal(output.layoffs?.topCompanies[0]?.company, "Example Corp");
  } finally {
    await client.close();
    await server.close();
    globalThis.fetch = original;
  }
});

test("fetchMarketPulse succeeds when the route stored a legitimate null", async () => {
  const output = await fetchMarketPulse(
    apiServing({
      "/research/index?sort=active&limit=1": indexRouteBody,
      "/research/layoffs": { layoffs: null },
    }),
  );
  assert.equal(output.layoffs, null);
  assert.equal(output.hiring.activeRoles, 774_415);
});
