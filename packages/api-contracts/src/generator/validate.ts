/**
 * Offline OpenAPI 3.1 structural validation.
 *
 * Dependency-free by design: it enforces the structural subset this generator
 * can produce (document skeleton, path items, operations, parameters,
 * responses, resolvable local $refs, component reachability, and a ban on
 * OpenAPI 3.0-only keywords) so that a passing `openapi-typescript` run is
 * never the only proof the document is well-formed.
 */

type JsonObject = Record<string, unknown>;

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
const STATUS_CODE_PATTERN = /^[1-5][0-9][0-9]$/;
const COMPONENT_KEY_PATTERN = /^[a-zA-Z0-9.\-_]+$/;
/** OpenAPI 3.0-only keywords that must not appear in 3.1 schemas. */
const FORBIDDEN_LEGACY_SCHEMA_KEYWORDS = ["nullable", "example"] as const;

const LOCAL_SCHEMA_REF_PREFIX = "#/components/schemas/";

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every local component name referenced anywhere inside `node`. */
function localSchemaRefs(node: unknown, into: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) localSchemaRefs(item, into);
    return into;
  }
  if (!isObject(node)) return into;
  const ref = node.$ref;
  if (typeof ref === "string" && ref.startsWith(LOCAL_SCHEMA_REF_PREFIX)) {
    into.push(ref.slice(LOCAL_SCHEMA_REF_PREFIX.length));
  }
  for (const value of Object.values(node)) localSchemaRefs(value, into);
  return into;
}

export function validateOpenApiDocument(document: unknown): string[] {
  const errors: string[] = [];
  const push = (message: string) => {
    errors.push(message);
  };

  if (!isObject(document)) return ["document: not an object"];

  if (document.openapi !== "3.1.0") {
    push(`openapi: expected "3.1.0", got ${JSON.stringify(document.openapi)}`);
  }
  const info = document.info;
  if (!isObject(info)) {
    push("info: missing");
  } else {
    if (typeof info.title !== "string" || info.title.length === 0) {
      push("info.title: required non-empty string");
    }
    if (typeof info.version !== "string" || info.version.length === 0) {
      push("info.version: required non-empty string");
    }
  }

  const components = document.components;
  const schemas =
    isObject(components) && isObject(components.schemas)
      ? components.schemas
      : {};
  if (!isObject(components) || !isObject(components.schemas)) {
    push("components.schemas: missing");
  }
  const securitySchemes =
    isObject(components) && isObject(components.securitySchemes)
      ? components.securitySchemes
      : {};

  for (const name of Object.keys(schemas)) {
    if (!COMPONENT_KEY_PATTERN.test(name)) {
      push(`components.schemas.${name}: invalid component key`);
    }
  }

  // Every local $ref must resolve to a declared component schema, and JSON
  // Schema objects must not use OpenAPI 3.0-only keywords.
  const walkSchemaish = (node: unknown, location: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walkSchemaish(item, `${location}[${index}]`));
      return;
    }
    if (!isObject(node)) return;
    const ref = node.$ref;
    if (typeof ref === "string") {
      if (!ref.startsWith(LOCAL_SCHEMA_REF_PREFIX)) {
        push(`${location}.$ref: non-local ref "${ref}"`);
      } else {
        const target = ref.slice(LOCAL_SCHEMA_REF_PREFIX.length);
        if (!(target in schemas)) {
          push(`${location}.$ref: unresolved component "${target}"`);
        }
      }
    }
    for (const keyword of FORBIDDEN_LEGACY_SCHEMA_KEYWORDS) {
      if (keyword in node) {
        push(`${location}.${keyword}: OpenAPI 3.0-only keyword in a 3.1 document`);
      }
    }
    for (const [key, value] of Object.entries(node)) {
      walkSchemaish(value, `${location}.${key}`);
    }
  };

  for (const [name, schema] of Object.entries(schemas)) {
    walkSchemaish(schema, `components.schemas.${name}`);
  }

  const paths = document.paths;
  if (!isObject(paths)) {
    push("paths: missing");
    return errors;
  }

  const operationIds = new Set<string>();
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!path.startsWith("/")) push(`paths: key "${path}" must start with /`);
    if (!isObject(pathItem)) {
      push(`paths.${path}: not an object`);
      continue;
    }
    const templateParams = [...path.matchAll(/\{([^}]+)\}/g)].map(
      (match) => match[1],
    );
    const methods = Object.keys(pathItem);
    if (methods.length === 0) push(`paths.${path}: no operations`);
    for (const method of methods) {
      const location = `paths.${path}.${method}`;
      if (!(HTTP_METHODS as readonly string[]).includes(method)) {
        push(`${location}: unsupported method key`);
        continue;
      }
      const operation = pathItem[method];
      if (!isObject(operation)) {
        push(`${location}: not an object`);
        continue;
      }
      const operationId = operation.operationId;
      if (typeof operationId !== "string" || operationId.length === 0) {
        push(`${location}.operationId: required`);
      } else if (operationIds.has(operationId)) {
        push(`${location}.operationId: duplicate "${operationId}"`);
      } else {
        operationIds.add(operationId);
      }

      const security = operation.security;
      if (security !== undefined) {
        if (!Array.isArray(security)) {
          push(`${location}.security: must be an array`);
        } else {
          for (const requirement of security) {
            if (!isObject(requirement)) continue;
            for (const scheme of Object.keys(requirement)) {
              if (!(scheme in securitySchemes)) {
                push(`${location}.security: unknown scheme "${scheme}"`);
              }
            }
          }
        }
      }

      const parameters = operation.parameters;
      const declaredPathParams: string[] = [];
      if (parameters !== undefined) {
        if (!Array.isArray(parameters)) {
          push(`${location}.parameters: must be an array`);
        } else {
          parameters.forEach((parameter, index) => {
            const paramLocation = `${location}.parameters[${index}]`;
            if (!isObject(parameter)) {
              push(`${paramLocation}: not an object`);
              return;
            }
            if (typeof parameter.name !== "string") {
              push(`${paramLocation}.name: required`);
            }
            if (parameter.in !== "path" && parameter.in !== "query") {
              push(`${paramLocation}.in: expected "path" or "query"`);
            }
            if (!isObject(parameter.schema)) {
              push(`${paramLocation}.schema: required`);
            } else {
              walkSchemaish(parameter.schema, `${paramLocation}.schema`);
            }
            if (parameter.in === "path") {
              if (parameter.required !== true) {
                push(`${paramLocation}.required: path params must be true`);
              }
              if (typeof parameter.name === "string") {
                declaredPathParams.push(parameter.name);
              }
            }
          });
        }
      }
      if (
        templateParams.length !== declaredPathParams.length ||
        templateParams.some((name, i) => declaredPathParams[i] !== name)
      ) {
        push(
          `${location}: path template params [${templateParams.join(", ")}] do not match declared path parameters [${declaredPathParams.join(", ")}]`,
        );
      }

      const requestBody = operation.requestBody;
      if (requestBody !== undefined) {
        if (!isObject(requestBody) || !isObject(requestBody.content)) {
          push(`${location}.requestBody.content: required`);
        } else {
          walkSchemaish(requestBody.content, `${location}.requestBody.content`);
        }
      }

      const responses = operation.responses;
      if (!isObject(responses) || Object.keys(responses).length === 0) {
        push(`${location}.responses: at least one response required`);
        continue;
      }
      for (const [status, response] of Object.entries(responses)) {
        const responseLocation = `${location}.responses.${status}`;
        if (!STATUS_CODE_PATTERN.test(status) && status !== "default") {
          push(`${responseLocation}: invalid status code key`);
        }
        if (!isObject(response)) {
          push(`${responseLocation}: not an object`);
          continue;
        }
        if (typeof response.description !== "string") {
          push(`${responseLocation}.description: required`);
        }
        if (response.content !== undefined) {
          walkSchemaish(response.content, `${responseLocation}.content`);
        }
      }
    }
  }

  // Orphan components: a schema no operation can reach is documentation of
  // something the API does not answer with. It ships in the artifact, in the
  // generated types, and in the barrel, and nothing ever proves it right —
  // exactly the "documented contract nothing verifies" the maturity ladder
  // treats as near-worthless. Fail generation instead of accumulating them.
  const reachable = new Set<string>();
  const pending = localSchemaRefs(paths);
  while (pending.length > 0) {
    const name = pending.pop() as string;
    if (reachable.has(name)) continue;
    reachable.add(name);
    const schema = schemas[name];
    if (schema !== undefined) localSchemaRefs(schema, pending);
  }
  for (const name of Object.keys(schemas)) {
    if (reachable.has(name)) continue;
    push(
      `components.schemas.${name}: unreachable from every operation. Reference it from the operation that emits or accepts it, or delete the schema (packages/api-contracts/src/schemas/) and its src/index.ts export.`,
    );
  }

  return errors;
}
