/**
 * What `openapi` refuses and what it leaves out (SPEC 13.1): links on two
 * origins, which one document cannot describe as its server; two resources
 * at one path; a code in `codes` the catalog lacks; and the endpoints a
 * resource does not serve: no relationship endpoint without a get, no
 * related endpoint when the target has no get. A remove answers 204 with
 * its codes, each status of one code a reference to that code's response.
 */
import { describe, expect, it } from 'vitest';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { errorKey, errorRef, errorResponseRef } from './component-names';
import { openapi } from './document';

const INFO = { title: 'Contacts', version: '1' };

function definer(links: { readonly base: string }) {
  return createDeclareResource({
    catalog: contactsCatalog,
    ...TEST_REGISTRIES,
    links,
  });
}

const declareResource = definer({ base: 'https://a.example/api' });
const Organizations = declareResource('organizations', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});
const Contacts = declareResource('contacts', {
  operations: ['get', 'remove'],
  fields: { name: { access: 'read' } },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
  },
});

function codesOf(response: unknown): ReadonlyArray<string> {
  return [...JSON.stringify(response).matchAll(/"\$ref":"([^"]+)"/gu)].map(
    ([, ref]) => ref ?? '',
  );
}

describe('openapi refuses', () => {
  it('resources whose links have different origins', () => {
    const elsewhere = definer({ base: 'https://b.example/api' });
    const Remote = elsewhere('contacts', {
      operations: ['get'],
      fields: { name: { access: 'read' } },
      relationships: {
        organization_id: { target: () => Organizations, access: 'read' },
      },
    });
    expect(() => openapi([Organizations, Remote], { info: INFO })).toThrow(
      new TypeError(
        "openapi: the resources' links have different origins (https://a.example, https://b.example); one document describes one server",
      ),
    );
  });

  it('two resources at one path', () => {
    const things = createDeclareResource({
      catalog: contactsCatalog,
      ...TEST_REGISTRIES,
      links: { self: (id) => `/things/${encodeURIComponent(id)}` },
    });
    const Named = things('organizations', {
      operations: ['get'],
      fields: { name: { access: 'read' } },
    });
    const Others = things('contacts', {
      operations: ['get'],
      fields: { name: { access: 'read' } },
      relationships: {
        organization_id: { target: () => Named, access: 'read' },
      },
    });
    expect(() => openapi([Named, Others], { info: INFO })).toThrow(
      new TypeError('openapi: two resources have the path /things/{id}'),
    );
  });

  it('a code the catalog lacks', () => {
    expect(() =>
      openapi([Organizations, Contacts], {
        info: INFO,
        codes: { resources: { contacts: { remove: ['CONTACT_LOCKED'] } } },
      }),
    ).toThrow(
      new TypeError(
        'openapi: codes: CONTACT_LOCKED is not a code of the catalog; give it in appErrors',
      ),
    );
  });
});

describe('openapi describes what each resource serves', () => {
  it('the shared origin as the server, and a remove as a 204 with its codes', () => {
    const document = openapi([Organizations, Contacts], { info: INFO });
    expect(document.servers).toEqual([{ url: 'https://a.example' }]);
    const remove = document.paths['/api/contacts/{id}']?.delete;
    expect(remove?.responses['204']).toEqual({
      description: 'The resource was removed.',
    });
    for (const [status, code] of [
      ['404', 'NOT_FOUND'],
      ['409', 'CONFLICT'],
    ] as const) {
      expect(remove?.responses[status]).toEqual({
        $ref: errorResponseRef(code),
      });
      expect(codesOf(document.components.responses[errorKey(code)])).toEqual([
        errorRef(code),
      ]);
    }
  });

  it('no related endpoint when the target has no get', () => {
    const Listed = declareResource('organizations', {
      operations: ['list'],
      fields: { name: { access: 'read' } },
    });
    const Linked = declareResource('contacts', {
      operations: ['get'],
      fields: { name: { access: 'read' } },
      relationships: {
        organization_id: { target: () => Listed, access: 'read' },
      },
    });
    expect(
      Object.keys(openapi([Listed, Linked], { info: INFO }).paths),
    ).toEqual([
      '/api/organizations',
      '/api/contacts/{id}',
      '/api/contacts/{id}/relationships/organization',
    ]);
  });

  it('no endpoint of a relationship when the resource has no get', () => {
    const Removable = declareResource('contacts', {
      operations: ['remove'],
      fields: { name: { access: 'read' } },
      relationships: {
        organization_id: { target: () => Organizations, access: 'read' },
      },
    });
    expect(
      Object.keys(openapi([Organizations, Removable], { info: INFO }).paths),
    ).toEqual([
      '/api/organizations/{id}',
      '/api/contacts/{id}',
      '/api/operations',
    ]);
  });
});
