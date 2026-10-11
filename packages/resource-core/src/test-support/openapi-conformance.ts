/**
 * Validation against the official OpenAPI 3.1 schemas (SPEC 13.1):
 * `schema-base`, which validates the document's objects and every Schema
 * Object against the OpenAPI dialect, with formats asserted. Not
 * published with the package.
 * @ref https://spec.openapis.org/oas/v3.1.2.html#openapi-document
 * @ref https://ajv.js.org/json-schema.html#draft-2020-12
 * @packageDocumentation
 */
import type { ValidateFunction } from 'ajv/dist/2020.js';

import addFormats from 'ajv-formats';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  OAS_3_1_DIALECT,
  OAS_3_1_META,
  OAS_3_1_SCHEMA,
  OAS_3_1_SCHEMA_BASE,
} from './oas-3-1-schemas';

const TOKEN = "[!#$%&'*+.^_`|~0-9A-Za-z-]+";
const QUOTED_STRING =
  '"(?:[\\t \\x21\\x23-\\x5B\\x5D-\\x7E\\x80-\\xFF]|\\\\[\\t \\x21-\\x7E\\x80-\\xFF])*"';
/**
 * RFC 9110's `media-range`, the format of a Content map's keys: a media
 * type whose type or subtype may be `*`, with parameters.
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-12.5.1
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-5.6.6
 * @ref https://spec.openapis.org/registry/format/media-range.html
 */
const MEDIA_RANGE = new RegExp(
  `^(?:\\*/\\*|${TOKEN}/\\*|${TOKEN}/${TOKEN})(?:[ \\t]*;[ \\t]*(?:${TOKEN}=(?:${TOKEN}|${QUOTED_STRING}))?)*$`,
  'u',
);

const SCHEMA_OBJECT = `${String(OAS_3_1_SCHEMA_BASE['$id'])}#/$defs/schema`;

/**
 * `schema` with each `$dynamicRef: #meta` made a `$ref` to schema-base's
 * Schema Object, and the `$dynamicAnchor` it targets dropped: the schema
 * that reference resolves to when validation starts at schema-base, the
 * outermost resource in the dynamic scope with that anchor. Ajv resolves
 * a dynamic anchor only at a resource's root, which the dialect's is.
 * @ref https://json-schema.org/draft/2020-12/json-schema-core#section-8.2.3.2
 * @ref https://ajv.js.org/guide/combining-schemas.html#extending-recursive-schemas
 */
function resolveDynamicRefs(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((member: unknown) => resolveDynamicRefs(member));
  }
  if (typeof schema !== 'object' || schema === null) {
    return schema;
  }
  return Object.fromEntries(
    Object.entries(schema).flatMap(([key, member]: [string, unknown]) => {
      if (key === '$dynamicRef' && member === '#meta') {
        return [['$ref', SCHEMA_OBJECT]];
      }
      return key === '$dynamicAnchor'
        ? []
        : [[key, resolveDynamicRefs(member)]];
    }),
  );
}

function compileDocumentSchema(): ValidateFunction {
  // The published schemas leave `type` implicit beside `properties`, list `required` members across subschemas, and let
  // `patternProperties` match named properties, which Ajv's strict checks refuse; its `strictSchema` still refuses an
  // unknown keyword.
  const ajv = new Ajv2020({
    allErrors: true,
    strictTypes: false,
    strictTuples: false,
    allowMatchingProperties: true,
  });
  addFormats(ajv);
  ajv.addFormat('media-range', MEDIA_RANGE);
  ajv.addMetaSchema(OAS_3_1_META);
  ajv.addMetaSchema(OAS_3_1_DIALECT);
  ajv.addSchema(resolveDynamicRefs(OAS_3_1_SCHEMA) as Record<string, unknown>);
  return ajv.compile(
    resolveDynamicRefs(OAS_3_1_SCHEMA_BASE) as Record<string, unknown>,
  );
}

const validateDocument = compileDocumentSchema();

/** Where and why `document` breaks the OpenAPI 3.1 schemas; empty when it conforms. */
export function openApiErrors(document: unknown): ReadonlyArray<string> {
  if (validateDocument(document)) {
    return [];
  }
  return (validateDocument.errors ?? []).map(
    (error) =>
      `${error.instancePath === '' ? '/' : error.instancePath} ${error.message ?? error.keyword}`,
  );
}
