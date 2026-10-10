#!/usr/bin/env node
// MCP stdio entrypoint: stdout carries exclusively JSON-RPC protocol frames;
// every application log goes to stderr. Configuration comes from the host
// environment (the MCP client config's `env` block). No .env loader runs in
// the published artifact, so no dependency can print a banner onto stdout.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ApiClient } from "./client.js";
import { resolveInstallId } from "./install-id.js";
import { createMcpServer } from "./mcp.js";

const DEFAULT_API_URL = "https://api.dreamworkhq.com";
const API_URL =
  process.env.DREAMWORK_API_URL ??
  process.env.JOBLESS_API_URL ??
  DEFAULT_API_URL;
const TOKEN =
  process.env.DREAMWORK_API_KEY ?? process.env.JOBLESS_API_TOKEN ?? "";

if (!TOKEN) {
  console.error(
    "[mcp-stdio] No DREAMWORK_API_KEY set. Running in free guest mode.",
  );
  console.error(
    "[mcp-stdio] Public listings work without a key. Set DREAMWORK_API_KEY to use the pipeline, resume, apply, and outreach tools.",
  );
}

const api = new ApiClient(API_URL, TOKEN);
// The stable install id is the stdio "session" identity for guest telemetry.
// resolveInstallId is fail-open/silent and honors the telemetry opt-out.
api.setSessionId(resolveInstallId());
// Unread recruiter mail notices are on unless the person's client config says
// DREAMWORK_UNREAD_NOTICES=off (also 0/false/no).
const NOTICES_OFF = new Set(["0", "false", "no", "off"]);
const unreadNoticesOff = NOTICES_OFF.has(
  (process.env.DREAMWORK_UNREAD_NOTICES ?? "").trim().toLowerCase(),
);
const server = createMcpServer(
  api,
  unreadNoticesOff ? {} : { unreadNotices: {} },
);
// SDK 1.31's stdio transport stops reading at 10 MiB. upload_resume sends the
// file as base64, and a file at PROFILE_DOCUMENT_MAX_BYTES (10 MiB) encodes
// to about 13.4 MiB before the JSON-RPC envelope. The API accepts that
// encoded body up to UPLOAD_ROUTE_BODY_LIMIT_BYTES (20 MiB). One mebibyte
// above that body limit fits the envelope; a larger frame is past what the
// route will accept.
const STDIO_MAX_BUFFER_SIZE = 21 * 1024 * 1024;
const transport = new StdioServerTransport(process.stdin, process.stdout, {
  maxBufferSize: STDIO_MAX_BUFFER_SIZE,
});

await server.connect(transport);
console.error(
  `[mcp-stdio] Connected to API at ${API_URL}${TOKEN ? "" : " (guest mode)"}`,
);
