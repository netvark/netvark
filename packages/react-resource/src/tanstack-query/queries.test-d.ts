import type { InfiniteData } from '@tanstack/react-query';

import type {
  CreateInput,
  UpdateInput,
  WriteResult,
} from '@netvark/jsonapi-client';

import {
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import { describe, expectTypeOf, it } from 'vitest';

import { createClients, createTransport } from '@netvark/jsonapi-client';
import { createDefineResource } from '@netvark/jsonapi-core';
import { createDeclareResource } from '@netvark/resource-core';

import { publicCatalog } from '../test-support/public-catalog';
import { FIXTURE_REGISTRIES } from '../test-support/registries';
import { resourceQueries } from './queries';

const declareResource = createDeclareResource({
  catalog: publicCatalog,
  ...FIXTURE_REGISTRIES,
  links: { base: '/api' },
});

const Organizations = declareResource('organizations', {
  operations: ['list', 'get'],
  fields: { name: { access: 'read', sort: true } },
});

const Contacts = declareResource('contacts', {
  operations: ['list', 'get', 'create', 'update', 'remove'],
  fields: {
    name: { access: 'readWrite', filter: ['eq'], sort: true },
    email: { access: 'readWrite' },
  },
  relationships: {
    organization_id: {
      target: () => Organizations,
      access: 'readWrite',
      include: true,
    },
  },
});

/** Tags, which a raw definition declares without pages. */
const Tags = createDefineResource({ links: { base: '/api' } })({
  type: 'tags',
  attributes: ['name'],
  serialize: (row: { readonly id: string; readonly name: string }) => ({
    id: row.id,
    attributes: { name: row.name },
  }),
});

const clients = createClients(
  {
    organizations: Organizations.resource,
    contacts: Contacts.resource,
    tags: Tags,
  },
  createTransport({ origin: 'https://api.example.test' }),
);
const contacts = resourceQueries(clients.contacts);
const organizations = resourceQueries(clients.organizations);
const queryClient = new QueryClient();

/** What the client's own calls resolve to, for the queries the screens below pass. */
const listed = clients.contacts.list({ include: ['organization'] });
const got = clients.contacts.get('1', { fields: { contacts: ['name'] } });
const feedPage = clients.contacts.list({ sort: ['-name'] });
const created = clients.contacts.create({ attributes: { name: 'Ada' } });

type Contact = typeof Contacts.resource;

function ContactList() {
  return useQuery(contacts.list({ include: ['organization'] })).data;
}

function ContactName() {
  return useQuery(contacts.get('1', { fields: { contacts: ['name'] } })).data;
}

function ContactFeed() {
  return useInfiniteQuery(contacts.pages({ sort: ['-name'] })).data;
}

function ContactWrites() {
  return {
    create: useMutation(contacts.create()).mutateAsync,
    update: useMutation(contacts.update()).mutate,
    remove: useMutation(contacts.remove()).mutate,
  };
}

describe('resourceQueries (resource SPEC 20.6)', () => {
  it("types each read's data as the client's call for the query passed", () => {
    expectTypeOf(contacts.all).toEqualTypeOf<readonly ['contacts']>();
    expectTypeOf(ContactList).returns.toEqualTypeOf<
      Awaited<typeof listed> | undefined
    >();
    expectTypeOf(ContactName).returns.toEqualTypeOf<
      Awaited<typeof got> | undefined
    >();
    expectTypeOf(ContactFeed).returns.toEqualTypeOf<
      InfiniteData<Awaited<typeof feedPage>> | undefined
    >();
  });

  it('reads getQueryData through the tagged keys', () => {
    expectTypeOf(
      queryClient.getQueryData(
        contacts.list({ include: ['organization'] }).queryKey,
      ),
    ).toEqualTypeOf<Awaited<typeof listed> | undefined>();
    expectTypeOf(
      queryClient.getQueryData(
        contacts.get('1', { fields: { contacts: ['name'] } }).queryKey,
      ),
    ).toEqualTypeOf<Awaited<typeof got> | undefined>();
  });

  it("types each write's variables as the client's call takes them", () => {
    const writes = ContactWrites();
    expectTypeOf(writes.create)
      .parameter(0)
      .toEqualTypeOf<CreateInput<Contact>>();
    expectTypeOf(writes.create).returns.resolves.toEqualTypeOf<
      Awaited<typeof created>
    >();
    expectTypeOf(writes.update)
      .parameter(0)
      .toEqualTypeOf<{ readonly id: string } & UpdateInput<Contact>>();
    expectTypeOf(writes.remove).parameter(0).toEqualTypeOf<string>();
    writes.update({ id: '1', attributes: { name: 'Ada Lovelace' } });
    // @ts-expect-error -- an update names the record it writes
    writes.update({ attributes: { name: 'Ada Lovelace' } });
    // @ts-expect-error -- the declaration writes no such attribute
    writes.update({ id: '1', attributes: { nickname: 'Ada' } });
    expectTypeOf<WriteResult<undefined>>().toEqualTypeOf<
      Awaited<ReturnType<typeof clients.contacts.remove>>
    >();
  });

  it('takes the declared query members alone, and invalidates any key', () => {
    contacts.list({ sort: ['name'], filter: { name: 'Ada' } });
    // @ts-expect-error -- the declaration sorts by no such field
    contacts.list({ sort: ['email'] });
    // @ts-expect-error -- a get sends no sort
    contacts.get('1', { sort: ['name'] });
    contacts.create({
      invalidates: [organizations.all, organizations.list().queryKey],
    });
  });

  it('has no pages on a definition that does not paginate', () => {
    expectTypeOf(resourceQueries(clients.tags).pages).toBeNever();
    expectTypeOf(contacts.pages).not.toBeNever();
  });
});
