/**
 * A catalog whose entries span client and server statuses, under a format
 * that combines entries in one body (SPEC 7.2.4), and the bodies a library
 * reporting several problems sends for each combination of them. Shared by
 * the `errorResponses` tests. Not published.
 * @packageDocumentation
 */
import type { ErrorItem } from '../core/error-item';
import type { ErrorStatusCode } from '../core/status';
import type { Ban } from '../core/types';
import type { JsonSchema } from '../formats/context';
import type { ResponseObject } from '../openapi/index';

import { createBan } from '../core/create-ban';
import { jsonApi, responseStatus } from '../formats/json-api';

export const ERRORS = {
  QUERY_INVALID: { status: 400, title: 'Query Invalid' },
  QUERY_UNKNOWN: { status: 400, title: 'Query Unknown' },
  ID_REFUSED: { status: 403, title: 'Id Refused' },
  TYPE_CONFLICT: { status: 409, title: 'Type Conflict' },
  ATTRIBUTE_INVALID: { status: 422, title: 'Attribute Invalid' },
  STORE_DOWN: { status: 503, title: 'Store Down' },
} as const;
export type Code = keyof typeof ERRORS;
export const CODES = Object.keys(ERRORS) as ReadonlyArray<Code>;
export const CT = 'application/vnd.api+json';

export const mixing: Ban<typeof ERRORS> = createBan({
  errors: ERRORS,
  format: jsonApi({ mixedEntries: true }),
  docsBaseUrl: 'https://errors.example.com',
});

function item(code: Code): ErrorItem {
  const { status, title } = ERRORS[code];
  return { status, code, title, detail: `${code} happened`, path: ['data'] };
}

/** Every non-empty subset, each in catalog order. */
export function subsets<T>(values: ReadonlyArray<T>): Array<Array<T>> {
  const all: Array<Array<T>> = [[]];
  for (const value of values) {
    for (const subset of all.slice()) {
      all.push([...subset, value]);
    }
  }
  return all.filter((subset) => subset.length > 0);
}

/** The body and status of an error carrying one item per code, thrown as a library reporting several problems throws it. */
export function sent(codes: ReadonlyArray<Code>): {
  status: number;
  body: unknown;
} {
  const errors = codes.map((code) => item(code));
  const [only] = codes;
  const error =
    codes.length === 1 && only !== undefined
      ? mixing.error(only, { errors })
      : mixing.fromStatus(responseStatus(errors) as ErrorStatusCode, {
          errors,
        });
  return { status: error.status, body: mixing.render(error).body };
}

export function schemaOf(
  responses: Readonly<Record<string, ResponseObject>>,
  status: string,
): JsonSchema {
  const schema = responses[status]?.content[CT]?.schema;
  if (schema === undefined) {
    throw new Error(`no ${status} response`);
  }
  return schema;
}
