import type { z } from "zod";

/** Methods currently supported by the contract registry. */
export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/**
 * Auth requirement vocabulary, aligned with
 * `docs/contracts/api-endpoint-inventory.json`. `user-session` means an
 * HttpOnly `dw_session` cookie OR a bearer session token — represented in
 * OpenAPI as security alternatives.
 */
export type OperationAuth = "public" | "user-session";

export interface OperationParameter {
  name: string;
  in: "path" | "query";
  required: boolean;
  description: string;
  /** Wire schema for the parameter, converted with `io: "input"`. */
  schema: z.ZodType;
}

export interface OperationRequestBody {
  description: string;
  contentType: "application/json";
  required: boolean;
  /**
   * Named request component (must be registered on the request registry),
   * converted with `io: "input"`.
   */
  schema: z.ZodType;
}

export interface OperationResponse {
  description: string;
  /**
   * Named response component (must be registered on the response registry).
   * Omit for empty-body responses (e.g. 204).
   */
  schema?: z.ZodType;
}

/**
 * How much a documented contract is actually worth, weakest first. A contract
 * that nothing verifies is a comment; this ladder makes the difference
 * explicit and reviewable instead of implied by whichever tests happen to
 * exist.
 *
 * - `documented`      — a descriptor exists; nothing asserts the live handler
 *                       matches it.
 * - `handler-verified`— an API test round-trips real injected responses
 *                       through the schema.
 * - `consumer-adopted`— a real consumer compiles against the generated types,
 *                       so a breaking change fails a typecheck.
 * - `runtime-validated` — a shipped runtime (the MCP CLI) parses responses
 *                       through the canonical schema and fails closed.
 *
 * Order is load-bearing: `docs/contracts/api-contract-coverage.json` records a
 * per-operation minimum and the coverage verifier compares by index.
 */
export const CONTRACT_MATURITIES = [
  "documented",
  "handler-verified",
  "consumer-adopted",
  "runtime-validated",
] as const;

export type ContractMaturity = (typeof CONTRACT_MATURITIES)[number];

/**
 * Offline description of one HTTP operation. This metadata — not the running
 * Fastify instance — is the OpenAPI source of truth.
 */
export interface OperationDescriptor {
  /** Stable camelCase identifier; never renamed once published. */
  operationId: string;
  method: HttpMethod;
  /** OpenAPI-style path template, e.g. `/jobs/{id}`. */
  path: string;
  /** The Fastify registration path, e.g. `/jobs/:id` (inventory linkage). */
  fastifyPath: string;
  summary: string;
  description?: string;
  tags: readonly string[];
  auth: OperationAuth;
  /**
   * The verification strength this contract actually has today. Emitted as
   * `x-dreamwork-contract-maturity` so the generated document carries the same
   * honesty the manifest enforces.
   */
  contractMaturity: ContractMaturity;
  parameters?: readonly OperationParameter[];
  requestBody?: OperationRequestBody;
  /** Keyed by status code string ("200", "401", ...). */
  responses: Readonly<Record<string, OperationResponse>>;
}

const METHOD_ORDER: readonly HttpMethod[] = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
];

/** Canonical ordering: path ascending (codepoint order), then method order. */
export function compareOperations(
  a: OperationDescriptor,
  b: OperationDescriptor,
): number {
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  return METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method);
}
