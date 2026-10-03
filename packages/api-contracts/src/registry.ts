import { z } from "zod";

/**
 * Component metadata attached to every reusable wire schema. `id` becomes the
 * stable `#/components/schemas/<id>` identifier; `description` is surfaced in
 * the generated document for agents and generated docs.
 */
export interface ContractSchemaMeta {
  id: string;
  description: string;
  [k: string]: unknown;
}

/**
 * Named RESPONSE-side wire schemas. Converted to JSON Schema with
 * `io: "output"` (serialized wire representation after defaults are applied).
 */
export const responseSchemaRegistry = z.registry<ContractSchemaMeta>();

/**
 * Named REQUEST-side wire schemas (bodies). Converted with `io: "input"`
 * (what a caller may send: optional defaulted fields stay optional).
 */
export const requestSchemaRegistry = z.registry<ContractSchemaMeta>();

/**
 * Register a response-side component. Shared vocabulary (enums reused by
 * request schemas) may additionally be registered on the request registry via
 * {@link sharedComponent}; the generator asserts both emissions are identical
 * before merging.
 */
export function responseComponent<T extends z.ZodType>(
  schema: T,
  meta: ContractSchemaMeta,
): T {
  // .meta() returns a new instance and writes the description to the global
  // metadata registry (which toJSONSchema consults for annotations). The `id`
  // lives only in our component registry so def extraction stays under the
  // generator's control.
  const annotated = schema.meta({ description: meta.description }) as T;
  responseSchemaRegistry.add(annotated, meta);
  return annotated;
}

/** Register a request-side component. */
export function requestComponent<T extends z.ZodType>(
  schema: T,
  meta: ContractSchemaMeta,
): T {
  const annotated = schema.meta({ description: meta.description }) as T;
  requestSchemaRegistry.add(annotated, meta);
  return annotated;
}

/**
 * Register an io-independent vocabulary schema (enums, plain unions) on both
 * registries so request and response components can `$ref` it by one stable
 * name. The generator verifies the two emissions are identical before merging.
 */
export function sharedComponent<T extends z.ZodType>(
  schema: T,
  meta: ContractSchemaMeta,
): T {
  const annotated = schema.meta({ description: meta.description }) as T;
  responseSchemaRegistry.add(annotated, meta);
  requestSchemaRegistry.add(annotated, meta);
  return annotated;
}
