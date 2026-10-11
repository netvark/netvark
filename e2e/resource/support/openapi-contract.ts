import type { ErrorObject } from 'ajv/dist/2020.js';

/**
 * An OpenAPI document as a client holds a server to it (resource SPEC
 * 13.1): a response's status is one the operation documents, its media
 * type one that status's response lists, its body valid against that
 * schema, each error's code among the codes the response lists, and a
 * `201`'s `Location` valid against its header's schema; a request document
 * is checked against the operation's request body. Schemas compile with Ajv
 * 2020-12 in strict mode, every format the document names asserted:
 * ajv-formats' own, and `int16`, `decimal`, and `date-time-local` of the
 * OpenAPI Format Registry. The document is added whole under an `$id`, its
 * OpenAPI members declared as vocabulary, so a schema anywhere in it
 * compiles by its JSON Pointer with its `$ref`s resolved in the document.
 * @ref https://spec.openapis.org/oas/v3.1.2.html#responses-object
 * @ref https://spec.openapis.org/registry/format/
 * @ref https://ajv.js.org/api.html#ajv-addvocabulary-vocabulary-ajv
 * @ref https://www.rfc-editor.org/rfc/rfc6901
 */
import type { OpenApiDocument } from '@netvark/resource-core/openapi';

import type { Sent } from './http.ts';

import addFormats from 'ajv-formats';
import Ajv2020 from 'ajv/dist/2020.js';

import { openApiFormats } from './openapi-formats.ts';

const DOCUMENT_ID = 'https://e2e.netvark.test/openapi.json';
const OPENAPI_MEMBERS = ['openapi', 'info', 'servers', 'paths', 'components'];
/** The prefix of an error object's component; the application's codes are spelled as they are. */
const ERROR_REF = '#/components/schemas/_error.';
const CREATED = '201';

export type Method = 'get' | 'post' | 'patch' | 'delete';

/** What a document holds a server to. */
export interface Contract {
  /** How `sent`, the answer to `method` on `path`, breaks the document; empty when it conforms. */
  readonly response: (
    method: Method,
    path: string,
    sent: Sent,
  ) => ReadonlyArray<string>;
  /** How a request document breaks the operation's request body schema; empty when it passes. */
  readonly request: (
    method: Method,
    path: string,
    body: unknown,
  ) => ReadonlyArray<string>;
  /** The codes the response of `status` lists. */
  readonly codes: (
    method: Method,
    path: string,
    status: number,
  ) => ReadonlyArray<string>;
}

/** An RFC 6901 reference token. */
function token(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The member at `segments`, or `undefined`. */
function at(root: unknown, segments: ReadonlyArray<string>): unknown {
  let node = root;
  for (const segment of segments) {
    node =
      isRecord(node) && Object.hasOwn(node, segment)
        ? node[segment]
        : undefined;
  }
  return node;
}

/** Every `$ref` under `node` that names an error object, as its code. */
function referencedCodes(node: unknown): Array<string> {
  if (Array.isArray(node)) {
    return node.flatMap((item) => referencedCodes(item));
  }
  if (!isRecord(node)) {
    return [];
  }
  const ref = node['$ref'];
  const own =
    typeof ref === 'string' && ref.startsWith(ERROR_REF)
      ? [ref.slice(ERROR_REF.length)]
      : [];
  return [
    ...own,
    ...Object.values(node).flatMap((value) => referencedCodes(value)),
  ];
}

/** The codes of a JSON:API error document's errors. */
function sentCodes(body: unknown): Array<string> {
  const errors = isRecord(body) ? body['errors'] : undefined;
  return Array.isArray(errors)
    ? errors.map((error: unknown) =>
        isRecord(error) ? String(error['code']) : '',
      )
    : [];
}

function described(
  errors: ReadonlyArray<ErrorObject> | null | undefined,
): Array<string> {
  return (errors ?? []).map(
    (error) =>
      `${error.instancePath === '' ? '/' : error.instancePath} ${error.message ?? ''}`,
  );
}

/** The contract of `document`. */
export function contractOf(document: OpenApiDocument): Contract {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  openApiFormats(ajv);
  ajv.addVocabulary(OPENAPI_MEMBERS);
  ajv.addSchema({ ...document, $id: DOCUMENT_ID });
  const validate = (
    segments: ReadonlyArray<string>,
    value: unknown,
  ): Array<string> => {
    const pointer = segments.map((segment) => `/${token(segment)}`).join('');
    const compiled = ajv.getSchema(`${DOCUMENT_ID}#${pointer}`);
    if (compiled === undefined) {
      return [`no schema at ${pointer}`];
    }
    return compiled(value) === true ? [] : described(compiled.errors);
  };
  const responses = (method: Method, path: string): unknown =>
    at(document, ['paths', path, method, 'responses']);
  const codes = (
    method: Method,
    path: string,
    status: number,
  ): Array<string> => [
    ...new Set(referencedCodes(at(responses(method, path), [String(status)]))),
  ];
  return {
    codes,
    request: (method, path, body) => {
      const content = at(document, [
        'paths',
        path,
        method,
        'requestBody',
        'content',
      ]);
      const [media] = isRecord(content) ? Object.keys(content) : [];
      return media === undefined
        ? [`${method} ${path} takes no request document`]
        : validate(
            ['paths', path, method, 'requestBody', 'content', media, 'schema'],
            body,
          );
    },
    response: (method, path, sent) => {
      const status = String(sent.status);
      const response = at(responses(method, path), [status]);
      if (!isRecord(response)) {
        return [`${method} ${path} documents no ${status}`];
      }
      const content = isRecord(response['content']) ? response['content'] : {};
      const media = sent.mediaType;
      if (media === undefined) {
        return Object.keys(content).length === 0
          ? []
          : [`${status} has no body`];
      }
      if (!Object.hasOwn(content, media)) {
        return [`${status} documents no ${media}`];
      }
      const listed = new Set(codes(method, path, sent.status));
      return [
        ...validate(
          [
            'paths',
            path,
            method,
            'responses',
            status,
            'content',
            media,
            'schema',
          ],
          sent.body,
        ),
        ...sentCodes(sent.body)
          .filter((code) => !listed.has(code))
          .map((code) => `${status} does not list ${code}`),
        ...(status === CREATED
          ? validate(
              [
                'paths',
                path,
                method,
                'responses',
                status,
                'headers',
                'Location',
                'schema',
              ],
              sent.headers.get('Location'),
            )
          : []),
      ];
    },
  };
}
