/**
 * `@netvark/resource-core/openapi` (SPEC 13): the OpenAPI document of a
 * registry of declared resources, and the surface clients depend on with
 * the diff that tells a breaking change from a safe one and the parse
 * that reads a committed surface back, and the paths a resource's links
 * name, where a host mounts its routes.
 * @packageDocumentation
 */
export type { SurfaceChange } from './diff';
export type { InfoObject, OpenApiDocument, OpenApiOptions } from './document';
export type {
  ExampleObject,
  ResourceExample,
  ResourceExamples,
} from './examples';
export type { OperationCodes } from './operation-codes';
export type { ResourcePaths } from './paths';
export type {
  FieldSurface,
  PageSurface,
  RelationshipSurface,
  ResourceSurface,
  Surface,
  ValueSurface,
} from './surface';

export { diffSurfaces } from './diff';
export { openapi } from './document';
export { parseSurface } from './parse-surface';
export { resourcePaths } from './paths';
export { SURFACE_FORMAT, surfaceOf } from './surface';
