#!/usr/bin/env node
/**
 * Publish build for @dreamworkhq/mcp.
 *
 * `tsc` cannot produce a publishable artifact any more: the tool contracts are
 * decoded through canonical wire schemas that live in the PRIVATE workspace
 * package `@jobless/api-contracts`, and `tsc` emits that as a bare
 * `import ... from "@jobless/api-contracts"` — unresolvable for every npm
 * consumer.
 *
 * So the published program is a single bundled ESM file with the private
 * contract source inlined, and exactly two externals:
 *
 *   - `@modelcontextprotocol/sdk/*` — the protocol implementation. Inlining it
 *     would fork it from the version npm resolves for the consumer.
 *   - `zod` — the tool-schema runtime the SDK also uses. Two Zod instances mean
 *     two sets of `instanceof` checks.
 *
 * Both stay exact-pinned runtime dependencies. `scripts/verify-package.mjs`
 * proves all of this against the packed tarball, not the source tree.
 */
import { chmod, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const distDir = new URL("../dist/", import.meta.url);
const entryPoint = fileURLToPath(new URL("../src/stdio.ts", import.meta.url));
const outfile = fileURLToPath(new URL("../dist/stdio.js", import.meta.url));

// A stale dist/ is how an unpublishable artifact survives a "clean" build:
// `files` ships whatever is on disk, so old per-module tsc output would ride
// along beside the bundle.
await rm(distDir, { recursive: true, force: true });

await build({
  entryPoints: [entryPoint],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["@modelcontextprotocol/sdk/*", "zod"],
  legalComments: "none",
  sourcemap: false,
  treeShaking: true,
  // src/stdio.ts already owns `#!/usr/bin/env node` and esbuild preserves the
  // entry point's hashbang, so no banner is added here — that would produce
  // two. verify-package.mjs asserts exactly one survives.
});

// npm sets the exec bit when linking a `bin`, but the tarball should already
// be runnable so a direct `node_modules/@dreamworkhq/mcp/dist/stdio.js` works.
await chmod(outfile, 0o755);

console.log(`Bundled ${outfile}`);
