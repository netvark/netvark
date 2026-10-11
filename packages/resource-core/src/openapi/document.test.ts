import { describe, expect, it } from 'vitest';

import {
  errorDocument,
  include,
  paginatedDocument,
  parseCreateDocument,
  resourceDocument,
  toOneRelationshipDocument,
} from '@netvark/jsonapi-core';

import { Contacts, Organizations } from '../test-support/definition-resources';
import { openApiErrors } from '../test-support/openapi-conformance';
import { documentValidator } from '../test-support/openapi-document';
import { openapi } from './document';

const DOCUMENT = openapi([Organizations, Contacts], {
  info: { title: 'Contacts', version: '1' },
});
const schemaAt = documentValidator(DOCUMENT);
const MEDIA = 'application/vnd.api+json';

const ADA = {
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'person',
  name: 'Ada',
  alias: null,
  email: 'ada@example.com',
  status: 'active',
  priority: 2,
  tags: ['math'],
  createdAt: '2026-10-10T12:00:00.000Z',
  organization: '7',
};
const ACME = { id: '7', name: 'Acme' };

function responseOf(
  path: string,
  method: string,
  status: string,
): (value: unknown) => boolean {
  return schemaAt([
    'paths',
    path,
    method,
    'responses',
    status,
    'content',
    MEDIA,
    'schema',
  ]);
}

function requestOf(path: string, method: string): (value: unknown) => boolean {
  return schemaAt([
    'paths',
    path,
    method,
    'requestBody',
    'content',
    MEDIA,
    'schema',
  ]);
}

describe('openapi', () => {
  it('conforms to the OpenAPI 3.1 schema, Schema Objects included', () => {
    expect(openApiErrors(DOCUMENT)).toEqual([]);
  });

  it('describes each declared operation and relationship endpoint', () => {
    const operations = Object.entries(DOCUMENT.paths).flatMap(([path, item]) =>
      Object.entries(item).map(
        ([method, operation]) => `${method} ${path} ${operation.operationId}`,
      ),
    );
    expect(operations.toSorted()).toEqual([
      'get /api/contacts contacts.list',
      'get /api/contacts/{id} contacts.get',
      'get /api/contacts/{id}/organization contacts.organization.related.get',
      'get /api/contacts/{id}/relationships/organization contacts.organization.relationship.get',
      'get /api/organizations organizations.list',
      'get /api/organizations/{id} organizations.get',
      'patch /api/contacts/{id} contacts.update',
      'patch /api/contacts/{id}/relationships/organization contacts.organization.relationship.update',
      'post /api/contacts contacts.create',
    ]);
  });

  it('describes the documents jsonapi-core builds', () => {
    const contacts = Contacts.resource;
    const included = include(Organizations.resource, [ACME]);
    expect(
      responseOf(
        '/api/contacts/{id}',
        'get',
        '200',
      )(resourceDocument(contacts, ADA, { included: [included] })),
    ).toBe(true);
    const page = paginatedDocument(
      contacts,
      { rows: [ADA], next: 'n1', prev: null, cursor: () => 'c1' },
      { url: 'https://api.test/api/contacts' },
    );
    expect(page.data[0]?.meta).toEqual({ page: { cursor: 'c1' } });
    expect(responseOf('/api/contacts', 'get', '200')(page)).toBe(true);
    const relationship = toOneRelationshipDocument(
      Organizations.resource,
      ACME,
    );
    expect(
      responseOf(
        '/api/contacts/{id}/relationships/organization',
        'get',
        '200',
      )(relationship),
    ).toBe(true);
    expect(
      responseOf(
        '/api/contacts/{id}/organization',
        'get',
        '200',
      )(resourceDocument(Organizations.resource, ACME)),
    ).toBe(true);
  });

  it('describes the requests the parser accepts and refuses what it refuses', async () => {
    const create = requestOf('/api/contacts', 'post');
    const valid = {
      data: {
        type: 'contacts',
        attributes: {
          kind: 'person',
          name: 'Ada',
          email: 'ada@example.com',
          website: 'https://ada.example',
        },
        relationships: {
          organization: { data: { type: 'organizations', id: '7' } },
        },
      },
    };
    await expect(
      parseCreateDocument(Contacts.resource, valid),
    ).resolves.toBeDefined();
    expect(create(valid)).toBe(true);
    for (const refused of [
      { data: { ...valid.data, id: ADA.id } },
      {
        data: {
          ...valid.data,
          attributes: { ...valid.data.attributes, createdAt: ADA.createdAt },
        },
      },
      {
        data: {
          ...valid.data,
          attributes: { ...valid.data.attributes, fax: '1' },
        },
      },
      { data: { ...valid.data, type: 'organizations' } },
    ]) {
      expect(create(refused)).toBe(false);
      await expect(
        parseCreateDocument(Contacts.resource, refused),
      ).rejects.toBeDefined();
    }
  });

  it('describes the errors the parser renders', async () => {
    const rendered = await parseCreateDocument(Contacts.resource, {
      data: { type: 'contacts', attributes: { name: 7 } },
    }).then(
      () => null,
      (error: unknown) => errorDocument(error as never),
    );
    expect(responseOf('/api/contacts', 'post', '422')(rendered)).toBe(true);
    expect(responseOf('/api/contacts', 'post', '400')(rendered)).toBe(true);
    expect(responseOf('/api/contacts', 'post', '409')(rendered)).toBe(false);
  });
});
