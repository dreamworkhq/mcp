import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * The published CLI bundles the private `@jobless/api-contracts` package into
 * `dist/stdio.js`. If a private import ever survives into the bundle, the
 * tarball installs but crashes on first run for every user — and the full
 * packed-artifact proof (`pnpm --filter @dreamworkhq/mcp test:package`) only
 * runs at publish time, because it needs the network and a real `npm install`.
 *
 * These checks are the offline subset: they run in `verify:ci` via the MCP test
 * suite, so a regression that re-breaks the bundle fails on the PR that causes
 * it rather than months later during a release.
 */

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE = resolve(PACKAGE_ROOT, "dist/stdio.js");

function buildBundle(): string {
  execFileSync(process.execPath, ["scripts/build.mjs"], {
    cwd: PACKAGE_ROOT,
    encoding: "utf8",
  });
  return readFileSync(BUNDLE, "utf8");
}

test("the bundle inlines every private workspace package", () => {
  const bundle = buildBundle();
  // Match static `from "x"`, `require("x")`, and dynamic `import("x")` alike —
  // scripts/verify-package.mjs checks all three, and a CI guard weaker than the
  // publish-time proof would let a dynamic-import regression reach a release.
  const privateImports = [
    ...bundle.matchAll(/(?:from\s*|require\(\s*|import\(\s*)"(@jobless\/[^"]+)"/g),
  ].map((match) => match[1]);

  assert.deepEqual(
    privateImports,
    [],
    `private packages must be inlined, not imported: ${privateImports.join(", ")}`,
  );
});

test("the MCP SDK and Zod stay external", () => {
  const bundle = buildBundle();
  const specifiers = new Set(
    [...bundle.matchAll(/from\s*"([^"]+)"/g)].map((match) => match[1]),
  );

  // Inlining the SDK would fork the protocol implementation away from whatever
  // the host installed; inlining Zod would ship a second copy of it.
  assert.ok(
    [...specifiers].some((s) => s.startsWith("@modelcontextprotocol/sdk/")),
    "the MCP SDK must remain an external import",
  );
  assert.ok(specifiers.has("zod"), "zod must remain an external import");

  // Everything else must be a node builtin — anything unexpected would be a
  // runtime dependency the published tarball does not declare.
  for (const specifier of specifiers) {
    const allowed =
      specifier.startsWith("node:") ||
      specifier.startsWith("@modelcontextprotocol/sdk/") ||
      specifier === "zod";
    assert.ok(allowed, `unexpected external import in bundle: ${specifier}`);
  }
});

test("the bundle keeps exactly one shebang, on the first line", () => {
  const bundle = buildBundle();
  assert.ok(bundle.startsWith("#!/usr/bin/env node\n"));
  assert.equal(bundle.split("\n").filter((l) => l.startsWith("#!")).length, 1);
});
