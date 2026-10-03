import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ApiClient } from "../src/client.js";
import { createMcpServer } from "../src/mcp.js";

/**
 * Wire the MCP client-capture path end-to-end (Piece 1 of the identity
 * telemetry): after the `initialize` handshake, `oninitialized` reads
 * `getClientVersion()` and sets it on the ApiClient; and the lazy backfill sets
 * client info at tool-call time even if `oninitialized` never ran. Drives a real
 * handshake over InMemoryTransport against `createMcpServer`.
 */

/**
 * Stub ApiClient.request over fetch so a real handshake + tool call can run
 * without a live API, and capture the last outgoing header set so we can assert
 * the resulting `x-dreamwork-client` header.
 */
function stubFetch(): { lastHeaders: () => Record<string, string>; restore: () => void } {
  const original = globalThis.fetch;
  let captured: Record<string, string> = {};
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    captured = (init.headers as Record<string, string>) ?? {};
    return {
      status: 200,
      ok: true,
      json: async () => ({ ok: true }),
    } as Response;
  }) as typeof fetch;
  return {
    lastHeaders: () => captured,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const LISTING_ID = "123e4567-e89b-42d3-a456-426614174000";

async function connectPair(api: ApiClient) {
  const server = createMcpServer(api);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "claude-code", version: "1.2.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return { server, client };
}

test("oninitialized reads getClientVersion() and sets it on the ApiClient", async () => {
  const fetchStub = stubFetch();
  try {
    const api = new ApiClient("https://api.example.test", "");
    assert.equal(api.hasClientInfo, false);

    const { server, client } = await connectPair(api);

    // The `initialize` handshake completes inside connect(); `oninitialized`
    // fires afterward and reads the client's declared {name, version}.
    assert.equal(api.hasClientInfo, true);

    // A public tool call still works and carries the captured client header.
    // `get_listing` is the guest-reachable tool that still performs a real
    // request (`get_stats` is user-scoped and short-circuits in guest mode).
    await client.callTool({ name: "get_listing", arguments: { id: LISTING_ID } });
    assert.equal(
      fetchStub.lastHeaders()["x-dreamwork-client"],
      "claude-code/1.2.0",
    );

    await client.close();
    await server.close();
  } finally {
    fetchStub.restore();
  }
});

test("lazy backfill sets client info at tool-call time if not already set", async () => {
  const fetchStub = stubFetch();
  try {
    const api = new ApiClient("https://api.example.test", "");
    const server = createMcpServer(api);

    // Simulate the case where the `initialized` notification never set client
    // info (defeat oninitialized) but the SDK still has _clientVersion from the
    // initialize REQUEST handler. The lazy backfill wrapping every tool handler
    // must read getClientVersion() at call time.
    server.server.oninitialized = () => {
      /* no-op: pretend the notification path did not set client info */
    };

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "cursor", version: "0.9" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    // oninitialized was neutered → still no client info after handshake.
    assert.equal(api.hasClientInfo, false);

    // The tool call triggers lazy backfill from getClientVersion().
    await client.callTool({ name: "get_listing", arguments: { id: LISTING_ID } });

    assert.equal(api.hasClientInfo, true);
    assert.equal(
      fetchStub.lastHeaders()["x-dreamwork-client"],
      "cursor/0.9",
    );

    await client.close();
    await server.close();
  } finally {
    fetchStub.restore();
  }
});
