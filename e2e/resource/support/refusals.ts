/**
 * The refusals the OpenAPI tests send to the contacts application's API
 * (resource SPEC 13.1): what each sends, the status and code it must
 * answer with, and the check that the answer is one the document lists.
 * A request document the server refuses as such fails the documented
 * request schema, and one refused for anything else passes it.
 */
import type { ApiSession } from './api-session.ts';
import type { Request, Sent } from './http.ts';
import type { Method } from './openapi-contract.ts';

import { expect } from 'vitest';
import { z } from 'zod';

import { APP_CONTRACT } from './api-session.ts';

export interface Refusal {
  readonly name: string;
  readonly method: Method;
  /** The document's path; `url` is an instance of it. */
  readonly path: string;
  readonly url: string;
  readonly request: Request;
  readonly status: number;
  readonly code: string;
}

export const MISSING = '00000000-0000-4000-8000-0000000000ff';
export const CONTACTS = '/api/contacts';
export const CONTACT = '/api/contacts/{id}';
export const CALLS = '/api/calls';

/** The codes of a request document's own refusals, before any rule or row. */
const DOCUMENT_REFUSALS: ReadonlySet<string> = new Set([
  'MALFORMED_JSON',
  'INVALID_DOCUMENT',
  'CLIENT_GENERATED_ID_NOT_SUPPORTED',
  'VALIDATION_FAILED',
]);

/**
 * Whether the server refused a request document as such: with one of the
 * document's own codes, a create's `CONFLICT`, a type that differs, or a
 * `FORBIDDEN` at a member the operation does not write, where a policy's
 * points nowhere. An update's `CONFLICT` is an id that differs from the
 * URL, which no schema can see: the document's one looseness.
 */
function refusedAsSuch(
  method: Method,
  code: string,
  pointer: string | undefined,
): boolean {
  return (
    DOCUMENT_REFUSALS.has(code) ||
    (code === 'CONFLICT' && method === 'post') ||
    (code === 'FORBIDDEN' && pointer?.startsWith('/data/') === true)
  );
}

/** The part of an error document that says where its first object points. */
const POINTED = z.object({
  errors: z.array(
    z.object({ source: z.object({ pointer: z.string() }).optional() }),
  ),
});

/** The pointer of an error document's first object, when it has one. */
function firstPointer(body: unknown): string | undefined {
  return POINTED.safeParse(body).data?.errors[0]?.source?.pointer;
}

/** A contact's create document. */
export function contact(attributes: object, rest: object = {}): object {
  return { data: { type: 'contacts', attributes, ...rest } };
}

/** A contact's update document. */
export function update(id: string, attributes: object): object {
  return { data: { type: 'contacts', id, attributes } };
}

/** A call's create document, under the client's id. */
export function call(
  id: string,
  attributes: object,
  contactId?: string,
): object {
  const relationships =
    contactId === undefined
      ? {}
      : {
          relationships: {
            contact: { data: { type: 'contacts', id: contactId } },
          },
        };
  return { data: { type: 'calls', id, attributes, ...relationships } };
}

/** Sends `refusal`, checks its answer against itself and the document, and returns the answer. */
export async function expectRefusal(
  session: ApiSession,
  refusal: Refusal,
): Promise<Sent> {
  const { method, path, url, request, status, code } = refusal;
  const sent = await session.exchange(method, path, url, request);
  expect(sent.status).toBe(status);
  expect(sent.body).toMatchObject({ errors: [{ code }] });
  if (request.body !== undefined) {
    expect(APP_CONTRACT.request(method, path, request.body).length > 0).toBe(
      refusedAsSuch(method, code, firstPointer(sent.body)),
    );
  }
  return sent;
}
