import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ApiClient } from "../src/client.js";
import { createMcpServer } from "../src/mcp.js";

/**
 * The unread-mail notice rides on other tools' results, so the contract worth
 * proving is how it behaves across one session: it names new mail once, it
 * does not repeat itself inside the interval or for mail it already named, a
 * later arrival gets its own notice, and nothing about it can break the
 * result the agent actually asked for.
 */

const REMINDERS = "/assistant/actions/get_unread_reminders";
const MINUTE = 60_000;
const APPLICATION_ID = "123e4567-e89b-42d3-a456-426614174000";

type Reply = { status: number; body: unknown } | "network";

function completed(output: unknown): Reply {
  return { status: 200, body: { status: "completed", output } };
}

function reminder(messages: unknown[]): Reply {
  return completed({
    unreadMessages: messages.length,
    unreadThreads: messages.length,
    oldestUnreadAt: null,
    messages,
  });
}

function unreadMessage(messageId: string, company: string) {
  return {
    threadId: `thread-${company}`,
    messageId,
    company,
    jobTitle: "Staff Engineer",
    kind: "interview",
    receivedAt: "2026-09-24T12:00:00.000Z",
    preview: "Could you do Thursday?",
  };
}

const OTHER_ROUTES: Record<string, Reply> = {
  "/listings": {
    status: 200,
    body: {
      listings: [],
      nextCursor: null,
      appliedLocation: null,
      locationFilter: null,
    },
  },
  [`/listings/${APPLICATION_ID}`]: {
    status: 200,
    body: { listing: { id: APPLICATION_ID, title: "Staff Engineer" } },
  },
  "/public/billing/upgrade-link": {
    status: 200,
    body: {
      url: "https://www.dreamworkhq.com/billing?plan=pro",
      plan: "pro",
      billingInterval: "month",
      promo: null,
    },
  },
  "/assistant/actions/list_tasks": completed({ tasks: [] }),
  "/assistant/actions/apply": {
    status: 200,
    body: {
      status: "held",
      needsInput: { token: "t", summary: "Apply to Acme.", prompt: "Say yes." },
    },
  },
};

async function openSession(reminders: () => Reply) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const path = new URL(url).pathname;
    calls.push(path);
    const reply = path === REMINDERS ? reminders() : OTHER_ROUTES[path]!;
    if (reply === "network") throw new TypeError("fetch failed");
    return {
      status: reply.status,
      ok: reply.status >= 200 && reply.status < 300,
      json: async () => reply.body,
    } as Response;
  }) as unknown as typeof fetch;

  let clock = 0;
  const api = new ApiClient("https://api.example.test", "sk_test");
  const server = createMcpServer(api, {
    unreadNotices: { intervalMs: 5 * MINUTE, now: () => clock },
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "notice-test", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return {
    remindersFetched: () => calls.filter((path) => path === REMINDERS).length,
    advance(ms: number) {
      clock += ms;
    },
    async call(name: string, args: Record<string, unknown> = {}) {
      return (await client.callTool({ name, arguments: args })) as {
        content: Array<{ text: string }>;
        isError?: boolean;
        structuredContent?: unknown;
      };
    },
    async close() {
      await client.close();
      await server.close();
      globalThis.fetch = original;
    },
  };
}

function notice(result: { content: Array<{ text: string }> }) {
  assert.equal(result.content.length, 2, "the primary block plus one notice");
  return JSON.parse(result.content[1]!.text).notice;
}

test("public tools never fetch or disclose account mail on an authenticated connection", async () => {
  const session = await openSession(() =>
    reminder([unreadMessage("m-1", "Acme")]),
  );
  try {
    const calls = [
      { name: "get_platform_context", args: {} },
      { name: "browse_listings", args: { limit: 1 } },
      { name: "get_listing", args: { id: APPLICATION_ID } },
      { name: "get_upgrade_link", args: { plan: "pro" } },
    ];
    for (const { name, args } of calls) {
      const result = await session.call(name, args);
      assert.equal(result.isError, undefined, `${name}: expected success`);
      assert.equal(
        result.content.length,
        1,
        `${name}: public result must not include an account-mail notice`,
      );
      assert.equal(
        session.remindersFetched(),
        0,
        `${name}: public call must not look up account mail`,
      );
      session.advance(5 * MINUTE);
    }

    // Public calls do not consume the account tools' notice interval or mail.
    const accountResult = await session.call("list_tasks", { limit: 5 });
    assert.equal(notice(accountResult).unreadRecruiterMessages, 1);
    assert.deepEqual(accountResult.structuredContent, { tasks: [] });
    assert.equal(session.remindersFetched(), 1);
  } finally {
    await session.close();
  }
});

test("a notice names new mail once, then only mail that arrived since", async () => {
  let messages = [unreadMessage("m-1", "Acme")];
  const session = await openSession(() => reminder(messages));
  try {
    const first = await session.call("list_tasks", { limit: 5 });
    assert.equal(first.isError, undefined);
    assert.deepEqual(first.structuredContent, { tasks: [] });
    assert.deepEqual(JSON.parse(first.content[0]!.text), { tasks: [] });
    const told = notice(first);
    assert.equal(told.unreadRecruiterMessages, 1);
    assert.deepEqual(told.threads, [
      {
        threadId: "thread-Acme",
        company: "Acme",
        jobTitle: "Staff Engineer",
        kind: "interview",
        receivedAt: "2026-09-24T12:00:00.000Z",
      },
    ]);
    assert.match(told.howToProceed, /mark_messages_read/);

    const withinInterval = await session.call("list_tasks", { limit: 5 });
    assert.equal(withinInterval.content.length, 1);
    assert.equal(session.remindersFetched(), 1);

    session.advance(5 * MINUTE);
    const sameMail = await session.call("list_tasks", { limit: 5 });
    assert.equal(sameMail.content.length, 1);
    assert.equal(session.remindersFetched(), 2);

    messages = [unreadMessage("m-2", "Beta"), ...messages];
    session.advance(5 * MINUTE);
    const later = notice(await session.call("list_tasks", { limit: 5 }));
    assert.equal(later.unreadRecruiterMessages, 2);
    assert.deepEqual(
      later.threads.map((thread: { company: string }) => thread.company),
      ["Beta", "Acme"],
    );
  } finally {
    await session.close();
  }
});

test("inbox reads and held acts carry no notice, and mail the agent read is not announced", async () => {
  const session = await openSession(() =>
    reminder([unreadMessage("m-1", "Acme")]),
  );
  try {
    const held = await session.call("apply", {
      applicationId: APPLICATION_ID,
      expectedRevision: 3,
    });
    assert.equal(JSON.parse(held.content[0]!.text).status, "held");
    assert.equal(held.content.length, 1);
    assert.equal(session.remindersFetched(), 0);

    const checked = await session.call("get_unread_reminders");
    assert.equal(checked.content.length, 1);
    assert.equal(session.remindersFetched(), 1);

    session.advance(5 * MINUTE);
    const next = await session.call("list_tasks", { limit: 5 });
    assert.equal(next.content.length, 1);
    assert.equal(session.remindersFetched(), 2);
  } finally {
    await session.close();
  }
});

test("a failing reminder check leaves the primary result exactly as it was", async () => {
  let reply: Reply = "network";
  const session = await openSession(() => reply);
  try {
    const unreachable = await session.call("list_tasks", { limit: 5 });
    assert.equal(unreachable.isError, undefined);
    assert.equal(unreachable.content.length, 1);
    assert.deepEqual(unreachable.structuredContent, { tasks: [] });

    reply = { status: 403, body: { error: "assistant_not_enabled" } };
    session.advance(5 * MINUTE);
    const refused = await session.call("list_tasks", { limit: 5 });
    assert.equal(refused.isError, undefined);
    assert.equal(refused.content.length, 1);
    assert.equal(session.remindersFetched(), 2);

    // A refusal answers the same way all session, so the checks stop.
    session.advance(5 * MINUTE);
    await session.call("list_tasks", { limit: 5 });
    assert.equal(session.remindersFetched(), 2);
  } finally {
    await session.close();
  }
});
