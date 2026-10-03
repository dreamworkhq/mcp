const PROFILE_NAMES = new Set(["constrained", "standard"]);

function positiveInteger(name, value) {
  if (value == null || value === "") return undefined;
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw new Error(`${name} must be a positive integer`);
  }
  return Number(value);
}

export function resolveValidationProfile(env = process.env) {
  let name = env.DREAMWORK_VALIDATION_PROFILE?.trim().toLowerCase();
  if (!name) name = "standard";
  if (!PROFILE_NAMES.has(name)) {
    throw new Error(
      "DREAMWORK_VALIDATION_PROFILE must be constrained or standard",
    );
  }

  if (name !== "constrained") {
    return { name, testWorkers: undefined, nodeHeapMb: undefined };
  }

  return {
    name,
    testWorkers:
      positiveInteger("DREAMWORK_TEST_WORKERS", env.DREAMWORK_TEST_WORKERS) ?? 2,
    nodeHeapMb:
      positiveInteger("DREAMWORK_NODE_HEAP_MB", env.DREAMWORK_NODE_HEAP_MB) ?? 2048,
  };
}

export function applyNodeHeapLimit(env, nodeHeapMb) {
  const child = { ...env };
  if (nodeHeapMb === undefined) return child;
  const existing = child.NODE_OPTIONS?.replace(
    /(?:^|\s)--max(?:-|_)old(?:-|_)space(?:-|_)size(?:=\S+|\s+\S+)/g,
    " ",
  ).trim();
  child.NODE_OPTIONS = [existing, `--max-old-space-size=${nodeHeapMb}`]
    .filter(Boolean)
    .join(" ");
  return child;
}
