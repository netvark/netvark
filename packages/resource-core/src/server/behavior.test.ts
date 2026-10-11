import { describe, expect, it } from 'vitest';

import {
  Contacts,
  DocumentNotes,
  Organizations,
  Teams,
} from '../test-support/domain-resources';
import { defineResourceIn, isResourceBehavior } from './define-resource';
import { definePolicyIn, denyAll } from './policy';

const slug = () => ({ slug: 'acme' });
/** A rule that awaits, as a lookup in another service would. */
const rule = async () => {
  await Promise.resolve();
};
const effect = () => [];

describe('defineResource (SPEC 12.3)', () => {
  it('normalizes the behavior: denyAll, and empty rules and effects', () => {
    const behavior = defineResourceIn(Contacts, {
      operations: { create: { quota: 'contacts' }, remove: { rules: [rule] } },
    });
    expect(behavior.resource).toBe(Contacts);
    expect(behavior.policy).toBe(denyAll);
    expect(behavior.operations).toEqual({
      create: { values: undefined, quota: 'contacts', rules: [], effects: [] },
      remove: { rules: [rule], effects: [] },
    });
    expect(behavior.serverValues).toEqual([]);
    expect(Object.isFrozen(behavior)).toBe(true);
    expect(Object.isFrozen(behavior.operations.remove?.rules)).toBe(true);
  });

  it('recognizes what it returned, and no copy of it', () => {
    const behavior = defineResourceIn(Contacts, {});
    expect(isResourceBehavior(behavior)).toBe(true);
    expect(isResourceBehavior({ ...behavior })).toBe(false);
    expect(isResourceBehavior(Contacts)).toBe(false);
    expect(isResourceBehavior(null)).toBe(false);
    expect(isResourceBehavior('contacts')).toBe(false);
  });

  it("keeps the resource's own policy", () => {
    const policy = definePolicyIn(Contacts, { list: () => true });
    expect(defineResourceIn(Contacts, { policy }).policy).toBe(policy);
  });

  it('lists the server values a create must supply, in column order', () => {
    const organizations = defineResourceIn(Organizations, {
      operations: { create: { values: slug, effects: [effect] } },
    });
    expect(organizations.serverValues).toEqual(['slug']);
    expect(organizations.operations.create?.values).toBe(slug);
    const notes = defineResourceIn(DocumentNotes, {
      operations: { create: { values: () => ({}) } },
    });
    expect(notes.serverValues).toEqual(['id', 'document']);
  });

  it('takes a read-only resource with nothing but a policy', () => {
    expect(defineResourceIn(Teams, {}).operations).toEqual({});
  });
});

describe('defineResource: what JavaScript passes', () => {
  const where = 'defineResource: contacts: operations';

  it.each([
    [
      {},
      {},
      'defineResource: the resource must be a resource declareResource returned',
    ],
    [
      Contacts,
      null,
      'defineResource: contacts: the behavior must be an object',
    ],
    [
      Contacts,
      { policy: {} },
      'defineResource: contacts: policy must come from definePolicy(contacts, ...) or be denyAll',
    ],
    [
      Contacts,
      { policy: definePolicyIn(Organizations, {}) },
      'defineResource: contacts: policy must come from definePolicy(contacts, ...) or be denyAll',
    ],
    [Contacts, { operations: [] }, `${where} must be an object`],
    [
      Contacts,
      { operations: { list: {} } },
      `${where}: "list" has no behavior; operations takes create, update, and remove`,
    ],
    [
      Teams,
      { operations: { create: {} } },
      'defineResource: teams: operations: create is not a declared operation',
    ],
    [
      Contacts,
      { operations: { create: null } },
      `${where}.create must be an object`,
    ],
    [
      Contacts,
      { operations: { update: { quota: 'contacts' } } },
      `${where}.update: "quota" is not one of rules, effects`,
    ],
    [
      Contacts,
      { operations: { create: { quota: '' } } },
      `${where}.create.quota must be a quota's name`,
    ],
    [
      Contacts,
      { operations: { create: { rules: rule } } },
      `${where}.create.rules must be an array of functions`,
    ],
    [
      Contacts,
      { operations: { remove: { effects: [effect, 'x'] } } },
      `${where}.remove.effects must be an array of functions`,
    ],
    [
      Contacts,
      { operations: { create: { values: slug } } },
      `${where}.create.values must be absent: the resource has no server values`,
    ],
    [
      Organizations,
      {},
      'defineResource: organizations: operations.create.values must supply slug',
    ],
    [
      Organizations,
      { operations: { create: {} } },
      'defineResource: organizations: operations.create.values must supply slug',
    ],
    [
      DocumentNotes,
      { operations: { create: { values: {} } } },
      'defineResource: document_notes: operations.create.values must supply id, document',
    ],
  ])('refuses %#', (resource, init, message) => {
    expect(() => defineResourceIn(resource, init)).toThrow(
      new TypeError(message),
    );
  });
});
