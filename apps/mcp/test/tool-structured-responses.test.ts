import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ApiClient } from "../src/client.js";
import { createMcpServer } from "../src/mcp.js";

// End-to-end structured-output behavior for the hand-written API-backed tools that are
// covered by a canonical wire contract. Driven over a real MCP handshake with
// a stubbed API so the assertions describe what an agent actually receives.
//
// The serialized text result is preserved for older clients and must always
// carry exactly the same payload as `structuredContent`.

type StubResponse = { status: number; body: unknown };

function stubFetch(response: StubResponse): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      json: async () => response.body,
    }) as Response) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

async function connectPair(api: ApiClient) {
  const server = createMcpServer(api);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "structured-test", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

function firstText(result: { content?: unknown }): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content?.[0]?.text ?? "";
}

async function callWithStub(
  name: string,
  args: Record<string, unknown>,
  response: StubResponse,
) {
  const restore = stubFetch(response);
  try {
    const api = new ApiClient("https://api.example.test", "sk_test");
    const { client, close } = await connectPair(api);
    const result = await client.callTool({ name, arguments: args });
    await close();
    return result;
  } finally {
    restore();
  }
}

// ── Fixtures: one valid wire payload per canonical response schema ──────

const UUID_A = "123e4567-e89b-42d3-a456-426614174000";
const UUID_B = "123e4567-e89b-42d3-a456-426614174001";
const ISO = "2026-07-24T00:00:00.000Z";

const PROFILE_RESPONSE = {
  profile: {
    id: UUID_A,
    userId: UUID_B,
    name: "Ada Lovelace",
    nameStatus: "resolved" as const,
    email: "ada@example.test",
    phone: null,
    phoneDialCode: null,
    resumeText: null,
    resumeUrl: null,
    profileIdentityVersion: 1,
    preferences: { roles: ["Engineering"], remote: true },
    tonePreferences: null,
    createdAt: ISO,
    updatedAt: ISO,
  },
  prefsVerifyPending: false,
};

const STATS_RESPONSE = {
  jobs: { total: 3, queued: 1, applied: 1, failed: 1, skipped: 0 },
  applications: {
    total: 2,
    applied: 1,
    conversing: 0,
    interview: 0,
    escalated: 0,
    failed: 1,
    avgFitScore: "72.50",
    successRate: 50,
  },
  escalations: { total: 0, pending: 0, resolved: 0 },
  outreach: { total: 0, sent: 0, replied: 0, draft: 0 },
};

const PUBLIC_LISTING = {
  id: UUID_A,
  title: "Staff Engineer",
  companyName: "Example Co",
  companyDomain: "example.test",
  companyLogoUrl: null,
  companyDescription: null,
  isDreamwork500: false,
  location: "Remote",
  locationCountryCode: "US",
  remoteType: "remote",
  remoteEligibilityCountries: ["US"],
  remoteEligibilitySource: "parsed" as const,
  remoteEligibilityConfidence: "high" as const,
  salary: "$200k",
  salaryMin: 180000,
  salaryMax: 220000,
  salarySource: "posting",
  salaryCurrency: "USD",
  salaryPeriod: "year",
  salaryLocalMin: 180000,
  salaryLocalMax: 220000,
  salaryIsOte: false,
  department: "Engineering",
  sourceUrl: "https://example.test/jobs/1",
  platform: "greenhouse",
  postedAt: ISO,
  sourceUpdatedAt: ISO,
  firstSeenAt: ISO,
  createdAt: ISO,
  functionPrimary: "engineering",
  seniorityLevel: "staff",
  techStack: ["TypeScript"],
  hasEquity: true,
  hasBonus: null,
  hasHealthcare: true,
  isAiRole: false,
  aiRoleKind: null,
  aiRoleConfidence: null,
  aiRoleReason: null,
};

const NYC = {
  kind: "radius" as const,
  city: "New York",
  regionCode: "NY",
  countryCode: "US",
  countryCodes: null,
  radiusKm: 50,
};

/** Each covered tool with a valid fixture for the operation it calls. */
const STRUCTURED_CASES = [
  { tool: "get_profile", args: {}, body: PROFILE_RESPONSE },
  { tool: "get_stats", args: {}, body: STATS_RESPONSE },
] as const;

for (const { tool, args, body } of STRUCTURED_CASES) {
  test(`${tool} returns structuredContent matching its serialized text`, async () => {
    const result = await callWithStub(tool, args, { status: 200, body });
    assert.equal(result.isError, undefined, firstText(result));
    assert.ok(result.structuredContent, `${tool}: expected structuredContent`);
    assert.deepEqual(result.structuredContent, body);
    assert.deepEqual(JSON.parse(firstText(result)), result.structuredContent);
  });
}

// A production profile carried its 3.4 MB resume PDF as a data: URI, so
// get_profile answered 4.6 MB. resumeText already holds the contents.
test("get_profile withholds an inline resume file and keeps a linked one", async () => {
  const inline = {
    ...PROFILE_RESPONSE,
    profile: { ...PROFILE_RESPONSE.profile, resumeText: "Resume", resumeUrl: "data:application/pdf;base64,cGRm" },
  };
  const result = await callWithStub("get_profile", {}, { status: 200, body: inline });
  assert.equal(result.isError, undefined, firstText(result));
  assert.deepEqual(result.structuredContent, {
    ...inline,
    profile: { ...inline.profile, resumeUrl: null },
  });
  assert.ok(!firstText(result).includes("base64"));

  const linked = {
    ...PROFILE_RESPONSE,
    profile: { ...PROFILE_RESPONSE.profile, resumeUrl: "https://files.example.test/r.pdf" },
  };
  const linkedResult = await callWithStub("get_profile", {}, { status: 200, body: linked });
  assert.deepEqual(linkedResult.structuredContent, linked);
});

test("untyped resume and profile proxies withhold PDFs and data: URIs at any depth", async () => {
  const resumes = await callWithStub(
    "get_generated_resumes",
    { applicationId: UUID_A },
    { status: 200, body: { resumes: [{ id: UUID_B, html: "<p>r</p>", pdfBase64: "cGRm" }] } },
  );
  assert.deepEqual(JSON.parse(firstText(resumes)), {
    resumes: [{ id: UUID_B, html: "<p>r</p>", pdfBase64: null }],
  });

  const updated = await callWithStub(
    "update_profile",
    { tonePreferences: "warm" },
    { status: 200, body: { profile: { id: UUID_A, resumeUrl: "data:application/pdf;base64,cGRm", resumeText: "Resume" } } },
  );
  assert.deepEqual(JSON.parse(firstText(updated)), {
    profile: { id: UUID_A, resumeUrl: null, resumeText: "Resume" },
  });
});

// ── Additive compatibility ─────────────────────────────────────────────

test("unknown additive success fields are accepted and stripped everywhere", async () => {
  const result = await callWithStub(
    "get_stats",
    {},
    {
      status: 200,
      body: {
        ...STATS_RESPONSE,
        jobs: { ...STATS_RESPONSE.jobs, futureCountField: "additive" },
        futureTopLevelField: "additive",
      },
    },
  );

  assert.equal(result.isError, undefined, firstText(result));
  assert.deepEqual(result.structuredContent, STATS_RESPONSE);
  assert.deepEqual(JSON.parse(firstText(result)), STATS_RESPONSE);
  assert.ok(
    !firstText(result).includes("additive"),
    "stripped fields must not survive in the serialized text either",
  );
});

// ── browse_listings: paging and refused filters ────────────────────────

/**
 * Several calls on one connection against a scripted API, recording the path
 * of every request that reached it. A refused call must add no path.
 */
async function browseSequence(
  calls: Array<{ args: Record<string, unknown>; body?: unknown }>,
) {
  const paths: string[] = [];
  const bodies = calls.flatMap((call) =>
    call.body === undefined ? [] : [call.body],
  );
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    paths.push(new URL(String(url)).search);
    const body = bodies.shift();
    return { status: 200, ok: true, json: async () => body } as Response;
  }) as typeof fetch;
  try {
    const { client, close } = await connectPair(
      new ApiClient("https://api.example.test", ""),
    );
    const results = [];
    for (const call of calls) {
      results.push(
        await client.callTool({ name: "browse_listings", arguments: call.args }),
      );
    }
    await close();
    return { results, paths };
  } finally {
    globalThis.fetch = original;
  }
}

test("browse_listings pages with its own cursor and refuses it for another search", async () => {
  const search = {
    function: ["Engineering"],
    minSalary: 200000,
    location: "New York",
    postedWithinDays: 7,
  };
  const inventoryPage = (nextCursor: string | null) => ({
    listings: [PUBLIC_LISTING],
    nextCursor,
    appliedLocation: null,
    locationFilter: NYC,
  });
  const { results, paths } = await browseSequence([
    { args: search, body: inventoryPage("api-cursor-1") },
  ]);
  const first = results[0]!;
  assert.equal(first.isError, undefined, firstText(first));
  const page = first.structuredContent as {
    listings: Array<Record<string, unknown>>;
    nextCursor: string | null;
    appliedFilters: Record<string, unknown>;
  };
  assert.deepEqual(page.listings[0], {
    id: UUID_A,
    title: "Staff Engineer",
    company: "Example Co",
    location: "Remote",
    workSetting: "remote",
    salary: "$200k",
    salaryMin: 180000,
    salaryMax: 220000,
    postedAt: ISO,
    firstSeenAt: ISO,
    url: `https://www.dreamworkhq.com/job/${UUID_A}`,
    sourceUrl: "https://example.test/jobs/1",
  });
  assert.deepEqual(JSON.parse(firstText(first)), first.structuredContent);
  assert.deepEqual(page.appliedFilters.location, NYC);
  // An unsorted walk is the route's complete inventory walk, and pay reaches
  // the route in the thousands it filters by.
  const firstQuery = new URLSearchParams(paths[0]);
  assert.equal(firstQuery.get("pagination"), "cursor");
  assert.equal(firstQuery.get("minSalary"), "200");
  assert.ok(page.nextCursor);

  const next = await browseSequence([
    { args: { ...search, cursor: page.nextCursor }, body: inventoryPage(null) },
    { args: { ...search, minSalary: 150000, cursor: page.nextCursor } },
  ]);
  assert.equal(next.results[0]!.isError, undefined, firstText(next.results[0]!));
  assert.equal(new URLSearchParams(next.paths[0]).get("cursor"), "api-cursor-1");
  assert.equal(
    (next.results[0]!.structuredContent as { nextCursor: unknown }).nextCursor,
    null,
  );
  // Same cursor, different floor: refused before any request.
  assert.equal(next.results[1]!.isError, true);
  assert.match(firstText(next.results[1]!), /different search/);
  assert.equal(next.paths.length, 1);
});

test("a sorted browse pages by the clamped page size, not what came back", async () => {
  const offsetPage = (count: number, total: number, pageSize: number) => ({
    listings: Array.from({ length: count }, () => PUBLIC_LISTING),
    count: total,
    total,
    totalCapped: false,
    pageSize,
    appliedLocation: null,
    locationFilter: null,
  });
  const { results, paths } = await browseSequence([
    { args: { sort: "newest", limit: 100 }, body: offsetPage(25, 30, 25) },
  ]);
  const cursor = (results[0]!.structuredContent as { nextCursor: string })
    .nextCursor;
  // A key-less caller asked for 100, the API clamped to its 25 and selected
  // 25 rows, and one of them retired during hydration: the page came back
  // with 24. The cursor advances by the 25 the API SELECTED: by the rows
  // received the retired row's neighbor would repeat, by the 100 asked it
  // would skip.
  const short = await browseSequence([
    { args: { sort: "newest", limit: 100 }, body: offsetPage(24, 30, 25) },
  ]);
  const shortCursor = (
    short.results[0]!.structuredContent as { nextCursor: string }
  ).nextCursor;
  assert.equal(new URLSearchParams(paths[0]).get("sort"), "newest");
  const second = await browseSequence([
    {
      args: { sort: "newest", limit: 100, cursor: shortCursor },
      body: offsetPage(5, 30, 25),
    },
  ]);
  assert.equal(new URLSearchParams(second.paths[0]).get("offset"), "25");
  assert.equal(
    (second.results[0]!.structuredContent as { nextCursor: unknown })
      .nextCursor,
    null,
  );
});

test("browse_listings refuses a filter the route could not apply", async () => {
  const { results, paths } = await browseSequence([
    {
      args: { location: "Qwzxv" },
      body: {
        listings: [PUBLIC_LISTING],
        nextCursor: null,
        appliedLocation: null,
        locationFilter: null,
      },
    },
    // 1.x took thousands; a bare 150 is refused rather than read as $150.
    { args: { minSalary: 150 } },
    { args: { industry: "Crypto" } },
  ]);
  assert.equal(results[0]!.isError, true);
  assert.match(firstText(results[0]!), /not a place Dreamwork recognizes/);
  assert.equal(results[1]!.isError, true);
  assert.match(firstText(results[1]!), /annual US dollars/);
  assert.equal(results[2]!.isError, true);
  assert.match(firstText(results[2]!), /Pharma & Biotech/);
  assert.equal(paths.length, 1);
});

// ── Fail-closed on malformed known fields ──────────────────────────────

test("a malformed 200 fails closed as a sanitized isError result", async () => {
  const result = await callWithStub(
    "get_stats",
    {},
    {
      status: 200,
      body: { jobs: "sensitive resume text must not leak" },
    },
  );

  assert.equal(result.isError, true);
  assert.equal(
    result.structuredContent,
    undefined,
    "a failed decode must never emit structured content",
  );

  const text = firstText(result);
  assert.match(text, /malformed data for getStats/);
  // No payload contents and no validator internals reach the agent.
  assert.doesNotMatch(text, /sensitive|resume text|leak/i);
  assert.doesNotMatch(
    text,
    /zod|invalid_type|invalid_union|expected|received|issue/i,
  );
});

test("a missing known field fails closed rather than returning a partial payload", async () => {
  const result = await callWithStub(
    "get_stats",
    {},
    {
      status: 200,
      body: { jobs: STATS_RESPONSE.jobs },
    },
  );

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent, undefined);
  assert.match(firstText(result), /malformed data for getStats/);
});
