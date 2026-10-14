#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadShardPlan, parseShard, selectShardFiles } from "./ci-test-shards.mjs";
import {
  applyNodeHeapLimit,
  resolveValidationProfile,
} from "./validation-profile.mjs";

const RUNNER_PACKAGES = {
  "tsx-mcp": "apps/mcp/package.json",
  "tsx-web": "apps/web/package.json",
};
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SHARD_PLAN_PATH = fileURLToPath(new URL("./ci-test-shard-plan.json", import.meta.url));
const NODE_TIMING_REPORTER = fileURLToPath(
  new URL("./node-test-timing-reporter.mjs", import.meta.url),
);

export function parseNodeTestArgs(argv) {
  const [runner, separator, ...rawTestArgs] = argv;
  const testArgs = rawTestArgs[0] === "--" ? rawTestArgs.slice(1) : rawTestArgs;
  if (!["node", ...Object.keys(RUNNER_PACKAGES)].includes(runner)) {
    throw new Error("runner must be node, tsx-web, or tsx-mcp");
  }
  if (separator !== "--") throw new Error("test arguments require a `--` separator");
  if (testArgs.length === 0) throw new Error("at least one test path is required");
  return { runner, testArgs };
}

/**
 * CI splits one Node test lane across runners with `DREAMWORK_TEST_SHARD=N/M`,
 * the same shape the API lane uses for `VITEST_SHARD`. Node applies the shard
 * to its expanded file list, so every file runs in exactly one shard.
 */
export function resolveNodeTestShard(env, testArgs) {
  const raw = env.DREAMWORK_TEST_SHARD;
  if (raw === undefined || raw === "") return [];
  const match = /^([1-9]\d*)\/([1-9]\d*)$/u.exec(raw.trim());
  if (!match || Number(match[1]) > Number(match[2])) {
    throw new Error(
      `DREAMWORK_TEST_SHARD must be a positive shard in N/M format with N <= M; received ${JSON.stringify(raw)}.`,
    );
  }
  if (testArgs.some((arg) => arg === "--test-shard" || arg.startsWith("--test-shard="))) {
    throw new Error(
      "DREAMWORK_TEST_SHARD cannot be combined with an explicit --test-shard argument; remove one shard configuration.",
    );
  }
  return [`--test-shard=${match[1]}/${match[2]}`];
}

export function resolveNodeTestCommand(
  parsed,
  env = process.env,
  repoRoot = REPO_ROOT,
  options = {},
) {
  const profile = resolveValidationProfile(env);
  const testArgs = [];
  for (let index = 0; index < parsed.testArgs.length; index += 1) {
    const arg = parsed.testArgs[index];
    if (
      profile.testWorkers !== undefined &&
      (arg === "--test-concurrency" ||
        /^--max(?:-|_)old(?:-|_)space(?:-|_)size$/.test(arg))
    ) {
      index += 1;
      continue;
    }
    if (
      profile.testWorkers !== undefined &&
      arg.startsWith("--test-concurrency=")
    ) {
      continue;
    }
    if (
      profile.testWorkers !== undefined &&
      /^--max(?:-|_)old(?:-|_)space(?:-|_)size=/.test(arg)
    ) {
      continue;
    }
    testArgs.push(arg);
  }
  const concurrency =
    profile.testWorkers !== undefined
      ? [`--test-concurrency=${profile.testWorkers}`]
      : env.GITHUB_ACTIONS === "true" &&
          !testArgs.some((arg) => arg.startsWith("--test-concurrency"))
        ? ["--test-concurrency=2"]
        : [];
  const runnerArgs = parsed.runner === "node"
    ? []
    : [
        createRequire(resolve(repoRoot, RUNNER_PACKAGES[parsed.runner])).resolve("tsx/cli"),
      ];
  const shardFiles = options.shardFiles?.map(literalNodeTestPath);
  if (shardFiles && shardFiles.length === 0) {
    throw new Error("Duration shard plan resolved to zero test files.");
  }
  const shardFlags = shardFiles
    ? explicitShardConflict(testArgs)
    : resolveNodeTestShard(env, testArgs);
  const timingReporter = env.DREAMWORK_TEST_TIMING_REPORT
    ? [
        "--test-reporter=tap",
        "--test-reporter-destination=stdout",
        `--test-reporter=${NODE_TIMING_REPORTER}`,
        // Node fsyncs each reporter destination. A null device rejects that
        // call and fails the process after the tests themselves passed.
        `--test-reporter-destination=${dirname(env.DREAMWORK_TEST_TIMING_REPORT)}/node-reporter-output`,
      ]
    : [];
  return {
    command: process.execPath,
    args: [
      ...runnerArgs,
      "--test",
      ...concurrency,
      ...timingReporter,
      ...shardFlags,
      ...(shardFiles ?? testArgs),
    ],
    env: applyNodeHeapLimit(env, profile.nodeHeapMb),
  };
}

// Node treats a test path as a glob. A directory named `[id]` is a character
// class, matches nothing, and the run still exits 0. `[[]` is a literal `[`.
function literalNodeTestPath(file) {
  return file.replaceAll("[", "[[]");
}

function explicitShardConflict(testArgs) {
  if (testArgs.some((arg) => arg === "--test-shard" || arg.startsWith("--test-shard="))) {
    throw new Error(
      "DREAMWORK_TEST_SHARD cannot be combined with an explicit --test-shard argument; remove one shard configuration.",
    );
  }
  return [];
}

export async function resolveWebShardFiles(env = process.env, {
  plan,
  discover = () => discoverWebTests(process.cwd()),
} = {}) {
  const parsed = parseShard(env.DREAMWORK_TEST_SHARD);
  if (!parsed) return undefined;
  const resolved = plan ?? loadShardPlan(JSON.parse(readFileSync(SHARD_PLAN_PATH, "utf8")));
  if (resolved.web.shards.length !== parsed.count) return undefined;
  return selectShardFiles({
    planShards: resolved.web.shards,
    discovered: await discover(),
    shardIndex: parsed.index,
  });
}

function discoverWebTests(cwd) {
  const files = [];
  const root = join(cwd, "src");
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) {
        files.push(relative(cwd, full).replaceAll("\\", "/"));
      }
    }
  };
  visit(root);
  return files;
}

export function terminateTestTree(
  child,
  signal,
  {
    platform = process.platform,
    spawnSyncFn = spawnSync,
    killGroup = (pid, forwardedSignal) => process.kill(-pid, forwardedSignal),
  } = {},
) {
  if (child.killed) return;
  if (platform === "win32" && child.pid) {
    const result = spawnSyncFn(
      "taskkill.exe",
      ["/pid", String(child.pid), "/t", "/f"],
      { windowsHide: true, stdio: "ignore" },
    );
    if (!result?.error && result?.status === 0) return;
  }
  if (platform !== "win32" && child.pid) {
    try {
      killGroup(child.pid, signal);
      return;
    } catch {
      // Fall through when the process group already exited.
    }
  }
  child.kill(signal);
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  let command;
  try {
    const parsed = parseNodeTestArgs(argv);
    const shardFiles = await resolveWebShardFiles(env);
    command = resolveNodeTestCommand(parsed, env, REPO_ROOT, { shardFiles });
  } catch (error) {
    console.error(`run-node-tests: ${error.message}`);
    return 2;
  }
  if (env.DREAMWORK_TEST_TIMING_REPORT) {
    mkdirSync(dirname(env.DREAMWORK_TEST_TIMING_REPORT), { recursive: true });
  }
  const child = spawn(command.command, command.args, {
    env: command.env,
    stdio: "inherit",
    detached: process.platform !== "win32",
  });
  return new Promise((resolveExit) => {
    const signals =
      process.platform === "win32"
        ? ["SIGINT", "SIGTERM", "SIGBREAK"]
        : ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"];
    const forward = (signal) => terminateTestTree(child, signal);
    const cleanup = () => {
      for (const signal of signals) process.removeListener(signal, forward);
    };
    for (const signal of signals) process.once(signal, forward);
    child.once("error", (error) => {
      cleanup();
      console.error(`Unable to start Node tests: ${error.message}`);
      resolveExit(1);
    });
    child.once("exit", (code, signal) => {
      cleanup();
      resolveExit(signal ? 1 : (code ?? 1));
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
