import assert from "node:assert/strict";
import test from "node:test";
import { jobListResponseSchema } from "@jobless/api-contracts";
import { ApiClient, ApiError } from "../src/client.js";

// Bounded runtime decoding of covered success responses.
//
// Two rules, both load-bearing for a published CLI that agents trust:
//   - Additive (unknown) success fields are ACCEPTED and stripped, so a new
//     API field can never break an already-published tarball.
//   - Missing or invalid KNOWN fields FAIL CLOSED, so a half-broken payload is
//     never handed to an agent as if it were the contract.
//
// The failure must stay sanitized: it names the operation and nothing else.
// Neither the payload nor Zod's issue list may reach the agent.

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

const JOB_RECORD = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  userId: "123e4567-e89b-42d3-a456-426614174001",
  title: "Staff Engineer",
  company: "Example Co",
  description: null,
  source: null,
  url: null,
  contactEmail: null,
  applicationMethod: "web" as const,
  metadata: null,
  status: "queued" as const,
  createdAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
};

test("getValidated strips additive top-level fields", async () => {
  const restore = stubFetch({
    status: 200,
    body: { jobs: [], count: 0, futureField: "ignored" },
  });
  try {
    const api = new ApiClient("https://api.example.test", "sk_test");
    const value = await api.getValidated(
      "/jobs",
      "listJobs",
      jobListResponseSchema,
    );
    assert.deepEqual(value, { jobs: [], count: 0 });
  } finally {
    restore();
  }
});

test("getValidated strips additive fields nested inside records", async () => {
  const restore = stubFetch({
    status: 200,
    body: {
      jobs: [{ ...JOB_RECORD, futureNestedField: 42 }],
      count: 1,
    },
  });
  try {
    const api = new ApiClient("https://api.example.test", "sk_test");
    const value = await api.getValidated(
      "/jobs",
      "listJobs",
      jobListResponseSchema,
    );
    assert.deepEqual(value, { jobs: [JOB_RECORD], count: 1 });
  } finally {
    restore();
  }
});

test("getValidated fails closed when a known field is missing", async () => {
  const restore = stubFetch({ status: 200, body: { jobs: [] } });
  try {
    const api = new ApiClient("https://api.example.test", "sk_test");
    await assert.rejects(
      api.getValidated("/jobs", "listJobs", jobListResponseSchema),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 200);
        return true;
      },
    );
  } finally {
    restore();
  }
});

test("getValidated rejects malformed success with a sanitized ApiError", async () => {
  const restore = stubFetch({
    status: 200,
    body: { jobs: "sensitive payload must not leak", count: 0 },
  });
  try {
    const api = new ApiClient("https://api.example.test", "sk_test");
    await assert.rejects(
      api.getValidated("/jobs", "listJobs", jobListResponseSchema),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 200);
        // The operation is named so an operator can find the broken route…
        assert.match(error.message, /listJobs/);
        // …but nothing about the payload or the validator reaches the agent.
        // (A blanket /jobs/i check is impossible here: "listJobs" contains it.)
        assert.doesNotMatch(error.message, /sensitive|payload|leak/i);
        assert.doesNotMatch(
          error.message,
          /zod|invalid_type|invalid_union|expected|received|issue/i,
        );
        return true;
      },
    );
  } finally {
    restore();
  }
});

test("getValidated leaves the existing non-2xx error path untouched", async () => {
  const restore = stubFetch({
    status: 500,
    body: { error: { message: "Something broke upstream" } },
  });
  try {
    const api = new ApiClient("https://api.example.test", "sk_test");
    await assert.rejects(
      api.getValidated("/jobs", "listJobs", jobListResponseSchema),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 500);
        assert.equal(error.message, "Something broke upstream");
        return true;
      },
    );
  } finally {
    restore();
  }
});

test("getValidated sends the same headers as an unvalidated GET", async () => {
  const original = globalThis.fetch;
  let captured: Record<string, string> = {};
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    captured = init.headers as Record<string, string>;
    return {
      status: 200,
      ok: true,
      json: async () => ({ jobs: [], count: 0 }),
    } as Response;
  }) as typeof fetch;
  try {
    const api = new ApiClient("https://api.example.test", "sk_test");
    api.setClientInfo("claude-code", "1.2.0");
    api.setSessionId("install-abc-123");
    await api.getValidated("/jobs", "listJobs", jobListResponseSchema);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(captured["x-dreamwork-surface"], "mcp");
  assert.equal(captured["x-dreamwork-client"], "claude-code/1.2.0");
  assert.equal(captured["x-dreamwork-mcp-session"], "install-abc-123");
  assert.equal(captured.Authorization, "Bearer sk_test");
});
