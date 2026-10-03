import assert from "node:assert/strict";
import test from "node:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveInstallId, stateDir } from "../src/install-id.js";

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "dreamwork-install-id-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Clear opt-out env so a developer's shell setting can't skew these tests.
function withCleanEnv(fn: () => void): void {
  const telemetry = process.env.DREAMWORK_TELEMETRY;
  const doNotTrack = process.env.DO_NOT_TRACK;
  delete process.env.DREAMWORK_TELEMETRY;
  delete process.env.DO_NOT_TRACK;
  try {
    fn();
  } finally {
    if (telemetry === undefined) delete process.env.DREAMWORK_TELEMETRY;
    else process.env.DREAMWORK_TELEMETRY = telemetry;
    if (doNotTrack === undefined) delete process.env.DO_NOT_TRACK;
    else process.env.DO_NOT_TRACK = doNotTrack;
  }
}

test("generates and persists an install id on first call", () => {
  withCleanEnv(() =>
    withTempDir((dir) => {
      const id = resolveInstallId(dir);
      assert.ok(id.length > 0);
      const file = join(stateDir(dir), "install-id");
      assert.ok(existsSync(file));
      assert.equal(readFileSync(file, "utf8").trim(), id);
    }),
  );
});

test("reuses the same id on a second call", () => {
  withCleanEnv(() =>
    withTempDir((dir) => {
      const first = resolveInstallId(dir);
      const second = resolveInstallId(dir);
      assert.equal(second, first);
    }),
  );
});

test("DREAMWORK_TELEMETRY=0 returns empty and writes nothing", () => {
  withCleanEnv(() =>
    withTempDir((dir) => {
      process.env.DREAMWORK_TELEMETRY = "0";
      assert.equal(resolveInstallId(dir), "");
      assert.equal(existsSync(join(stateDir(dir), "install-id")), false);
    }),
  );
});

test("DO_NOT_TRACK=1 returns empty and writes nothing", () => {
  withCleanEnv(() =>
    withTempDir((dir) => {
      process.env.DO_NOT_TRACK = "1";
      assert.equal(resolveInstallId(dir), "");
      assert.equal(existsSync(join(stateDir(dir), "install-id")), false);
    }),
  );
});

test("fails open to a per-process id when the state dir is unwritable", () => {
  withCleanEnv(() => {
    // Point the base dir at a path under an existing regular FILE so mkdir must
    // fail (a file cannot contain a subdirectory). Fail-open must return a
    // non-empty id without throwing.
    withTempDir((dir) => {
      const filePath = join(dir, "not-a-dir");
      // Create a file where a directory is expected, so mkdir under it fails.
      writeFileSync(filePath, "x");
      let id = "";
      assert.doesNotThrow(() => {
        id = resolveInstallId(filePath);
      });
      assert.ok(id.length > 0);
      // Nothing should have been persisted (the write path failed).
      assert.equal(existsSync(join(stateDir(filePath), "install-id")), false);
    });
  });
});
