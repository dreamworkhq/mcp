import assert from "node:assert/strict";
import test from "node:test";
import { ApiClient, formatApiErrorMessage } from "../src/client.js";

// Capture the headers ApiClient.request() sends by stubbing global fetch.
async function captureHeaders(
  configure: (api: ApiClient) => void,
): Promise<Record<string, string>> {
  const original = globalThis.fetch;
  let captured: Record<string, string> = {};
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    captured = init.headers as Record<string, string>;
    return {
      status: 200,
      ok: true,
      json: async () => ({}),
    } as Response;
  }) as typeof fetch;
  try {
    const api = new ApiClient("https://api.example.test", "");
    configure(api);
    await api.get("/listings");
  } finally {
    globalThis.fetch = original;
  }
  return captured;
}

test("request always tags the MCP surface", async () => {
  const headers = await captureHeaders(() => {});
  assert.equal(headers["x-dreamwork-surface"], "mcp");
});

test("client + session headers are absent before they are set", async () => {
  const headers = await captureHeaders(() => {});
  assert.equal(headers["x-dreamwork-client"], undefined);
  assert.equal(headers["x-dreamwork-mcp-session"], undefined);
});

test("setClientInfo composes name/version into x-dreamwork-client", async () => {
  const headers = await captureHeaders((api) =>
    api.setClientInfo("claude-code", "1.2.0"),
  );
  assert.equal(headers["x-dreamwork-client"], "claude-code/1.2.0");
});

test("setClientInfo omits the version when absent", async () => {
  const headers = await captureHeaders((api) => api.setClientInfo("cursor"));
  assert.equal(headers["x-dreamwork-client"], "cursor");
});

test("setClientInfo with no name sets no label", async () => {
  const api = new ApiClient("https://api.example.test", "");
  api.setClientInfo("", "9.9.9");
  assert.equal(api.hasClientInfo, false);
  const headers = await captureHeaders((a) => a.setClientInfo(undefined));
  assert.equal(headers["x-dreamwork-client"], undefined);
});

test("setSessionId sets x-dreamwork-mcp-session", async () => {
  const headers = await captureHeaders((api) =>
    api.setSessionId("install-abc-123"),
  );
  assert.equal(headers["x-dreamwork-mcp-session"], "install-abc-123");
});

test("setSessionId with empty value clears the header", async () => {
  const headers = await captureHeaders((api) => {
    api.setSessionId("something");
    api.setSessionId("");
  });
  assert.equal(headers["x-dreamwork-mcp-session"], undefined);
});

test("hasClientInfo reflects whether a label is set", () => {
  const api = new ApiClient("https://api.example.test", "");
  assert.equal(api.hasClientInfo, false);
  api.setClientInfo("codex", "0.1.0");
  assert.equal(api.hasClientInfo, true);
});

// The hourly key quota answers 429 with { error, limit, retryAfter }. The
// retryAfter is the actionable part for an agent — without it the refusal
// reads as a dead end and invites an immediate retry that cannot succeed.

async function requestWithResponse(
  status: number,
  body: unknown,
): Promise<{ message: string; status: number }> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  })) as typeof fetch;
  try {
    const api = new ApiClient("https://api.example.test", "sk_test");
    await api.get("/pipeline");
  } catch (err) {
    assert.ok(err instanceof Error, "the client must throw on non-2xx");
    assert.ok("status" in err && typeof err.status === "number");
    return { message: err.message, status: err.status };
  } finally {
    globalThis.fetch = original;
  }
  throw new Error("expected the request to fail");
}

test("a 429 carries its retryAfter as a wait instruction", async () => {
  const { message, status } = await requestWithResponse(429, {
    error: "Rate limit exceeded for this API key",
    limit: 100,
    retryAfter: 45 * 60,
  });
  assert.equal(status, 429);
  assert.equal(
    message,
    "Rate limit exceeded for this API key. Try again in about 45 minutes.",
  );
});

test("a short retryAfter is phrased in seconds", async () => {
  const { message } = await requestWithResponse(429, {
    error: "Rate limit exceeded for this connected app",
    retryAfter: 30,
  });
  assert.equal(
    message,
    "Rate limit exceeded for this connected app. Try again in about 30 seconds.",
  );
});

test("a 429 without retryAfter keeps its bare message", async () => {
  const { message } = await requestWithResponse(429, {
    error: "Too many requests",
  });
  assert.equal(message, "Too many requests");
});

test("other statuses are untouched by the retry-after wording", async () => {
  const { message, status } = await requestWithResponse(403, {
    error: "api_key_scope_required",
    message: "This key cannot reach that route.",
  });
  assert.equal(status, 403);
  assert.equal(
    message,
    "api_key_scope_required: This key cannot reach that route.",
  );
});

test("keeps the reason beside the code when a route sends both", () => {
  // The retry gates answer `{ error: "retry_not_safe", message: "…" }` on
  // 409; an agent needs the reason, not the code.
  assert.equal(
    formatApiErrorMessage(
      { error: "retry_not_safe", message: "This application may have been submitted. It needs operator review before retry." },
      409,
    ),
    "retry_not_safe: This application may have been submitted. It needs operator review before retry.",
  );
  assert.equal(formatApiErrorMessage({ error: "not_found" }, 404), "not_found");
});

test("formats structured API errors without collapsing to object strings", () => {
  assert.equal(
    formatApiErrorMessage({ error: { message: "Invalid enum value" } }, 400),
    "Invalid enum value",
  );
  assert.equal(
    formatApiErrorMessage(
      { error: { issues: [{ message: "Bad status" }] } },
      400,
    ),
    '{"issues":[{"message":"Bad status"}]}',
  );
});
