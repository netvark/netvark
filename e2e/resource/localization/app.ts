/**
 * A Hono application localized end to end with Paraglide (resource SPEC
 * 10.4): `paraglideMiddleware` resolves each request's locale from
 * `Accept-Language`, `localizeErrors` rewrites the JSON:API error document
 * with the Paraglide messages, which read that locale, and the error
 * handler names it in `Content-Language` and varies on `Accept-Language`.
 * The 422 carries resource issues as `@netvark/jsonapi-core` items do
 * (SPEC 9.3); the 409 is built as `constraintError` builds it (SPEC 9.5).
 * @ref https://paraglidejs.com/getting-started/standalone-servers
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-8.5
 * @packageDocumentation
 */

import type { Context } from 'hono';

import type { ErrorItem } from '@netvark/hono-ban';
import type { ResourceIssue } from '@netvark/resource-core';

import { Hono } from 'hono';

import { createBan } from '@netvark/hono-ban';
import { jsonApi } from '@netvark/hono-ban/formats/json-api';
import { ERROR_CATALOG } from '@netvark/jsonapi-core';
import { errorCatalog, localizeErrors } from '@netvark/resource-core';

import { Contacts } from '../resources/contacts.ts';
import { contactMessages, RESOURCES } from './contact-messages.ts';
import { getLocale } from './paraglide/runtime.js';
import { paraglideMiddleware } from './paraglide/server.js';

const ban = createBan({
  errors: { ...ERROR_CATALOG, ...errorCatalog(RESOURCES) },
  format: jsonApi({ mixedEntries: true, includeId: false }),
});

const handle = ban.onError({
  // The resource type is the first path segment, as in a JSON:API URL design.
  transform: localizeErrors(contactMessages, {
    resource: (c: Context) => c.req.path.split('/')[1],
  }),
});

function itemOf(issue: ResourceIssue): ErrorItem {
  return {
    detail: issue.message,
    path: ['data', 'attributes', ...issue.path],
    reason: issue.code,
    ...(issue.expected === undefined ? {} : { expected: issue.expected }),
  };
}

function attributesOf(document: unknown): unknown {
  const data: unknown =
    typeof document === 'object' && document !== null
      ? Reflect.get(document, 'data')
      : undefined;
  return typeof data === 'object' && data !== null
    ? Reflect.get(data, 'attributes')
    : undefined;
}

export const app = new Hono();

app.use('*', async (c, next) =>
  paraglideMiddleware(c.req.raw, async () => {
    await next();
    return c.res;
  }),
);

app.post('/contacts', async (c) => {
  const attributes = attributesOf(await c.req.json());
  const result = Contacts.validate.create['~standard'].validate(attributes);
  if (result.issues !== undefined) {
    throw ban.error('VALIDATION_FAILED', {
      errors: result.issues.map((issue) => itemOf(issue)),
    });
  }
  return c.body(null, 204);
});

app.post('/contacts/taken', () => {
  throw ban.error('CONTACT_EMAIL_TAKEN', {
    errors: [
      {
        detail: 'Another record already has this value.',
        path: ['data', 'attributes', 'email'],
      },
    ],
  });
});

app.get('/contacts/:id', () => {
  throw ban.error('NOT_FOUND');
});

app.onError(async (error, c) => {
  const response = await handle(error, c);
  response.headers.set('Content-Language', getLocale());
  response.headers.append('Vary', 'Accept-Language');
  return response;
});
