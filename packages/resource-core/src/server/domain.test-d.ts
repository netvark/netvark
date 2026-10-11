import type { DeclaredResource } from '../declare/declared-resource';
import type { Actor } from './domain-types';
import type { PublicRowOf, ResourceBehavior, ServerValuesOf } from './index';

import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { createDomainDefiners } from './domain';
import { defineEvent } from './event';
import { denyAll } from './policy';

const declareResource = createDeclareResource({
  catalog: contactsCatalog,
  ...TEST_REGISTRIES,
});
const Organizations = declareResource('organizations', {
  operations: ['get', 'create', 'update'],
  fields: { name: { access: 'readWrite' }, slug: { access: 'read' } },
});
const Contacts = declareResource('contacts', {
  operations: ['list', 'get', 'create', 'update', 'remove'],
  scope: 'organization',
  fields: {
    name: { access: 'readWrite' },
    email: { access: 'readWrite' },
    kind: { access: 'immutable' },
  },
  relationships: {
    organization_id: {
      target: () => Organizations,
      access: 'read',
      include: true,
    },
  },
});
const DocumentNotes = declareResource('document_notes', {
  operations: ['get', 'create'],
  fields: {},
});
const Teams = declareResource('teams', {
  operations: ['list', 'get'],
  fields: { name: { access: 'read' } },
});

type Permission = 'contacts:read' | 'contacts:write';
interface AppActor extends Actor<Permission> {
  readonly organizationId: number;
}
interface Services {
  readonly meetings: { readonly existFor: (id: string) => Promise<boolean> };
}
const APP_ERRORS = {
  CONTACT_HAS_MEETINGS: { status: 409, title: 'Contact Has Meetings' },
} as const;
interface AppDomain {
  readonly actor: AppActor;
  readonly permissions: Permission;
  readonly quotas: 'contacts';
  readonly services: Services;
  readonly errors: typeof APP_ERRORS;
}

const { definePolicy, defineResource } = createDomainDefiners<AppDomain>();
const ContactCreated = defineEvent(
  'contact.created',
  1,
  z.object({ id: z.string() }),
);

describe('createDomainDefiners types (SPEC 12.1)', () => {
  it('checks permissions against the domain', () => {
    definePolicy(Contacts, {
      list: ({ actor }) => actor.can('contacts:read'),
      // @ts-expect-error a permission the domain does not have
      get: ({ actor }) => actor.can('contacts:raed'),
    });
  });

  it('refuses a domain whose actor cannot check every permission', () => {
    interface ReaderActor extends Actor<'contacts:read'> {}
    // @ts-expect-error the actor cannot check contacts:write
    createDomainDefiners<{
      readonly actor: ReaderActor;
      readonly permissions: Permission;
      readonly quotas: never;
      readonly services: undefined;
      readonly errors: typeof APP_ERRORS;
    }>();
  });

  it('checks quota names against the domain', () => {
    defineResource(Contacts, { operations: { create: { quota: 'contacts' } } });
    // @ts-expect-error a quota the domain does not have
    defineResource(Contacts, { operations: { create: { quota: 'contact' } } });
  });

  it("types reject by the domain's codes and the resource's members", () => {
    defineResource(Contacts, {
      operations: {
        remove: {
          rules: [
            async ({ row, services, reject }) => {
              if (await services.meetings.existFor(row.id)) {
                reject('CONTACT_HAS_MEETINGS', {
                  fields: ['id', 'name', 'organization'],
                });
              }
            },
            ({ reject }) => {
              // @ts-expect-error a code the domain does not have
              reject('CONTACT_LIMTI');
            },
            ({ reject }) => {
              // @ts-expect-error a member the resource does not have
              reject('CONTACT_HAS_MEETINGS', { fields: ['nmae'] });
            },
          ],
        },
      },
    });
  });
});

describe('server values (SPEC 12.3)', () => {
  it('types the columns no client member, scope, or client id covers', () => {
    expectTypeOf<ServerValuesOf<typeof Organizations>>().toEqualTypeOf<{
      readonly slug: string;
    }>();
    expectTypeOf<keyof ServerValuesOf<typeof DocumentNotes>>().toEqualTypeOf<
      'id' | 'document'
    >();
    expectTypeOf<
      ServerValuesOf<typeof DocumentNotes>['id']
    >().toEqualTypeOf<string>();
    expectTypeOf<
      // oxlint-disable-next-line typescript/no-generated-empty-object-type -- reason: contacts has no server values, so the type under test is empty
      keyof ServerValuesOf<typeof Contacts>
    >().toEqualTypeOf<never>();
  });

  it('requires values exactly when there are server values', () => {
    defineResource(Organizations, {
      operations: {
        create: {
          values: ({ input }) => ({
            slug: input.attributes.name.toLowerCase(),
          }),
        },
      },
    });
    // @ts-expect-error operations.create.values is required
    defineResource(Organizations, {});
    // @ts-expect-error values is required
    defineResource(Organizations, { operations: { create: {} } });
    defineResource(Organizations, {
      // @ts-expect-error a missing column
      operations: { create: { values: () => ({}) } },
    });
    defineResource(Organizations, {
      operations: {
        create: {
          // @ts-expect-error an extra column
          values: () => ({ slug: 'acme', seats: 3 }),
        },
      },
    });
    defineResource(Organizations, {
      operations: {
        create: {
          // @ts-expect-error a value of the wrong type
          values: () => ({ slug: 3 }),
        },
      },
    });
    defineResource(Contacts, {
      operations: {
        create: {
          // @ts-expect-error a resource without server values takes no values
          values: () => ({}),
        },
      },
    });
  });
});

describe('policies and behavior (SPEC 12.2, 12.3)', () => {
  it('types rows and inputs by public name', () => {
    definePolicy(Contacts, {
      get: ({ row }) => {
        expectTypeOf(row.id).toEqualTypeOf<string>();
        expectTypeOf(row.organization).toEqualTypeOf<string>();
        expectTypeOf(row.email).toEqualTypeOf<string | null>();
        // @ts-expect-error a member the row does not have
        return row.nope === undefined;
      },
      create: ({ input }) => input.attributes.name !== '',
      update: ({ input }) => {
        // @ts-expect-error an immutable field is not part of an update
        return input.attributes.kind === undefined;
      },
      include: { organization: ({ actor }) => actor.can('contacts:read') },
    });
    expectTypeOf<PublicRowOf<typeof Teams>>().toEqualTypeOf<{
      readonly id: string;
      readonly name: string;
    }>();
  });

  it('refuses a predicate for an undeclared operation or relationship', () => {
    definePolicy(Organizations, {
      // @ts-expect-error organizations does not declare remove
      remove: () => true,
    });
    definePolicy(Teams, {
      // @ts-expect-error teams has no includable relationship
      include: { lead: () => true },
    });
  });

  it('takes behavior only for the declared writing operations', () => {
    defineResource(Teams, { policy: denyAll });
    // @ts-expect-error teams does not declare create
    defineResource(Teams, { operations: { create: {} } });
    // @ts-expect-error list has no behavior
    defineResource(Contacts, { operations: { list: {} } });
  });

  it('types the effects and the events they return', () => {
    defineResource(Contacts, {
      policy: definePolicy(Contacts, { list: () => true }),
      operations: {
        create: { effects: [({ row }) => [ContactCreated.of({ id: row.id })]] },
        update: {
          effects: [
            ({ row, previous }) =>
              row.name === previous.name
                ? []
                : [ContactCreated.of({ id: row.id })],
          ],
        },
        remove: {
          rules: [
            // @ts-expect-error a remove carries no input
            ({ input }) => input,
          ],
          // @ts-expect-error the payload's id is a string
          effects: [() => [ContactCreated.of({ id: 1 })]],
        },
      },
    });
  });
});

describe('what a runtime takes (SPEC 12.3)', () => {
  it("takes any resource's behavior as ResourceBehavior<TDomain>, whose resource a storage adapter takes", () => {
    const behavior = defineResource(Contacts, {
      policy: definePolicy(Contacts, { get: ({ row }) => row.name !== '' }),
      operations: {
        create: { effects: [({ row }) => [ContactCreated.of({ id: row.id })]] },
      },
    });
    expectTypeOf(behavior).toExtend<ResourceBehavior<AppDomain>>();
    expectTypeOf<
      ResourceBehavior<AppDomain>['resource']
    >().toExtend<DeclaredResource>();
    expectTypeOf(
      behavior.resource.fields.name.kind,
    ).toEqualTypeOf<'attribute'>();
  });
});
