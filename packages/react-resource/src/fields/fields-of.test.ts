import { afterEach, describe, expect, it } from 'vitest';

import { messages, setLocale } from '../test-support/messages';
import {
  Contacts,
  Organizations,
  Plans,
  RESOURCES,
} from '../test-support/resources';
import { fieldsOf } from './fields-of';

afterEach(() => {
  setLocale('de');
});

const contacts = fieldsOf(Contacts, messages);
const organizations = fieldsOf(Organizations, messages);

/** The label `messages` hold for a member, the function itself. */
function labelOf(type: string, name: string): unknown {
  return messages.fields[type]?.[name];
}

/** The label `messages` hold for an option of a member. */
function optionLabelOf(type: string, name: string, value: string): unknown {
  return messages.options[type]?.[name]?.[value];
}

describe('fieldsOf (resource SPEC 20.2)', () => {
  it('describes every field and then every relationship, in declaration order', () => {
    expect(Object.keys(contacts)).toEqual([
      'kind',
      'name',
      'nickname',
      'email',
      'status',
      'priority',
      'discount',
      'lifetimeValue',
      'score',
      'tags',
      'channels',
      'vip',
      'birthday',
      'followUpAt',
      'details',
      'createdAt',
      'organization',
    ]);
    for (const [name, descriptor] of Object.entries(contacts)) {
      expect(descriptor.name).toBe(name);
      expect(descriptor.meta).toBe(Contacts.fields[name]);
    }
  });

  it("holds the messages' own label functions, which render in the locale of each call", () => {
    for (const [name, descriptor] of Object.entries(contacts)) {
      expect(descriptor.label).toBe(labelOf('contacts', name));
    }
    const { followUpAt, organization } = contacts;
    expect([followUpAt!.label(), organization!.label()]).toEqual([
      'Wiedervorlage',
      'Organisation',
    ]);
    setLocale('en');
    expect([followUpAt!.label(), organization!.label()]).toEqual([
      'Follow up at',
      'Organization',
    ]);
  });

  it("lists an enum's, an enum rule's, and an array's element options in order, each with the messages' own label", () => {
    const options = (name: string): unknown =>
      contacts[name]!.options?.map(({ value, label }) => [value, label]);
    expect(options('kind')).toEqual([
      ['person', optionLabelOf('contacts', 'kind', 'person')],
      ['company', optionLabelOf('contacts', 'kind', 'company')],
    ]);
    expect(options('status')).toEqual([
      ['active', optionLabelOf('contacts', 'status', 'active')],
      ['archived', optionLabelOf('contacts', 'status', 'archived')],
    ]);
    expect(options('channels')).toEqual([
      ['email', optionLabelOf('contacts', 'channels', 'email')],
      ['phone', optionLabelOf('contacts', 'channels', 'phone')],
      ['post', optionLabelOf('contacts', 'channels', 'post')],
    ]);
    expect(contacts['status']!.options?.map(({ label }) => label())).toEqual([
      'Aktiv',
      'Archiviert',
    ]);
    setLocale('en');
    expect(contacts['status']!.options?.map(({ label }) => label())).toEqual([
      'Active',
      'Archived',
    ]);
  });

  it('gives no options to a member without any, nor to a relationship, even one whose ids have options', () => {
    const plan = organizations['plan']!;
    expect(plan.meta.options).toEqual(['free', 'team', 'enterprise']);
    expect(plan.options).toBeNull();
    expect(contacts['organization']!.options).toBeNull();
    expect(
      ['name', 'tags', 'vip', 'details'].map((name) => contacts[name]!.options),
    ).toEqual([null, null, null, null]);
  });

  it('takes required and sortable from the metadata: what a create must carry, and what clients may sort by', () => {
    const facts = Object.values(contacts).map(
      ({ name, required, sortable, meta }) => {
        expect([required, sortable]).toEqual([meta.required, meta.sortable]);
        return [name, required, sortable];
      },
    );
    expect(facts.filter(([, required]) => required === true)).toEqual([
      ['name', true, true],
      ['organization', true, false],
    ]);
    expect(
      facts.filter(([, , sortable]) => sortable === true).map(([name]) => name),
    ).toEqual([
      'name',
      'priority',
      'lifetimeValue',
      'score',
      'followUpAt',
      'createdAt',
    ]);
  });

  it("names each filter's control by the SPEC's table, with the declared operators in order", () => {
    const filtersOf = (descriptors: typeof contacts): Record<string, unknown> =>
      Object.fromEntries(
        Object.values(descriptors).map(({ name, filter }) => [
          name,
          filter === null ? null : [filter.kind, filter.operators],
        ]),
      );
    expect(filtersOf(contacts)).toEqual({
      kind: ['options', ['eq', 'in']],
      name: ['text', ['eq', 'startsWithi']],
      nickname: null,
      email: ['text', ['eq']],
      status: ['options', ['eq', 'in']],
      priority: ['number', ['gte', 'lte']],
      discount: ['number', ['gte', 'lte']],
      lifetimeValue: ['number', ['gte']],
      score: ['number', ['gte', 'lte']],
      tags: ['values', ['contains', 'overlaps']],
      channels: null,
      vip: ['boolean', ['eq']],
      birthday: ['date', ['gte', 'lt']],
      followUpAt: ['date', ['gte', 'lt']],
      details: null,
      createdAt: ['date', ['gte', 'lt']],
      organization: ['reference', ['eq', 'in']],
    });
    expect(filtersOf(organizations)).toEqual({
      name: ['text', ['eq', 'containsi']],
      verified: ['boolean', ['eq']],
      foundedOn: ['date', ['gte', 'lte']],
      createdAt: null,
      plan: ['reference', ['eq', 'in']],
    });
    expect(contacts['tags']!.filter?.operators).toBe(
      Contacts.fields['tags']!.filter,
    );
  });

  it('is frozen through every descriptor, option list, and option', () => {
    expect(Object.isFrozen(contacts)).toBe(true);
    for (const descriptor of Object.values(contacts)) {
      expect(Object.isFrozen(descriptor)).toBe(true);
      expect(
        descriptor.filter === null || Object.isFrozen(descriptor.filter),
      ).toBe(true);
      for (const option of descriptor.options ?? []) {
        expect(Object.isFrozen(option)).toBe(true);
      }
    }
    expect(Object.isFrozen(contacts['kind']!.options)).toBe(true);
  });

  it('describes a resource whose messages hold no options, such as a lookup table', () => {
    const plans = fieldsOf(Plans, messages);
    expect(Object.keys(plans)).toEqual(['seats']);
    expect(plans['seats']!.label()).toBe('Plätze');
  });
});

describe('the fixture', () => {
  it('lists every resource the messages were defined for', () => {
    expect(RESOURCES.map(({ names }) => names.type)).toEqual([
      'plans',
      'organizations',
      'contacts',
    ]);
  });
});
