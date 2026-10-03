import { createRequire } from "node:module";

// Single-source the server version from package.json so the MCP `initialize`
// handshake can never drift from the published npm version. package.json ships
// at the tarball root, so `../package.json` resolves both from `src/` (tsx dev)
// and from `dist/` (published build). The publish workflow additionally syncs
// server.json (the MCP registry manifest) to the pushed mcp-v* tag, and
// test/version-consistency.test.ts pins all three together in-repo.
const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

export const MCP_SERVER_VERSION: string = pkg.version;
