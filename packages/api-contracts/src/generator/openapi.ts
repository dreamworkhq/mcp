import { z } from "zod";
import {
  compareOperations,
  type HttpMethod,
  type OperationDescriptor,
} from "../operation.js";
import {
  requestSchemaRegistry,
  responseSchemaRegistry,
} from "../registry.js";

/**
 * Deterministic, offline OpenAPI 3.1 assembler.
 *
 * Everything here is pure data transformation: no database, config, provider,
 * network, queue, server, or worker work. Given the same operation registry
 * and the same pinned zod version, the output object (and its JSON
 * serialization) is byte-identical run to run.
 */

export const OPENAPI_VERSION = "3.1.0";

/** Deliberately static: artifact changes must come from contract changes. */
export const DOCUMENT_INFO = {
  title: "Dreamwork API",
  description:
    "Typed contracts for the Dreamwork product API. Generated offline from " +
    "@jobless/api-contracts; the operation registry, not the running server, " +
    "is the source of truth. Auth: send the dw_session cookie (browser) or a " +
    "bearer session token (agents/MCP).",
  version: "0.1.0",
} as const;

export const SECURITY_SCHEMES = {
  bearerSession: {
    type: "http",
    scheme: "bearer",
    description:
      "Session token (or sk_* developer API key) in the Authorization header.",
  },
  cookieSession: {
    type: "apiKey",
    in: "cookie",
    name: "dw_session",
    description: "HttpOnly browser session cookie.",
  },
} as const;

type JsonObject = Record<string, unknown>;

export class ContractGenerationError extends Error {}

const METHOD_ORDER: readonly HttpMethod[] = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
];

const COMPONENT_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
const OPERATION_ID_PATTERN = /^[a-z][A-Za-z0-9]*$/;
const STATUS_CODE_PATTERN = /^[1-5][0-9][0-9]$/;

function fail(context: string, message: string): never {
  throw new ContractGenerationError(`[${context}] ${message}`);
}

/**
 * Convert one zod schema in isolation (parameter schemas). Unrepresentable
 * constructs throw with the operation/parameter context attached.
 */
function convertStandalone(
  schema: z.ZodType,
  io: "input" | "output",
  context: string,
): JsonObject {
  let converted: JsonObject;
  try {
    converted = z.toJSONSchema(schema, {
      target: "draft-2020-12",
      io,
      unrepresentable: "throw",
      cycles: "throw",
      reused: "inline",
    }) as JsonObject;
  } catch (err) {
    fail(context, `schema is not representable: ${(err as Error).message}`);
  }
  const { $schema: _dialect, $id: _id, ...rest } = converted;
  return rest;
}

/**
 * Convert a component registry. `uri` makes cross-component references point
 * at `#/components/schemas/<id>`; the per-schema `$schema`/`$id` bookkeeping
 * keys are stripped because components live inside the OpenAPI document.
 */
function convertRegistry(
  registry: typeof responseSchemaRegistry,
  io: "input" | "output",
  context: string,
): Record<string, JsonObject> {
  let result: { schemas: Record<string, JsonObject> };
  try {
    result = z.toJSONSchema(registry, {
      target: "draft-2020-12",
      io,
      unrepresentable: "throw",
      cycles: "throw",
      reused: "inline",
      uri: (id) => `#/components/schemas/${id}`,
    }) as { schemas: Record<string, JsonObject> };
  } catch (err) {
    // Re-run each component standalone to attribute the failure to stable
    // schema names instead of a bare zod message.
    const culprits: string[] = [];
    for (const [id, schema] of registry._idmap.entries()) {
      try {
        z.toJSONSchema(schema, {
          target: "draft-2020-12",
          io,
          unrepresentable: "throw",
          cycles: "throw",
          reused: "inline",
        });
      } catch {
        culprits.push(id);
      }
    }
    fail(
      context,
      `registry conversion failed${culprits.length > 0 ? ` for schema(s): ${culprits.sort().join(", ")}` : ""}: ${(err as Error).message}`,
    );
  }
  const cleaned: Record<string, JsonObject> = {};
  for (const [id, schema] of Object.entries(result.schemas)) {
    if (!COMPONENT_NAME_PATTERN.test(id)) {
      fail(context, `component id "${id}" is not a stable PascalCase name`);
    }
    const { $schema: _dialect, $id: _id, ...rest } = schema;
    cleaned[id] = rest;
  }
  return cleaned;
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) {
    const value = record[key];
    if (value !== undefined) sorted[key] = value;
  }
  return sorted;
}

/** Ref for a schema registered on either component registry. */
function componentRef(schema: z.ZodType, context: string): JsonObject {
  const id =
    responseSchemaRegistry.get(schema)?.id ??
    requestSchemaRegistry.get(schema)?.id;
  if (!id) {
    fail(
      context,
      "schema is not a registered component; register it via responseComponent/requestComponent/sharedComponent",
    );
  }
  return { $ref: `#/components/schemas/${id}` };
}

function pathTemplateParams(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] as string);
}

/**
 * Registry invariants: canonical (path, method) ordering, unique operation
 * ids, unique (method, path) pairs, path templates matching declared path
 * parameters, and valid status-code keys.
 */
export function assertRegistryInvariants(
  operations: readonly OperationDescriptor[],
): void {
  const seenIds = new Set<string>();
  const seenRoutes = new Set<string>();
  operations.forEach((op, index) => {
    const context = `${op.method.toUpperCase()} ${op.path}`;
    if (!OPERATION_ID_PATTERN.test(op.operationId)) {
      fail(context, `operationId "${op.operationId}" is not camelCase`);
    }
    if (seenIds.has(op.operationId)) {
      fail(context, `duplicate operationId "${op.operationId}"`);
    }
    seenIds.add(op.operationId);
    const routeKey = `${op.method} ${op.path}`;
    if (seenRoutes.has(routeKey)) fail(context, "duplicate method+path");
    seenRoutes.add(routeKey);
    if (!op.path.startsWith("/")) fail(context, "path must start with /");
    if (index > 0) {
      const previous = operations[index - 1] as OperationDescriptor;
      if (compareOperations(previous, op) >= 0) {
        fail(
          context,
          `registry is not sorted by (path, method); "${previous.path}" must come after "${op.path}"`,
        );
      }
    }
    const templateParams = pathTemplateParams(op.path);
    const declaredPathParams = (op.parameters ?? [])
      .filter((p) => p.in === "path")
      .map((p) => p.name);
    if (
      templateParams.length !== declaredPathParams.length ||
      templateParams.some((name, i) => declaredPathParams[i] !== name)
    ) {
      fail(
        context,
        `path template params [${templateParams.join(", ")}] do not match declared path parameters [${declaredPathParams.join(", ")}]`,
      );
    }
    for (const parameter of op.parameters ?? []) {
      if (parameter.in === "path" && !parameter.required) {
        fail(context, `path parameter "${parameter.name}" must be required`);
      }
    }
    const statuses = Object.keys(op.responses);
    if (statuses.length === 0) fail(context, "at least one response required");
    for (const status of statuses) {
      if (!STATUS_CODE_PATTERN.test(status)) {
        fail(context, `invalid response status code key "${status}"`);
      }
    }
  });
}

function buildOperationObject(op: OperationDescriptor): JsonObject {
  const context = `${op.method.toUpperCase()} ${op.path}`;
  const operation: JsonObject = {
    operationId: op.operationId,
    summary: op.summary,
  };
  if (op.description) operation.description = op.description;
  operation.tags = [...op.tags];
  // Publish the maturity in the artifact itself: a reader of the generated
  // document should not have to guess whether an operation is merely described
  // or actually verified end to end.
  operation["x-dreamwork-contract-maturity"] = op.contractMaturity;
  if (op.auth === "user-session") {
    // Alternatives: either scheme satisfies the requirement.
    operation.security = [{ bearerSession: [] }, { cookieSession: [] }];
  } else {
    operation.security = [];
  }
  if (op.parameters && op.parameters.length > 0) {
    operation.parameters = op.parameters.map((parameter) => ({
      name: parameter.name,
      in: parameter.in,
      description: parameter.description,
      required: parameter.required,
      schema: convertStandalone(
        parameter.schema,
        "input",
        `${context} parameter "${parameter.name}"`,
      ),
    }));
  }
  if (op.requestBody) {
    operation.requestBody = {
      description: op.requestBody.description,
      required: op.requestBody.required,
      content: {
        [op.requestBody.contentType]: {
          schema: componentRef(op.requestBody.schema, `${context} requestBody`),
        },
      },
    };
  }
  const responses: JsonObject = {};
  for (const status of Object.keys(op.responses).sort()) {
    const response = op.responses[status];
    if (!response) continue;
    const responseObject: JsonObject = { description: response.description };
    if (response.schema) {
      responseObject.content = {
        "application/json": {
          schema: componentRef(response.schema, `${context} ${status}`),
        },
      };
    }
    responses[status] = responseObject;
  }
  operation.responses = responses;
  return operation;
}

/**
 * Build the complete OpenAPI 3.1 document. Component schemas come from the
 * response registry (`io: "output"` — the serialized wire truth, exact field
 * allowlists) merged with the request registry (`io: "input"` — what callers
 * may send; unknown body keys are accepted and ignored by the server).
 * Shared vocabulary registered on both must convert identically.
 */
export function buildOpenApiDocument(
  operations: readonly OperationDescriptor[],
): JsonObject {
  assertRegistryInvariants(operations);

  const responseComponents = convertRegistry(
    responseSchemaRegistry,
    "output",
    "response components",
  );
  const requestComponents = convertRegistry(
    requestSchemaRegistry,
    "input",
    "request components",
  );
  const merged: Record<string, JsonObject> = { ...responseComponents };
  for (const [id, schema] of Object.entries(requestComponents)) {
    const existing = merged[id];
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(schema)) {
        fail(
          "components",
          `shared component "${id}" converts differently for input and output; split it into distinct request/response components`,
        );
      }
      continue;
    }
    merged[id] = schema;
  }

  const paths: JsonObject = {};
  const sorted = [...operations].sort(compareOperations);
  for (const op of sorted) {
    const pathItem = (paths[op.path] ?? {}) as JsonObject;
    pathItem[op.method] = buildOperationObject(op);
    paths[op.path] = pathItem;
  }
  // Method key order within a path item is canonical (get, post, put, ...).
  for (const path of Object.keys(paths)) {
    const pathItem = paths[path] as JsonObject;
    const orderedItem: JsonObject = {};
    for (const method of METHOD_ORDER) {
      if (pathItem[method]) orderedItem[method] = pathItem[method];
    }
    paths[path] = orderedItem;
  }

  return {
    openapi: OPENAPI_VERSION,
    info: DOCUMENT_INFO,
    paths,
    components: {
      schemas: sortKeys(merged),
      securitySchemes: SECURITY_SCHEMES,
    },
  };
}

/** Canonical serialization of the document: 2-space JSON + trailing newline. */
export function serializeDocument(document: JsonObject): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
