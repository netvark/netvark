/**
 * Schema conformance for the repository's own tests: compiles the vendored
 * JSON:API schema with the 1.1 members this package emits added, and
 * validates documents against it. Not published.
 * @ref https://jsonapi.org/format/1.1/#document-jsonapi-object
 * @ref https://jsonapi.org/format/1.1/#document-links-link-object
 * @ref https://jsonapi.org/format/1.1/#error-objects
 * @ref https://ajv.js.org/json-schema.html#draft-2020-12
 * @packageDocumentation
 */
import addFormats from 'ajv-formats';
import Ajv2020 from 'ajv/dist/2020.js';

import { JSON_API_SCHEMA_1_0 } from './jsonapi-schema-1-0';

type Schema = Record<string, unknown>;

const URI_LIST: Schema = { type: 'array', items: { type: 'string' } };
const LINK_OBJECT_1_1: Schema = {
  rel: { type: 'string' },
  describedby: { $ref: '#/definitions/link' },
  title: { type: 'string' },
  type: { type: 'string' },
  hreflang: {
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  },
};

function isRecord(value: unknown): value is Schema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Adds `additions` to the `properties` of the named definition. */
function extendDefinition(
  schema: Schema,
  name: string,
  additions: Schema,
): void {
  const definitions = schema['definitions'];
  const found = isRecord(definitions) ? definitions[name] : undefined;
  if (!isRecord(definitions) || !isRecord(found)) {
    throw new Error(`schema has no definition "${name}"`);
  }
  const existing = found['properties'];
  definitions[name] = {
    ...found,
    properties: { ...(isRecord(existing) ? existing : {}), ...additions },
  };
}

/**
 * The 1.0 schema plus the 1.1 members: `jsonapi.ext` and `jsonapi.profile`,
 * the link object's `rel`, `describedby`, `title`, `type`, and `hreflang`,
 * the top-level `describedby` link, and the error `links.type`.
 */
function jsonApi11Schema(): Schema {
  const schema = structuredClone(JSON_API_SCHEMA_1_0);
  extendDefinition(schema, 'jsonapi', { ext: URI_LIST, profile: URI_LIST });
  extendDefinition(schema, 'linkObject', LINK_OBJECT_1_1);
  extendDefinition(schema, 'topLevelLinks', {
    describedby: { $ref: '#/definitions/link' },
  });
  extendDefinition(schema, 'errorLinks', {
    type: { $ref: '#/definitions/link' },
  });
  return schema;
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(jsonApi11Schema());

/** Schema violations of `document`; empty when it conforms. */
export function schemaErrors(document: unknown): ReadonlyArray<string> {
  return validate(document)
    ? []
    : (validate.errors ?? []).map(
        (error) =>
          `${error.instancePath === '' ? '/' : error.instancePath} ${error.message ?? ''}`,
      );
}
