import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ApiClient } from "../src/client.js";
import { createMcpServer } from "../src/mcp.js";

const APPLICATION_ID = "11111111-1111-4111-8111-111111111111";

function materials(revision: number, pdfBase64: string | null = "cGRm") {
  return {
    materials: {
      revision,
      resumeVariant: "default",
      coverLetter: "Reviewed letter",
      coverLetterIncluded: true,
      locked: false,
      defaultResume: { html: "Reviewed resume", pdfBase64 },
      tailoredResume: { html: "Tailored resume", pdfBase64 },
    },
  };
}

test("application material tools preserve revisions across their API proxies", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, path: url.pathname, body });

    let response: unknown;
    if (url.pathname === `/applications/${APPLICATION_ID}/pack`) {
      response = materials(1);
    } else if (
      url.pathname === `/applications/${APPLICATION_ID}/materials` &&
      method === "PATCH"
    ) {
      response = materials(2);
    } else if (
      url.pathname === `/applications/${APPLICATION_ID}/materials/reopen`
    ) {
      response = materials(3);
    } else {
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    }
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const server = createMcpServer(
    new ApiClient("https://api.example.test", "sk_test"),
  );
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "materials-test", version: "0.0.0" });

  try {
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const getResult = await client.callTool({
      name: "get_application_materials",
      arguments: { applicationId: APPLICATION_ID },
    });
    assert.deepEqual(getResult.structuredContent, materials(1, null));

    const updateResult = await client.callTool({
      name: "update_application_materials",
      arguments: {
        applicationId: APPLICATION_ID,
        expectedRevision: 1,
        resumeVariant: "default",
        coverLetterIncluded: false,
      },
    });
    assert.deepEqual(updateResult.structuredContent, materials(2, null));

    const reopenResult = await client.callTool({
      name: "reopen_application_materials",
      arguments: { applicationId: APPLICATION_ID },
    });
    assert.deepEqual(reopenResult.structuredContent, materials(3, null));

    assert.deepEqual(requests, [
      {
        method: "GET",
        path: `/applications/${APPLICATION_ID}/pack`,
        body: undefined,
      },
      {
        method: "PATCH",
        path: `/applications/${APPLICATION_ID}/materials`,
        body: {
          expectedRevision: 1,
          resumeVariant: "default",
          coverLetterIncluded: false,
        },
      },
      {
        method: "POST",
        path: `/applications/${APPLICATION_ID}/materials/reopen`,
        body: {},
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    await client.close();
    await server.close();
  }
});

test("an account outside the Applications rollout is told so, not handed a malformed-data error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ status: "ready", materials: null }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  const server = createMcpServer(
    new ApiClient("https://api.example.test", "sk_test"),
  );
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "materials-null-test", version: "0.0.0" });

  try {
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const result = await client.callTool({
      name: "get_application_materials",
      arguments: { applicationId: APPLICATION_ID },
    });
    assert.equal(result.isError, true);
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    assert.match(text, /not available to this account/);
    assert.doesNotMatch(text, /malformed/);
  } finally {
    globalThis.fetch = originalFetch;
    await client.close();
    await server.close();
  }
});
