import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ApiClient } from "../src/client.js";
import { createMcpServer } from "../src/mcp.js";

/**
 * The cross-surface contract between a generated tool and
 * `POST /assistant/actions/:id`.
 *
 * The tools themselves are derived from the registry, so there is nothing
 * per-tool to test. What is worth proving is the shape of the conversation
 * they all share: what goes on the wire, and what an agent is told to do with
 * each of the four answers the route can give. The elicitation half is the
 * reason — a `held` answer that reads as a failure, or one that does not say
 * to echo the token back, strands a real application.
 */

interface Recorded {
  url: string;
  body: unknown;
}

function stubFetch(status: number, payload: unknown, recorded: Recorded[]) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    recorded.push({
      url,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => payload,
    } as Response;
  }) as unknown as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

async function callAction(
  name: string,
  args: Record<string, unknown>,
  status: number,
  payload: unknown,
) {
  const recorded: Recorded[] = [];
  const restore = stubFetch(status, payload, recorded);
  try {
    const api = new ApiClient("https://api.example.test", "sk_test");
    const server = createMcpServer(api);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "registry-test", version: "0.0.0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const result = await client.callTool({ name, arguments: args });
    await client.close();
    await server.close();
    return { result, recorded };
  } finally {
    restore();
  }
}

function firstText(result: { content?: unknown }): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content?.[0]?.text ?? "";
}

const APPLICATION_ID = "123e4567-e89b-42d3-a456-426614174000";

const RECEIPT = {
  taskId: "123e4567-e89b-42d3-a456-426614174111",
  actionId: "apply",
  status: "queued",
  object: { type: "application", id: APPLICATION_ID },
  revisionBefore: null,
  revisionAfter: null,
  summary: "Queued an application to Example Co.",
  undo: null,
  cancel: { actionId: "cancel_apply", args: { applicationId: APPLICATION_ID } },
  source: "mcp",
  createdAt: "2026-09-14T00:00:00.000Z",
};

test("a registry tool posts its arguments to the action route and returns the action's own output", async () => {
  const { result, recorded } = await callAction(
    "list_tasks",
    { limit: 5 },
    200,
    { status: "completed", output: { tasks: [] } },
  );

  assert.equal(recorded.length, 1);
  assert.match(recorded[0]!.url, /\/assistant\/actions\/list_tasks$/);
  assert.deepEqual(recorded[0]!.body, { args: { limit: 5 } });
  assert.equal(result.isError, undefined, firstText(result));
  assert.deepEqual(result.structuredContent, { tasks: [] });
  assert.deepEqual(JSON.parse(firstText(result)), result.structuredContent);
});

test("a held consequential action is not an error and says exactly what to send back", async () => {
  const { result } = await callAction(
    "apply",
    { applicationId: APPLICATION_ID, expectedRevision: 3 },
    200,
    {
      status: "held",
      needsInput: {
        // The shape the route actually sends: the describer in
        // `apps/api/src/assistant/actions/apply.ts` names the record, not the
        // action. A richer fixture here would hide a summary that says
        // "Apply to a job" and nothing else.
        token: "token-abc",
        summary:
          "Submit the saved resume and cover letter to Example Co for Staff Engineer. It goes under the candidate's own name and cannot be taken back.",
        prompt:
          "Apply to a job cannot run yet because you have not asked for it in so many words. Say yes to go ahead.",
      },
    },
  );

  assert.equal(result.isError, undefined, firstText(result));
  const held = JSON.parse(firstText(result));
  assert.equal(held.status, "held");
  assert.equal(held.confirmationToken, "token-abc");
  assert.match(held.summary, /Example Co/);
  assert.match(held.howToProceed, /confirmationToken/);
  assert.match(held.howToProceed, /apply/);
});

test("echoing the token forwards it beside the same arguments, and never inside them", async () => {
  const { recorded } = await callAction(
    "apply",
    {
      applicationId: APPLICATION_ID,
      expectedRevision: 3,
      confirmationToken: "token-abc",
    },
    200,
    { status: "queued", receipt: RECEIPT, output: RECEIPT },
  );

  assert.deepEqual(recorded[0]!.body, {
    args: { applicationId: APPLICATION_ID, expectedRevision: 3 },
    confirmationToken: "token-abc",
  });
});

test("a refused action keeps the route's code and next step as an error result", async () => {
  const { result } = await callAction(
    "apply",
    { applicationId: APPLICATION_ID, expectedRevision: 3 },
    200,
    {
      status: "failed",
      error: {
        code: "action_not_authorized",
        message: "This key is not scoped for apply.",
        nextStep: 'Generate a key with the "apply" scope.',
      },
    },
  );

  assert.equal(result.isError, true);
  const failure = JSON.parse(firstText(result));
  assert.equal(failure.code, "action_not_authorized");
  assert.match(failure.nextStep, /apply/);
});

test("a handed-off action keeps its declared result and adds the link the person finishes at", async () => {
  const handoffReceipt = {
    ...RECEIPT,
    actionId: "set_autopilot",
    status: "handoff",
    object: null,
    summary: "Autopilot is not part of your current plan.",
    cancel: null,
    handoff: {
      reason: "needs_entitlement",
      note: "the current plan does not include Autopilot",
      destination: { destination: "billing" },
      remaining: "Pick a plan that includes Autopilot on the billing page.",
      preserved: false,
    },
  };
  const { result } = await callAction(
    "set_autopilot",
    { state: "on", confirmationToken: "token-abc" },
    200,
    {
      status: "completed",
      receipt: handoffReceipt,
      output: handoffReceipt,
      handoff: {
        url: "https://www.dreamworkhq.com/billing",
        remaining: "Pick a plan that includes Autopilot on the billing page.",
      },
    },
  );

  assert.equal(result.isError, undefined, firstText(result));
  const content = result.content as Array<{ type: string; text: string }>;
  assert.equal(JSON.parse(content[0]!.text).status, "handoff");
  const block = JSON.parse(content[1]!.text);
  assert.equal(block.handoff.openUrl, "https://www.dreamworkhq.com/billing");
  assert.match(block.handoff.howToProceed, /not a failure/);
});
