import type { z } from "zod";
import { MCP_RESOURCE_HEADER } from "@jobless/assistant-contracts";

function errorValueToMessage(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.length > 0) {
    return record.message;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export function formatApiErrorMessage(err: unknown, status: number): string {
  // A body can carry a code in `error` and a reason in `message`. The agent
  // needs both when both are there ("api_key_scope_required" alone says
  // nothing about revoking the key), and the reason alone when that is all
  // the route sent.
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    const message =
      typeof record.message === "string" && record.message.length > 0
        ? record.message
        : null;
    if (
      message &&
      typeof record.error === "string" &&
      record.error.length > 0
    ) {
      return `${record.error}: ${message}`;
    }
    if (message) return message;
    if ("error" in record) {
      const fromError = errorValueToMessage(record.error);
      if (fromError) return fromError;
    }
  }

  return errorValueToMessage(err) ?? `API ${status}`;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

export class AuthRequiredError extends Error {
  constructor() {
    super("AUTH_REQUIRED");
    this.name = "AuthRequiredError";
  }
}

/**
 * Expected operational API failure (non-2xx response, unreachable API, or a
 * non-JSON payload). Carries a sanitized, agent-visible message so tool
 * handlers can return it verbatim with `isError: true` instead of leaking
 * internals through an uncaught exception. `status` is 0 when no HTTP
 * response was received (network failure).
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Typed HTTP client for the Dreamwork API. Used by MCP server to call API endpoints. */
export class ApiClient {
  // Analytics labeling hints only — never auth signals. Composed from the MCP
  // client's `initialize` handshake (client label) and the connection identity
  // (the per-install id for the stdio CLI). The API reads these in
  // apps/api/src/telemetry/mcp-usage.ts.
  private clientLabel?: string;
  private sessionId?: string;

  constructor(
    private baseUrl: string,
    private token: string,
    /**
     * How long one request may take before the tool gives up on it. Without a
     * ceiling a hung API call wedges the tool call, and with it the agent's
     * turn, for as long as the host is willing to wait.
     */
    private timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
    /** Hosted sessions bind every API request to the audience they advertised. */
    private resource?: string,
  ) {}

  /** Whether the client has a valid auth token. */
  get isAuthenticated(): boolean {
    return this.token.length > 0;
  }

  /** Whether a client label has been captured yet (used for lazy backfill). */
  get hasClientInfo(): boolean {
    return Boolean(this.clientLabel);
  }

  /**
   * Record which MCP client is calling (Codex, Claude Code, Cursor, …) from the
   * `initialize` handshake. Composes a single `name/version` label; version is
   * optional. No name → no label (nothing to attribute).
   */
  setClientInfo(name?: string, version?: string): void {
    const trimmedName = name?.trim();
    if (!trimmedName) return;
    const trimmedVersion = version?.trim();
    this.clientLabel = trimmedVersion
      ? `${trimmedName}/${trimmedVersion}`
      : trimmedName;
  }

  /** Record the per-connection identity (the stdio CLI's per-install id). */
  setSessionId(id?: string): void {
    const trimmed = id?.trim();
    this.sessionId = trimmed || undefined;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // Tag every proxied call so the API can attribute usage to the MCP
      // surface (analytics labeling only — never an auth decision). The API
      // reads this in apps/api/src/telemetry/mcp-usage.ts.
      "x-dreamwork-surface": "mcp",
    };
    if (this.clientLabel) {
      headers["x-dreamwork-client"] = this.clientLabel;
    }
    if (this.sessionId) {
      headers["x-dreamwork-mcp-session"] = this.sessionId;
    }
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    if (this.resource) headers[MCP_RESOURCE_HEADER] = this.resource;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        // The request left, so the API may have acted on it. Saying "failed"
        // would invite a retry of something like an application that went.
        throw new ApiError(
          `The Dreamwork API did not answer within ${Math.round(this.timeoutMs / 1000)} seconds, so whether it acted is unknown. Check list_tasks or the record the call would have changed before trying again.`,
          0,
        );
      }
      // Network-level failure (DNS, refused, TLS). Surface a stable sanitized
      // message rather than the raw fetch error, which can embed internals.
      throw new ApiError(
        "Unable to reach the Dreamwork API — check network connectivity and DREAMWORK_API_URL.",
        0,
      );
    }

    // 401 is the only status that means "this caller has no usable identity".
    // 403 means the identity is known and the API refused it for a reason it
    // names in the body (admin gate, ban, unverified email, billing policy);
    // that reason is the actionable text, so it falls through to `ApiError`.
    if (res.status === 401) {
      throw new AuthRequiredError();
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(formatApiErrorMessage(err, res.status), res.status);
    }

    try {
      return (await res.json()) as T;
    } catch {
      throw new ApiError(
        "Dreamwork API returned a non-JSON response.",
        res.status,
      );
    }
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  /**
   * GET a response covered by a canonical wire contract and decode it.
   *
   * Same transport as {@link get} — headers, auth, non-2xx handling, network
   * and non-JSON sanitization are untouched. The only addition is the success
   * body passing through the operation's canonical schema:
   *
   * - Unknown (additive) fields are accepted and stripped, so a new API field
   *   can never break an already-published tarball.
   * - Missing or invalid KNOWN fields fail closed with an `ApiError`.
   *
   * The failure message names the operation and nothing else. The payload may
   * hold the user's own private data and Zod's issue list narrates its shape;
   * neither belongs in agent-visible text.
   */
  async getValidated<Schema extends z.ZodType>(
    path: string,
    operationId: string,
    schema: Schema,
  ): Promise<z.output<Schema>> {
    const value = await this.get<unknown>(path);
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      // Breadcrumb on stderr (stdout is the JSON-RPC channel). Without it a
      // contract/API divergence is invisible to both sides: the API logs a
      // healthy 200 and the CLI silently turns it into an error for the user.
      // Operation id only — never the payload or the validator's issue list.
      console.error(
        `[dreamwork-mcp] response failed contract validation for ${operationId}`,
      );
      throw new ApiError(
        `Dreamwork API returned malformed data for ${operationId}.`,
        200,
      );
    }
    return parsed.data;
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  async del<T = unknown>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}
