import { createHash } from "node:crypto";

/**
 * Duration assignment for the CI test matrices.
 *
 * Vitest `--shard` and Node `--test-shard` split a sorted file list into equal
 * counts. A few long files then land on one runner and the 15-minute job limit
 * cancels that runner even though no assertion failed. The committed plan
 * packs files by measured duration instead. It applies only when the shard
 * denominator matches the plan (CI's 6 and 2). Local `verify:ci` uses four API
 * shards and keeps the runner's own split.
 */

export function parseShard(value) {
  const raw = String(value ?? "").trim();
  const match = /^([1-9]\d*)\/([1-9]\d*)$/u.exec(raw);
  const index = match ? Number(match[1]) : NaN;
  const count = match ? Number(match[2]) : NaN;
  if (!match || index > count) return null;
  return { index, count, label: `${index}/${count}` };
}

export function normalizePlanPath(file) {
  const rel = String(file ?? "").replaceAll("\\", "/");
  if (!rel || rel.startsWith("/") || rel.split("/").includes("..")) {
    throw new Error(`shard plan path must be a relative file, received ${JSON.stringify(file)}`);
  }
  return rel;
}

function hashBucket(file, count) {
  const digest = createHash("sha256").update(file).digest();
  return digest.readUInt32BE(0) % count;
}

/**
 * Longest-processing-time packing. Each file is given to the shard whose
 * `workers`-wide makespan grows the least, which is how the two-core CI
 * runners actually spend the time.
 */
export function balanceByMakespan(files, shardCount, workers = 2) {
  if (!Number.isInteger(shardCount) || shardCount < 1) {
    throw new Error(`shard count must be a positive integer, received ${shardCount}`);
  }
  if (!Number.isInteger(workers) || workers < 1) {
    throw new Error(`worker count must be a positive integer, received ${workers}`);
  }
  const shards = Array.from({ length: shardCount }, () => ({
    files: [],
    loads: Array.from({ length: workers }, () => 0),
  }));
  const ordered = [...files].sort((a, b) => {
    const duration = b.durationMs - a.durationMs;
    if (duration !== 0) return duration;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
  for (const file of ordered) {
    const durationMs = Number(file.durationMs);
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new Error(`duration for ${file.path} must be a non-negative number`);
    }
    const path = normalizePlanPath(file.path);
    let best = 0;
    let bestMakespan = Infinity;
    let bestSum = Infinity;
    for (let index = 0; index < shards.length; index += 1) {
      const loads = shards[index].loads;
      const next = Math.min(...loads) + durationMs;
      const makespan = Math.max(next, ...loads);
      const sum = loads.reduce((total, load) => total + load, 0) + durationMs;
      if (makespan < bestMakespan || (makespan === bestMakespan && sum < bestSum)) {
        best = index;
        bestMakespan = makespan;
        bestSum = sum;
      }
    }
    const target = shards[best];
    let worker = 0;
    for (let index = 1; index < target.loads.length; index += 1) {
      if (target.loads[index] < target.loads[worker]) worker = index;
    }
    target.loads[worker] += durationMs;
    target.files.push(path);
  }
  return shards.map((shard) => {
    shard.files.sort();
    return {
      files: shard.files,
      makespanMs: shard.loads.length === 0 ? 0 : Math.max(...shard.loads),
      durationMs: shard.loads.reduce((total, load) => total + load, 0),
    };
  });
}

export function loadShardPlan(raw) {
  if (!raw || raw.schemaVersion !== 1) {
    throw new Error("ci shard plan schemaVersion must be 1");
  }
  for (const lane of ["api", "web"]) {
    const shards = raw[lane]?.shards;
    if (!Array.isArray(shards) || shards.length === 0) {
      throw new Error(`ci shard plan ${lane} must list at least one shard`);
    }
    const seen = new Set();
    for (const shard of shards) {
      if (!Array.isArray(shard) || shard.length === 0) {
        throw new Error(`ci shard plan ${lane} has an empty shard`);
      }
      for (const file of shard) {
        const path = normalizePlanPath(file);
        if (seen.has(path)) {
          throw new Error(`ci shard plan lists ${path} more than once`);
        }
        seen.add(path);
      }
    }
  }
  return raw;
}

/**
 * Files in the plan keep their shard. Files the plan does not mention (new
 * since the measurement) are hashed into exactly one shard. Plan files that
 * no longer exist are dropped. The shard must still resolve to at least one
 * discovered file, or the runner would report a green empty run.
 */
export function selectShardFiles({ planShards, discovered, shardIndex }) {
  if (!Array.isArray(planShards) || planShards.length === 0) {
    throw new Error("shard plan has no shards");
  }
  if (!Number.isInteger(shardIndex) || shardIndex < 1 || shardIndex > planShards.length) {
    throw new Error(`shard ${shardIndex} is outside 1..${planShards.length}`);
  }
  const discoveredSet = new Set();
  for (const file of discovered) {
    discoveredSet.add(normalizePlanPath(file));
  }
  const buckets = planShards.map(() => []);
  const assigned = new Set();
  for (let index = 0; index < planShards.length; index += 1) {
    for (const file of planShards[index]) {
      const path = normalizePlanPath(file);
      if (assigned.has(path)) {
        throw new Error(`ci shard plan lists ${path} more than once`);
      }
      assigned.add(path);
      if (discoveredSet.has(path)) buckets[index].push(path);
    }
  }
  const extras = [...discoveredSet].filter((file) => !assigned.has(file)).sort();
  for (const file of extras) {
    buckets[hashBucket(file, buckets.length)].push(file);
  }
  const selected = buckets[shardIndex - 1].sort();
  if (selected.length === 0) {
    throw new Error(
      `shard ${shardIndex}/${planShards.length} resolved to zero test files`,
    );
  }
  return selected;
}
