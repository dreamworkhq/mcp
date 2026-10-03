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
  const client = new Client({ name: "profile-identity-test", version: "0.0.0" });
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

test("update_profile publishes and forwards profile identity authority", async () => {
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
    const { tools } = await client.listTools();
    const tool = tools.find((candidate) => candidate.name === "update_profile");
    const expectedVersion = tool?.inputSchema.properties
      ?.expectedProfileIdentityVersion as
      | { type?: unknown; exclusiveMinimum?: unknown; description?: unknown }
      | undefined;
    assert.equal(expectedVersion?.type, "integer");
    assert.equal(expectedVersion?.exclusiveMinimum, 0);
    assert.match(String(expectedVersion?.description), /prior get_profile snapshot/i);

    await client.callTool({
      name: "update_profile",
      arguments: {
        name: "Ada Lovelace",
        expectedProfileIdentityVersion: 7,
      },
    });
    assert.deepEqual(requestBody, {
      name: "Ada Lovelace",
      expectedProfileIdentityVersion: 7,
    });
  } finally {
    globalThis.fetch = originalFetch;
    await close();
  }
});

test("update_profile keeps a tone-only write versionless", async () => {
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
      arguments: { tonePreferences: "Concise and direct" },
    });
    assert.deepEqual(requestBody, { tonePreferences: "Concise and direct" });
  } finally {
    globalThis.fetch = originalFetch;
    await close();
  }
});

test("upload_resume publishes and forwards profile identity authority", async () => {
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
    const { tools } = await client.listTools();
    const tool = tools.find((candidate) => candidate.name === "upload_resume");
    const expectedVersion = tool?.inputSchema.properties
      ?.expectedProfileIdentityVersion as
      | { type?: unknown; exclusiveMinimum?: unknown; description?: unknown }
      | undefined;
    assert.equal(expectedVersion?.type, "integer");
    assert.equal(expectedVersion?.exclusiveMinimum, 0);
    assert.match(String(expectedVersion?.description), /prior get_profile snapshot/i);

    await client.callTool({
      name: "upload_resume",
      arguments: {
        content: "cmVzdW1l",
        format: "txt",
        filename: "resume.txt",
        expectedProfileIdentityVersion: 9,
      },
    });
    assert.deepEqual(requestBody, {
      content: "cmVzdW1l",
      format: "txt",
      filename: "resume.txt",
      expectedProfileIdentityVersion: 9,
    });
  } finally {
    globalThis.fetch = originalFetch;
    await close();
  }
});
