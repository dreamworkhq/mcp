import assert from "node:assert/strict";
import test from "node:test";
import { ApiClient } from "../src/client.js";

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
