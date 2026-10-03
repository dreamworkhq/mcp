#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  applyNodeHeapLimit,
  resolveValidationProfile,
} from "./validation-profile.mjs";

const RUNNER_PACKAGES = {
  "tsx-mcp": "apps/mcp/package.json",
  "tsx-web": "apps/web/package.json",
};
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

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

export function resolveNodeTestCommand(parsed, env = process.env, repoRoot = REPO_ROOT) {
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
  return {
    command: process.execPath,
    args: [...runnerArgs, "--test", ...concurrency, ...resolveNodeTestShard(env, testArgs), ...testArgs],
    env: applyNodeHeapLimit(env, profile.nodeHeapMb),
  };
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
    command = resolveNodeTestCommand(parseNodeTestArgs(argv), env);
  } catch (error) {
    console.error(`run-node-tests: ${error.message}`);
    return 2;
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
