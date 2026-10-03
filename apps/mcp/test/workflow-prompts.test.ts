import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ApiClient } from "../src/client.js";
import { createMcpServer } from "../src/mcp.js";

/**
 * A workflow prompt is a brief that names tools, and nothing but this test ties
 * those names to the catalog. A tool renamed or withdrawn would leave a prompt
 * sending agents to call something that does not exist, which fails quietly in
 * a host: the agent improvises instead. Tool names are the backticked
 * snake_case words; backticked camelCase words are result fields.
 */
test("every tool a workflow prompt names is a tool this server registers", async () => {
  const server = createMcpServer(new ApiClient("https://api.example.test", ""));
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "prompts-test", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  try {
    const tools = new Set((await client.listTools()).tools.map((t) => t.name));
    const { prompts } = await client.listPrompts();
    assert.ok(prompts.length > 0, "the server registers workflow prompts");

    for (const prompt of prompts) {
      const args = Object.fromEntries(
        (prompt.arguments ?? [])
          .filter((argument) => argument.required)
          .map((argument) => [argument.name, "example"]),
      );
      const { messages } = await client.getPrompt({
        name: prompt.name,
        arguments: args,
      });
      const text = messages
        .map((message) =>
          message.content.type === "text" ? message.content.text : "",
        )
        .join("\n");
      const named = [...text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map(
        (match) => match[1]!,
      );
      assert.ok(named.length > 0, `${prompt.name} names the tools it uses`);
      const missing = named.filter((name) => !tools.has(name));
      assert.deepEqual(
        missing,
        [],
        `${prompt.name} names tools the server does not register`,
      );
    }
  } finally {
    await client.close();
    await server.close();
  }
});
