import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ApiClient } from "../src/client.js";
import { createMcpServer } from "../src/mcp.js";

// Error and structured-output conventions, driven end-to-end over a real MCP
// handshake with a stubbed API: expected authentication and operational
// failures come back as sanitized agent-visible results with `isError: true`,
// never as protocol faults or leaked exceptions.

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
  const client = new Client({ name: "errors-test", version: "0.0.0" });
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

const UUID = "123e4567-e89b-42d3-a456-426614174000";

test("auth-required tool returns isError key guidance in guest mode without calling the API", async () => {
  let fetched = false;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetched = true;
    return { status: 200, ok: true, json: async () => ({}) } as Response;
  }) as typeof fetch;
  try {
    const api = new ApiClient("https://api.example.test", "");
    const { client, close } = await connectPair(api);
    const result = await client.callTool({ name: "get_profile", arguments: {} });
    assert.equal(result.isError, true);
    assert.match(firstText(result), /No API key/);
    assert.match(firstText(result), /DREAMWORK_API_KEY/);
    assert.equal(fetched, false, "guest mode must not hit the API");
    await close();
  } finally {
    globalThis.fetch = original;
  }
});

test("get_stats requires auth: guest mode returns key guidance without calling the API", async () => {
  let fetched = false;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetched = true;
    return { status: 200, ok: true, json: async () => ({}) } as Response;
  }) as typeof fetch;
  try {
    const api = new ApiClient("https://api.example.test", "");
    const { client, close } = await connectPair(api);
    const result = await client.callTool({ name: "get_stats", arguments: {} });
    assert.equal(result.isError, true);
    assert.match(firstText(result), /No API key/);
    // /stats is user-scoped; a keyless call could only ever 401. Short-circuit
    // it locally instead of spending a round trip to learn that.
    assert.equal(fetched, false, "guest mode must not hit the API");
    await close();
  } finally {
    globalThis.fetch = original;
  }
});

test("API 401 surfaces as the sanitized login-required error", async () => {
  const restore = stubFetch({ status: 401, body: { error: "unauthorized" } });
  try {
    const api = new ApiClient("https://api.example.test", "sk_expired");
    const { client, close } = await connectPair(api);
    const result = await client.callTool({ name: "get_stats", arguments: {} });
    assert.equal(result.isError, true);
    assert.match(firstText(result), /No API key/);
    await close();
  } finally {
    restore();
  }
});

test("API 403 keeps the API's own refusal instead of login guidance", async () => {
  const restore = stubFetch({
    status: 403,
    body: { error: "applications_preview_unavailable" },
  });
  try {
    const api = new ApiClient("https://api.example.test", "sk_test");
    const { client, close } = await connectPair(api);
    const result = await client.callTool({
      name: "reopen_application_materials",
      arguments: { applicationId: UUID },
    });
    assert.equal(result.isError, true);
    assert.match(firstText(result), /applications_preview_unavailable/);
    assert.doesNotMatch(firstText(result), /No API key/);
    await close();
  } finally {
    restore();
  }
});

test("API operational failure surfaces as sanitized isError text", async () => {
  const restore = stubFetch({
    status: 500,
    body: { error: { message: "Something broke upstream" } },
  });
  try {
    const api = new ApiClient("https://api.example.test", "sk_test");
    const { client, close } = await connectPair(api);
    const result = await client.callTool({
      name: "get_listing",
      arguments: { id: UUID },
    });
    assert.equal(result.isError, true);
    assert.match(firstText(result), /Something broke upstream/);
    await close();
  } finally {
    restore();
  }
});

test("unreachable API surfaces as a stable sanitized network error", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed: getaddrinfo ENOTFOUND internal-host");
  }) as typeof fetch;
  try {
    const api = new ApiClient("https://api.example.test", "sk_test");
    const { client, close } = await connectPair(api);
    const result = await client.callTool({ name: "get_stats", arguments: {} });
    assert.equal(result.isError, true);
    assert.match(firstText(result), /Unable to reach the Dreamwork API/);
    assert.ok(
      !firstText(result).includes("internal-host"),
      "raw network error internals must not leak to the agent",
    );
    await close();
  } finally {
    globalThis.fetch = original;
  }
});

test("invalid tool input is rejected by schema validation before any API call", async () => {
  let fetched = false;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetched = true;
    return { status: 200, ok: true, json: async () => ({}) } as Response;
  }) as typeof fetch;
  try {
    const api = new ApiClient("https://api.example.test", "sk_test");
    const { client, close } = await connectPair(api);
    // The SDK rejects invalid arguments (InvalidParams) and surfaces the
    // failure to the caller as an isError result.
    const result = await client.callTool({
      name: "get_listing",
      arguments: { id: "not-a-uuid" },
    });
    assert.equal(result.isError, true);
    assert.match(firstText(result), /Input validation error/);
    assert.match(firstText(result), /uuid/i);
    assert.equal(fetched, false, "invalid input must never reach the API");
    await close();
  } finally {
    globalThis.fetch = original;
  }
});

test("get_platform_context returns structuredContent matching its text result", async () => {
  const api = new ApiClient("https://api.example.test", "");
  const { client, close } = await connectPair(api);
  const result = await client.callTool({
    name: "get_platform_context",
    arguments: {},
  });
  assert.ok(result.structuredContent, "expected structuredContent");
  const structured = result.structuredContent as { platform: string };
  assert.equal(structured.platform, "Dreamwork");
  // The serialized text result is preserved for older clients and must carry
  // the same payload.
  assert.deepEqual(JSON.parse(firstText(result)), result.structuredContent);
  await close();
});
