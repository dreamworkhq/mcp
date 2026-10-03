#!/usr/bin/env node
/**
 * Packed-artifact proof for @dreamworkhq/mcp.
 *
 * `pnpm --filter @dreamworkhq/mcp test` proves the SOURCE works inside the
 * monorepo, where `@jobless/api-contracts` is a workspace symlink. That says
 * nothing about the tarball an end user actually runs: the private contracts
 * package is not published, so anything that survives into `dist` as a runtime
 * import is a broken install for every consumer.
 *
 * This script closes that gap by proving the artifact, not the source:
 *
 *   1. dist/stdio.js exists and keeps exactly one `#!/usr/bin/env node`.
 *   2. The bundle carries no private-package import, and still leaves the MCP
 *      SDK and Zod external (an inlined SDK would silently fork the protocol).
 *   3. `npm pack` contains exactly the reviewed file list.
 *   4. A clean `npm install` of that tarball succeeds with --ignore-scripts,
 *      in a throwaway directory with no workspace links to fall back on.
 *   5. The installed `dreamwork-mcp` bin completes an MCP initialize handshake
 *      and lists its tools.
 *   6. Every stdout line is a JSON-RPC 2.0 frame — one stray banner or log line
 *      on stdout wedges every MCP client.
 *
 * Run under Node 22. Requires network access for step 4 (the two runtime
 * dependencies come from the public registry).
 */
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = join(packageRoot, "dist", "stdio.js");
const packageJson = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8"),
);

const SHEBANG = "#!/usr/bin/env node";

/**
 * Any IMPORT of a private `@jobless/*` workspace package is unresolvable for
 * every npm consumer and must have been inlined by the bundler. Matched as an
 * import specifier rather than a bare substring: the bundled contract schemas
 * legitimately mention `@jobless/shared` inside a description string, and a
 * substring check would fail on prose.
 */
const PRIVATE_IMPORT_PATTERN =
  /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)["'](@jobless\/[^"']+)["']/g;

/**
 * Packages that must stay EXTERNAL — imported at runtime, not inlined. They
 * are exact-pinned runtime dependencies; bundling them would fork the MCP
 * protocol implementation and the Zod instance from the ones npm resolves.
 */
const REQUIRED_EXTERNAL_IMPORTS = [
  "@modelcontextprotocol/sdk/server/stdio.js",
  "@modelcontextprotocol/sdk/server/mcp.js",
  "zod",
];

/**
 * The reviewed tarball contents. `LICENSE`, `README.md` and `package.json` are
 * force-included by npm regardless of `files`; `dist/stdio.js` is the entire
 * shipped program. Anything else is either dead weight or a leak.
 */
const EXPECTED_PACKED_FILES = [
  "LICENSE",
  "README.md",
  "dist/stdio.js",
  "package.json",
];

const HANDSHAKE_TIMEOUT_MS = 30_000;
const isWindows = process.platform === "win32";

function runNpm(args, options = {}) {
  return execFileSync("npm", args, {
    ...options,
    shell: isWindows,
  });
}

const failures = [];
function fail(message) {
  failures.push(message);
}
function report(step) {
  console.log(`  ok  ${step}`);
}

// ── 1 & 2: the bundle itself ───────────────────────────────────────────

if (!existsSync(bundlePath)) {
  console.error(
    `verify-package: dist/stdio.js is missing. Run \`pnpm --filter @dreamworkhq/mcp build\` first.`,
  );
  process.exit(1);
}

const bundle = readFileSync(bundlePath, "utf8");

if (!bundle.startsWith(`${SHEBANG}\n`)) {
  fail(
    `dist/stdio.js must start with "${SHEBANG}" (got: ${JSON.stringify(bundle.slice(0, 40))})`,
  );
} else {
  report("bundle keeps its shebang");
}

const shebangCount = bundle.split(SHEBANG).length - 1;
if (shebangCount !== 1) {
  fail(`dist/stdio.js contains ${shebangCount} shebangs; expected exactly 1`);
}

const leaked = [
  ...new Set([...bundle.matchAll(PRIVATE_IMPORT_PATTERN)].map((m) => m[1])),
];
for (const specifier of leaked) {
  fail(
    `dist/stdio.js imports the private workspace package "${specifier}"; it must be inlined by the bundler, not imported`,
  );
}
if (leaked.length === 0) report("bundle has no private-package import");

const notExternal = REQUIRED_EXTERNAL_IMPORTS.filter(
  (specifier) => !bundle.includes(`"${specifier}"`),
);
for (const specifier of notExternal) {
  fail(
    `dist/stdio.js does not import "${specifier}"; runtime dependencies must stay external, not be inlined`,
  );
}
if (notExternal.length === 0) report("MCP SDK and Zod stay external");

if (packageJson.bin?.["dreamwork-mcp"] !== "dist/stdio.js") {
  fail(`package.json bin.dreamwork-mcp must be "dist/stdio.js"`);
}

if (failures.length > 0) {
  console.error("\nverify-package FAILED:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

// ── 3: npm pack contents ───────────────────────────────────────────────

const workDir = mkdtempSync(join(tmpdir(), "dreamwork-mcp-package-proof-"));
let exitCode = 0;

try {
  const packOutput = runNpm(
    ["pack", "--json", "--pack-destination", workDir, "--loglevel=error"],
    { cwd: packageRoot, encoding: "utf8" },
  );
  const [packed] = JSON.parse(packOutput);
  const packedFiles = packed.files.map((file) => file.path).sort();
  const expected = [...EXPECTED_PACKED_FILES].sort();

  if (JSON.stringify(packedFiles) !== JSON.stringify(expected)) {
    fail(
      `npm pack contents drifted.\n      expected: ${expected.join(", ")}\n      actual:   ${packedFiles.join(", ")}`,
    );
  } else {
    report(`npm pack contains exactly ${expected.length} reviewed files`);
  }

  const tarball = join(workDir, packed.filename);

  // ── 4: clean install, no workspace to fall back on ───────────────────

  const installDir = join(workDir, "install");
  mkdirSync(installDir, { recursive: true });
  writeFileSync(
    join(installDir, "package.json"),
    `${JSON.stringify(
      { name: "dreamwork-mcp-package-proof", version: "0.0.0", private: true },
      null,
      2,
    )}\n`,
  );

  runNpm(
    [
      "install",
      tarball,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--loglevel=error",
    ],
    { cwd: installDir, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  report("clean npm install succeeds with --ignore-scripts");

  const binPath = join(
    installDir,
    "node_modules",
    ".bin",
    isWindows ? "dreamwork-mcp.cmd" : "dreamwork-mcp",
  );
  if (!existsSync(binPath)) {
    throw new Error(`installed bin is missing: ${binPath}`);
  }
  const installedEntryPath = join(
    installDir,
    "node_modules",
    "@dreamworkhq",
    "mcp",
    "dist",
    "stdio.js",
  );
  if (!existsSync(installedEntryPath)) {
    throw new Error(`installed entry point is missing: ${installedEntryPath}`);
  }

  // ── 5 & 6: handshake over the installed bin, stdout purity ───────────

  const stdout = await runHandshake(installedEntryPath);
  const lines = stdout.split("\n").filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    fail("the installed server wrote nothing to stdout");
  }

  const frames = [];
  for (const [index, line] of lines.entries()) {
    let frame;
    try {
      frame = JSON.parse(line);
    } catch {
      fail(
        `stdout line ${index + 1} is not JSON — stdout must carry only JSON-RPC frames: ${JSON.stringify(line.slice(0, 120))}`,
      );
      continue;
    }
    if (frame?.jsonrpc !== "2.0") {
      fail(`stdout line ${index + 1} is not a JSON-RPC 2.0 frame`);
      continue;
    }
    frames.push(frame);
  }
  if (failures.length === 0) {
    report(`every stdout line is a JSON-RPC 2.0 frame (${frames.length})`);
  }

  const initialize = frames.find((frame) => frame.id === 1);
  if (!initialize?.result?.serverInfo) {
    fail("no initialize result came back from the installed server");
  } else {
    if (initialize.result.serverInfo.name !== "dreamwork") {
      fail(
        `initialize serverInfo.name is "${initialize.result.serverInfo.name}", expected "dreamwork"`,
      );
    }
    if (initialize.result.serverInfo.version !== packageJson.version) {
      fail(
        `initialize serverInfo.version is "${initialize.result.serverInfo.version}", expected "${packageJson.version}"`,
      );
    }
    report(
      `MCP initialize handshake completed (${initialize.result.serverInfo.name}@${initialize.result.serverInfo.version})`,
    );
  }

  const toolsList = frames.find((frame) => frame.id === 2);
  const tools = toolsList?.result?.tools;
  if (!Array.isArray(tools) || tools.length === 0) {
    fail("the installed server listed no tools");
  } else {
    // The bundled contracts must survive into the artifact: this tool's
    // outputSchema is generated from a canonical wire schema that only exists
    // in the private package. `search_jobs` carried this check until 1.3.0
    // removed it; `get_stats` is its successor canary: contract-derived from
    // the same private package, with a distinctive `applications` group.
    const getStats = tools.find((tool) => tool.name === "get_stats");
    if (!getStats?.outputSchema?.properties?.applications) {
      fail(
        "get_stats lost its contract-derived outputSchema in the packed artifact",
      );
    } else {
      report(
        `tools/list returned ${tools.length} tools with bundled contract output schemas`,
      );
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("\nverify-package FAILED:");
  for (const failure of failures) console.error(`  - ${failure}`);
  exitCode = 1;
} else {
  console.log("\nverify-package: packed artifact proof PASSED");
}
process.exit(exitCode);

/**
 * Drive a real MCP initialize + tools/list over stdio against the INSTALLED
 * bin and return everything it wrote to stdout. stderr is forwarded so a crash
 * is visible, but is deliberately not part of the purity assertion — logs
 * belong there.
 */
async function runHandshake(entryPath) {
  const child = spawn(process.execPath, [entryPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      // Guest mode: no key, and never touch the real API or write an install
      // id onto the machine running the proof.
      DREAMWORK_API_KEY: "",
      JOBLESS_API_TOKEN: "",
      DREAMWORK_API_URL: "http://127.0.0.1:1",
      DREAMWORK_TELEMETRY: "0",
    },
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const send = (message) => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "verify-package", version: "0.0.0" },
    },
  });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });

  const settled = await new Promise((resolvePromise) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolvePromise({ timedOut: true });
    }, HANDSHAKE_TIMEOUT_MS);

    // Both responses have arrived; nothing else to wait for.
    const checkDone = () => {
      if (stdout.includes('"id":2') || stdout.includes('"id": 2')) {
        clearTimeout(timer);
        child.stdin.end();
        child.kill("SIGTERM");
        resolvePromise({ timedOut: false });
      }
    };
    child.stdout.on("data", checkDone);
    child.on("exit", () => {
      clearTimeout(timer);
      resolvePromise({ timedOut: false });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolvePromise({ timedOut: false, error });
    });
  });

  if (settled.error) {
    throw new Error(`failed to launch the installed bin: ${settled.error.message}`);
  }
  if (settled.timedOut) {
    throw new Error(
      `the installed server did not answer initialize + tools/list within ${HANDSHAKE_TIMEOUT_MS}ms.\nstderr:\n${stderr}`,
    );
  }
  return stdout;
}
