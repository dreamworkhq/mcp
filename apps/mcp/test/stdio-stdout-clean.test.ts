import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");
const stdioEntry = resolve(pkgRoot, "src", "stdio.ts");
const tsxBin = resolve(pkgRoot, "node_modules", ".bin", "tsx");

// A stdio MCP server MUST write only JSON-RPC frames to stdout. If the
// entrypoint (or any dependency it loads) leaks non-protocol bytes onto
// stdout, clients like Claude Desktop desync their line parser and hang on
// tool calls. This drives the real entrypoint through an `initialize`
// handshake and asserts every stdout line is a parseable JSON-RPC message —
// all application logging must go to stderr.
test("stdio entrypoint keeps stdout free of non-JSON-RPC output", async () => {
  if (!existsSync(tsxBin)) {
    // Dependencies not installed (e.g. isolated env) — nothing to exercise.
    return;
  }

  let stdout = "";
  let stderr = "";
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(tsxBin, [stdioEntry], {
      cwd: pkgRoot,
      stdio: ["pipe", "pipe", "pipe"],
      // Force guest mode: no key needed to complete initialize.
      env: { ...process.env, DREAMWORK_API_KEY: "", JOBLESS_API_TOKEN: "" },
      // Windows needs shell:true so the .cmd wrapper is resolved from the
      // bare "tsx" path (the unix shell script alone can't be executed).
      shell: process.platform === "win32",
    });

    // Generous bound: under `turbo test` this file runs alongside ten other
    // test files, each potentially spawning its own tsx child, and a cold
    // tsx compile of the MCP SDK + zod dependency graph competes for CPU.
    // 15s was enough on an idle machine but flaked under parallel load.
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolvePromise();
    }, 60000);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
      // As soon as the initialize response lands, we have what we need —
      // tear down promptly instead of waiting out the full timeout.
      if (stdout.includes('"id":1') && stdout.includes('"result"')) {
        clearTimeout(timer);
        child.kill("SIGKILL");
        resolvePromise();
      }
    });
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      rejectPromise(err);
    });
    child.on("exit", () => {
      clearTimeout(timer);
      resolvePromise();
    });

    const initialize =
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "regression-test", version: "0.0.0" },
        },
      }) + "\n";
    child.stdin.write(initialize);
    // Give the server time to respond, then let the timeout tear it down.
  });

  const lines = stdout.split("\n").filter((line) => line.trim().length > 0);
  assert.ok(
    lines.length > 0,
    `expected at least one JSON-RPC frame on stdout within the startup budget; stdout was:\n${stdout}\nstderr was:\n${stderr}`,
  );
  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      assert.fail(
        `non-JSON-RPC bytes leaked onto stdout: ${JSON.stringify(line)}`,
      );
    }
    assert.equal(
      (parsed as { jsonrpc?: string }).jsonrpc,
      "2.0",
      `stdout line is JSON but not a JSON-RPC frame: ${line}`,
    );
  }

  // The initialize response must have come back — proves the stream stayed
  // parseable end to end, not just that startup was silent.
  const sawInitializeResult = lines.some((line) => {
    const msg = JSON.parse(line) as { id?: number; result?: unknown };
    return msg.id === 1 && msg.result !== undefined;
  });
  assert.ok(
    sawInitializeResult,
    `did not observe the initialize result on stdout; stdout was:\n${stdout}\nstderr:\n${stderr}`,
  );

  // Application logs (guest-mode notice) belong on stderr, proving logging
  // still works without ever touching stdout.
  assert.ok(
    stderr.includes("[mcp-stdio]"),
    `expected [mcp-stdio] startup logging on stderr; stderr was:\n${stderr}`,
  );
});

// A file at PROFILE_DOCUMENT_MAX_BYTES (10 MiB) base64-encodes to
// ceil(n / 3) * 4 bytes, past the SDK stdio default of 10 MiB. The frame
// still has to fit the 21 MiB cap in stdio.ts, one mebibyte above
// UPLOAD_ROUTE_BODY_LIMIT_BYTES.
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const MAX_RESUME_BASE64_CHARS = Math.ceil(MAX_RESUME_BYTES / 3) * 4;
const STDIO_MAX_BUFFER_SIZE = 21 * 1024 * 1024;

function writeAll(
  stream: NodeJS.WritableStream,
  data: Buffer,
): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    let offset = 0;
    const write = () => {
      while (offset < data.length) {
        const chunk = data.subarray(offset, offset + 64 * 1024);
        offset += chunk.length;
        if (!stream.write(chunk)) {
          stream.once("drain", write);
          return;
        }
      }
      resolvePromise();
    };
    stream.on("error", rejectPromise);
    write();
  });
}

test("stdio accepts a max-size resume frame above the SDK's 10 MiB default", async () => {
  if (!existsSync(tsxBin)) {
    return;
  }

  const frame = Buffer.from(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "upload_resume",
        arguments: {
          content: "A".repeat(MAX_RESUME_BASE64_CHARS),
          format: "pdf",
        },
      },
    }) + "\n",
  );
  assert.ok(frame.length > 10 * 1024 * 1024);
  assert.ok(frame.length <= STDIO_MAX_BUFFER_SIZE);

  let stdout = "";
  let stderr = "";
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(tsxBin, [stdioEntry], {
      cwd: pkgRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, DREAMWORK_API_KEY: "", JOBLESS_API_TOKEN: "" },
      shell: process.platform === "win32",
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolvePromise();
    }, 60000);

    const finish = () => {
      clearTimeout(timer);
      child.kill("SIGKILL");
      resolvePromise();
    };

    child.stdout.on("data", (d) => {
      stdout += d.toString();
      const complete = stdout.split("\n").some((line) => {
        if (!line.trim()) return false;
        try {
          const msg = JSON.parse(line) as { id?: number; result?: unknown };
          return msg.id === 2 && msg.result !== undefined;
        } catch {
          return false;
        }
      });
      if (complete) finish();
    });
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      rejectPromise(err);
    });
    child.on("exit", () => {
      clearTimeout(timer);
      resolvePromise();
    });

    const initialize =
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "buffer-test", version: "0.0.0" },
        },
      }) + "\n";
    child.stdin.write(initialize, () => {
      if (child.killed || child.exitCode !== null) return;
      writeAll(child.stdin, frame).catch((err) => {
        clearTimeout(timer);
        rejectPromise(err);
      });
    });
  });

  assert.equal(
    stderr.includes("ReadBuffer exceeded maximum size"),
    false,
    `stdio read buffer rejected a max-size resume frame; stderr was:\n${stderr}`,
  );
  const sawToolResult = stdout.split("\n").some((line) => {
    if (!line.trim()) return false;
    const msg = JSON.parse(line) as { id?: number; result?: unknown };
    return msg.id === 2 && msg.result !== undefined;
  });
  assert.ok(
    sawToolResult,
    `max-size upload_resume frame produced no JSON-RPC result; stdout was:\n${stdout.slice(0, 500)}\nstderr:\n${stderr}`,
  );
});
