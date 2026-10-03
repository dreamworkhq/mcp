import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ApiClient } from "../src/client.js";
import { createMcpServer } from "../src/mcp.js";
import { MCP_SERVER_VERSION } from "../src/version.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");

// Package version, MCP handshake version, and registry manifest version must
// not silently drift. package.json is the single source of truth: the publish
// workflow verifies it against the mcp-v* tag, src/version.ts feeds it into the
// initialize handshake, and server.json (the MCP registry manifest) must track
// it in-repo so the synced publish artifact starts from a consistent state.

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

const pkg = readJson(resolve(pkgRoot, "package.json")) as { version: string };

test("MCP_SERVER_VERSION is sourced from package.json", () => {
  assert.equal(MCP_SERVER_VERSION, pkg.version);
});

test("server.json registry manifest matches package.json version", () => {
  const manifest = readJson(resolve(pkgRoot, "server.json")) as {
    version: string;
    packages: Array<{ version: string; transport: { type: string } }>;
  };
  assert.equal(manifest.version, pkg.version);
  for (const entry of manifest.packages) {
    assert.equal(entry.version, pkg.version);
    assert.equal(entry.transport.type, "stdio");
  }
});

test("initialize handshake reports the package.json version", async () => {
  const api = new ApiClient("https://api.example.test", "");
  const server = createMcpServer(api);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "version-test", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  assert.equal(client.getServerVersion()?.version, pkg.version);
  await client.close();
  await server.close();
});
