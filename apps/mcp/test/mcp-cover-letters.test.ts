import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ApiClient } from "../src/client.js";
import { createMcpServer } from "../src/mcp.js";

async function connectPair() {
  const server = createMcpServer(
    new ApiClient("https://api.example.test", "sk_test"),
  );
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "cover-letters-test", version: "0.0.0" });
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

test("update_profile nests coverLettersEnabled under preferences on the wire", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: unknown;
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    requestBody = JSON.parse(String(init.body));
    return {
      status: 200,
      ok: true,
      json: async () => ({ profile: { id: "profile-1" } }),
    } as Response;
  }) as typeof fetch;

  const { client, close } = await connectPair();
  try {
    await client.callTool({
      name: "update_profile",
      arguments: {
        coverLettersEnabled: false,
        expectedProfileIdentityVersion: 3,
      },
    });
    // The API validates the boolean at preferences.coverLettersEnabled; a
    // top-level key would ride passthrough into nothing.
    assert.deepEqual(requestBody, {
      expectedProfileIdentityVersion: 3,
      preferences: { coverLettersEnabled: false },
    });
  } finally {
    globalThis.fetch = originalFetch;
    await close();
  }
});

test("update_profile omits preferences entirely when the flag is not passed", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: unknown;
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    requestBody = JSON.parse(String(init.body));
    return {
      status: 200,
      ok: true,
      json: async () => ({ profile: { id: "profile-1" } }),
    } as Response;
  }) as typeof fetch;

  const { client, close } = await connectPair();
  try {
    await client.callTool({
      name: "update_profile",
      arguments: { name: "Ada Lovelace" },
    });
    assert.deepEqual(requestBody, { name: "Ada Lovelace" });
  } finally {
    globalThis.fetch = originalFetch;
    await close();
  }
});
