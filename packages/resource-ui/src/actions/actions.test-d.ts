/**
 * The types of record and bulk actions (resource SPEC 21.4): a write the
 * declaration does not serve is `never`, an update's values are the
 * definition's update input, the texts take the record or the count, and the
 * models fit the mutations a screen sends them through, read through
 * query-core's `MutationObserver`, which every adapter's `useMutation` is
 * made of: `variables` those of `resourceQueries`' `update` and `remove`
 * (jsonapi SPEC 16.2), and `operations` that of `operationsMutation`
 * (jsonapi SPEC 17.4). A record the list reads, by the list model's state or
 * with includes, is an `ActionRecord`.
 */
import type { UpdateInput } from '@netvark/jsonapi-client';
import type { DeclaredResource } from '@netvark/resource-core';

import type { ListState } from '../list/list-types';
import type {
  ActionRecord,
  ActionValues,
  BulkActionInit,
  RecordActionInit,
} from './action-types';

import { MutationObserver, QueryClient } from '@tanstack/query-core';
import { describe, expectTypeOf, it } from 'vitest';

import {
  createClients,
  createTransport,
  operationsOf,
} from '@netvark/jsonapi-client';
import { createDeclareResource } from '@netvark/resource-core';
import {
  operationsMutation,
  resourceQueries,
} from '@netvark/tanstack-query-jsonapi';

import { publicCatalog } from '../test-support/public-catalog';
import { FIXTURE_REGISTRIES } from '../test-support/registries';
import { Contacts as WideContacts } from '../test-support/resources';
import { bulkActions } from './bulk-actions';
import { recordActions } from './record-actions';

const declareResource = createDeclareResource({
  catalog: publicCatalog,
  ...FIXTURE_REGISTRIES,
  links: { base: '/api' },
});

const Plans = declareResource('plans', {
  operations: ['list', 'get'],
  fields: { seats: { access: 'read' } },
});

const Organizations = declareResource('organizations', {
  operations: ['list', 'get', 'create', 'update'],
  fields: {
    name: { access: 'readWrite' },
    verified: { access: 'readWrite' },
  },
  relationships: { plan_id: { target: () => Plans, access: 'readWrite' } },
  rules: {
    organizations_enterprise_verified: { validator: 'enterpriseVerified' },
  },
});

const Contacts = declareResource('contacts', {
  operations: ['list', 'get', 'create', 'update', 'remove'],
  fields: {
    kind: { access: 'immutable' },
    name: { access: 'readWrite', sort: true },
    status: { access: 'readWrite', filter: ['eq'] },
    created_at: { access: 'read' },
  },
  relationships: {
    organization_id: {
      target: () => Organizations,
      access: 'readWrite',
      include: true,
    },
  },
});

const transport = createTransport({ origin: 'https://api.example.test' });
const clients = createClients(
  {
    plans: Plans.resource,
    organizations: Organizations.resource,
    contacts: Contacts.resource,
  },
  transport,
);
const contacts = resourceQueries(clients.contacts);
const queryClient = new QueryClient();
const listState: ListState<typeof Contacts> = {};
/** A page of contacts read by the list model's state, as the screens of SPEC 20.8 read it. */
const listedByState = async () => clients.contacts.list(listState);
/** A page of contacts read with their organizations. */
const listedWithOrganizations = async () =>
  clients.contacts.list({ include: ['organization'] });
const label = (): string => 'Archive';
const tooMany = ({ max }: { readonly max: number }): string => `At most ${max}`;

const rows = recordActions(Contacts, {
  actions: {
    archive: { label, update: { attributes: { status: 'archived' } } },
    remove: { label, tone: 'danger', remove: true },
  },
});
const selection = bulkActions(Contacts, {
  tooMany,
  actions: {
    restore: { label, update: { attributes: { status: 'active' } } },
    remove: { label, remove: true },
  },
});

describe('the writes an action makes (resource SPEC 21.4)', () => {
  it('types an action whose write the declaration does not serve as never', () => {
    expectTypeOf<RecordActionInit<typeof Plans>>().toBeNever();
    expectTypeOf<BulkActionInit<typeof Plans>>().toBeNever();
    recordActions(Organizations, {
      // @ts-expect-error -- organizations does not serve remove
      actions: { remove: { label, remove: true } },
    });
    bulkActions(Organizations, {
      tooMany,
      // @ts-expect-error -- organizations does not serve remove
      actions: { remove: { label, remove: true } },
    });
  });

  it("types an update's values by the definition's update input", () => {
    expectTypeOf<ActionValues<typeof Contacts>>().toEqualTypeOf<
      UpdateInput<typeof Contacts.resource>
    >();
    recordActions(Contacts, {
      actions: {
        // @ts-expect-error -- deleted is no status
        archive: { label, update: { attributes: { status: 'deleted' } } },
      },
    });
    recordActions(Contacts, {
      actions: {
        // @ts-expect-error -- kind is immutable, which no update writes
        archive: { label, update: { attributes: { kind: 'company' } } },
      },
    });
    recordActions(Contacts, {
      actions: {
        move: { label, update: { relationships: { organization: '7' } } },
      },
    });
  });

  it('refuses both writes and neither', () => {
    recordActions(Contacts, {
      actions: {
        // @ts-expect-error -- an action makes one write
        both: { label, remove: true, update: { attributes: { name: 'A' } } },
      },
    });
    recordActions(Contacts, {
      actions: {
        // @ts-expect-error -- an action makes a write
        neither: { label },
      },
    });
  });

  it('serves every write of a resource TypeScript does not know, its values wide', () => {
    const wide = recordActions(WideContacts, {
      actions: { archive: { label, update: { attributes: { any: 1 } } } },
    });

    expectTypeOf<RecordActionInit<DeclaredResource>>().not.toBeNever();
    expectTypeOf(wide.archive.call).toEqualTypeOf<'update' | 'remove'>();
  });
});

describe('the texts and names of the models (resource SPEC 21.2, 21.3)', () => {
  it("names the model's actions, and what can takes, by the names given", () => {
    const named = recordActions(Contacts, {
      can: (name) => {
        expectTypeOf(name).toEqualTypeOf<'archive' | 'remove'>();
        return true;
      },
      actions: {
        archive: { label, update: { attributes: { status: 'archived' } } },
        remove: { label, remove: true },
      },
    });

    expectTypeOf<keyof typeof named>().toEqualTypeOf<'archive' | 'remove'>();
    expectTypeOf(named.archive.name).toEqualTypeOf<'archive'>();
  });

  it("types a record action's texts by the record, and a bulk action's by the count", () => {
    recordActions(Contacts, {
      actions: {
        archive: {
          label,
          update: { attributes: { status: 'archived' } },
          hidden: (contact) => contact.status === 'archived',
          disabled: (contact) => contact.name === '' && 'No name',
          confirm: { title: (contact) => `Archive ${contact.name}?` },
          done: (contact) => `${contact.name} archived`,
        },
      },
    });
    bulkActions(Contacts, {
      tooMany,
      actions: {
        remove: {
          label,
          remove: true,
          disabled: (ids) => ids.length > 3,
          confirm: { title: ({ count }) => `Remove ${count}?` },
          done: ({ count }) => `${count} removed`,
        },
      },
    });
  });

  it('takes the records the list reads, by the list model state or with includes', () => {
    type Listed = Awaited<ReturnType<typeof listedByState>>['data'][number];
    type Included = Awaited<
      ReturnType<typeof listedWithOrganizations>
    >['data'][number];

    expectTypeOf<Listed>().toExtend<ActionRecord<typeof Contacts>>();
    expectTypeOf<Included>().toExtend<ActionRecord<typeof Contacts>>();
  });
});

describe('the mutations a screen sends them through (jsonapi SPEC 16.2, 17.4)', () => {
  it("gives a record action's variables to resourceQueries' update and remove", () => {
    const update = new MutationObserver(queryClient, contacts.update());
    const remove = new MutationObserver(queryClient, contacts.remove());
    type Archive = Extract<
      (typeof rows)['archive'],
      { readonly call: 'update' }
    >;
    type Remove = Extract<(typeof rows)['remove'], { readonly call: 'remove' }>;
    const run = async (
      action: (typeof rows)['archive' | 'remove'],
      contact: ActionRecord<typeof Contacts>,
    ): Promise<void> => {
      await (action.call === 'update'
        ? update.mutate(action.variables(contact))
        : remove.mutate(action.variables(contact)));
    };

    expectTypeOf<ReturnType<Archive['variables']>>().toExtend<
      Parameters<typeof update.mutate>[0]
    >();
    expectTypeOf<ReturnType<Remove['variables']>>().toEqualTypeOf<
      Parameters<typeof remove.mutate>[0]
    >();
    expectTypeOf(run).toBeFunction();
  });

  it("gives a bulk action's operations to operationsMutation, typed as the definition's builders type them", () => {
    const operations = new MutationObserver(
      queryClient,
      operationsMutation(transport),
    );
    const builders = operationsOf(Contacts.resource);
    type Restore = Extract<
      (typeof selection)['restore'],
      { readonly call: 'update' }
    >;
    type Remove = Extract<
      (typeof selection)['remove'],
      { readonly call: 'remove' }
    >;

    void operations.mutate(selection.restore.operations(['c1']));
    void operations.mutate(selection.remove.operations(['c1']));
    expectTypeOf<ReturnType<Restore['operations']>>().toEqualTypeOf<
      ReadonlyArray<ReturnType<typeof builders.update>>
    >();
    expectTypeOf<ReturnType<Remove['operations']>>().toEqualTypeOf<
      ReadonlyArray<ReturnType<typeof builders.remove>>
    >();
  });
});
