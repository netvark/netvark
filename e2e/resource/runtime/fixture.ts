/**
 * What the runtime's tests share (resource SPEC 12): the plans, the
 * actors, a contact as a parsed resource object, and the runtime over the
 * reference adapter on the runtime's database. Acme's plan holds three
 * contacts and no companies; Globex's holds ten and companies.
 */
import type { RuntimeDatabase } from './database.ts';
import type { AppActor, Permission, Plan, Services } from './domain.ts';
import type { ResourceInput, Runtime } from './runtime.ts';

import { BanError } from '@netvark/ban-core';

import { publicCatalog } from '../fixtures/contacts/public-catalog.ts';
import { DEFINE_KEYSET } from '../support/keyset-definer.ts';
import { referenceAdapter } from '../support/reference-adapter.ts';
import { OUTBOX, openRuntimeDatabase } from './database.ts';
import { createRuntime } from './runtime.ts';

const PLANS: ReadonlyMap<number, Plan> = new Map([
  [1, { contacts: 3, companies: false }],
  [2, { contacts: 10, companies: true }],
]);

const services: Services = {
  plans: {
    of: async (organization) => {
      await Promise.resolve();
      const plan = PLANS.get(organization);
      if (plan === undefined) {
        throw new Error(`organization ${String(organization)} has no plan`);
      }
      return plan;
    },
  },
};

function member(
  organization: number,
  permissions: ReadonlyArray<Permission>,
): AppActor {
  return {
    id: `member of ${String(organization)}`,
    organization,
    can: (permission) => permissions.includes(permission),
  };
}

/** Acme's members by role, and an editor at Globex. */
export const editor = member(1, ['contacts:read', 'contacts:write']);
export const viewer = member(1, ['contacts:read']);
export const stranger = member(1, []);
export const globex = member(2, ['contacts:read', 'contacts:write']);

/** A contact's attributes as `@netvark/jsonapi-core` parses a resource object. */
export function contact(attributes: Record<string, unknown>): ResourceInput {
  return { attributes, relationships: {} };
}

/** The runtime over the reference adapter on a fresh database. */
export async function openRuntime(): Promise<{
  readonly database: RuntimeDatabase;
  readonly runtime: Runtime;
}> {
  const database = await openRuntimeDatabase();
  const adapter = referenceAdapter({
    catalog: publicCatalog,
    codecs: {},
    outbox: OUTBOX,
    defineKeyset: DEFINE_KEYSET,
    transact: database.transact,
  });
  return { database, runtime: createRuntime(adapter, services) };
}

/** What a client sees of an error the runtime threw. */
export async function visibleError(promise: Promise<unknown>) {
  const error: unknown = await promise.then(
    () => {
      throw new Error('the operation succeeded');
    },
    (failure: unknown) => failure,
  );
  if (!(error instanceof BanError)) {
    throw error;
  }
  const { status, code, title, detail, errors } = error;
  return { status, code, title, detail, errors };
}
