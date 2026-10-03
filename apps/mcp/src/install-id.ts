import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Anonymous per-install telemetry id. A random UUID persisted on the user's
// machine on first run and reused thereafter, so guest MCP usage can be counted
// by unique installs rather than per-process launches. It is NEVER derived from
// any machine attribute — it is an opaque return-visit token with no personal
// data. Attaches only to guest (unauthenticated) MCP calls. See the README
// Telemetry note for the opt-out.

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

/** Opt-out: DREAMWORK_TELEMETRY=0/false/no/off OR DO_NOT_TRACK=1/true/yes/on. */
function telemetryDisabled(): boolean {
  const telemetry = process.env.DREAMWORK_TELEMETRY?.trim().toLowerCase();
  if (telemetry && FALSE_VALUES.has(telemetry)) return true;
  const doNotTrack = process.env.DO_NOT_TRACK?.trim().toLowerCase();
  if (doNotTrack && TRUE_VALUES.has(doNotTrack)) return true;
  return false;
}

/**
 * OS-appropriate state directory for the persisted install id. Honors
 * XDG_STATE_HOME, else ~/.local/state/dreamwork on linux/mac and
 * %LOCALAPPDATA%\dreamwork on win32. `baseDir` is injectable for testability.
 */
export function stateDir(baseDir?: string): string {
  if (baseDir) return join(baseDir, "dreamwork");
  const xdgStateHome = process.env.XDG_STATE_HOME?.trim();
  if (xdgStateHome) return join(xdgStateHome, "dreamwork");
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA?.trim();
    if (localAppData) return join(localAppData, "dreamwork");
    return join(homedir(), "AppData", "Local", "dreamwork");
  }
  return join(homedir(), ".local", "state", "dreamwork");
}

/**
 * Resolve the stable install id. Returns "" when telemetry is opted out.
 * Fail-open and silent: any filesystem error falls back to an in-memory
 * per-process UUID and NEVER throws (a telemetry id must not crash the server).
 * `baseDir` overrides the state dir base for tests.
 */
export function resolveInstallId(baseDir?: string): string {
  if (telemetryDisabled()) return "";

  try {
    const dir = stateDir(baseDir);
    const file = join(dir, "install-id");
    try {
      const existing = readFileSync(file, "utf8").trim();
      if (existing) return existing;
    } catch {
      // Missing/unreadable — fall through to generate and persist below.
    }
    const id = randomUUID();
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, id, "utf8");
    return id;
  } catch {
    // Read-only FS, sandbox, permissions, etc. Fail open to a per-process id so
    // MCP startup is never blocked or delayed. No stdout output — stdio uses
    // stdout for JSON-RPC.
    return randomUUID();
  }
}
