import { afterEach, describe, expect, it } from 'vitest';

import { messages, setLocale } from '../test-support/messages';
import { Contacts, Organizations } from '../test-support/resources';
import { resourceForm } from './resource-form';

afterEach(() => {
  setLocale('de');
});

const CONTACT = {
  type: 'contacts',
  id: '0b6f4a52-62a4-4f4e-9c1e-1f0c5a4e7d10',
  name: 'Ada Lovelace',
  nickname: null,
  email: null,
  status: 'active',
  priority: 2,
  discount: '0',
  lifetimeValue: null,
  score: null,
  tags: [],
  ratings: null,
  channels: [],
  vip: false,
  birthday: null,
  followUpAt: null,
  details: null,
  organization: { type: 'organizations', id: '7' },
  referredBy: null,
};

const ORGANIZATION = {
  type: 'organizations',
  id: '7',
  name: 'Analytical Engines',
  verified: true,
  marketingOptIn: false,
  openDays: [],
  foundedOn: null,
  plan: { type: 'plans', id: 'team' },
};

const edit = resourceForm(Contacts, 'update', { messages, record: CONTACT });

/** The issues the validator reports for the record's values with `changes`. */
function issuesOf(changes: Record<string, unknown>) {
  const result = edit.validator['~standard'].validate({
    ...edit.defaultValues,
    ...changes,
  });
  return 'issues' in result ? result.issues : [];
}

describe('blank values (resource SPEC 20.3, ADR 0015, ADR 0016)', () => {
  it('reads a blank that a member refuses as required, with the label of the member', () => {
    expect(issuesOf({ name: '', vip: null, organization: '' })).toEqual([
      { message: 'Name fehlt.', path: ['name'] },
      { message: 'VIP fehlt.', path: ['vip'] },
      { message: 'Organisation fehlt.', path: ['organization'] },
    ]);
  });

  it('accepts a blank of a nullable member, which clears it', () => {
    expect(
      issuesOf({
        nickname: '',
        priority: '',
        referredBy: '',
        details: undefined,
      }),
    ).toEqual([]);
  });

  it('refuses a required member left blank on create, and a required boolean left unset', () => {
    const create = resourceForm(Organizations, 'create', { messages });
    expect(
      create.validator['~standard'].validate(create.defaultValues),
    ).toEqual({
      issues: [
        { message: 'Name fehlt.', path: ['name'] },
        { message: 'Werbung erlaubt fehlt.', path: ['marketingOptIn'] },
      ],
    });
  });

  it('keeps the rule an entered value breaks, which is no blank', () => {
    expect(issuesOf({ nickname: ' ' })).toEqual([]);
    const organizations = resourceForm(Organizations, 'update', {
      messages,
      record: ORGANIZATION,
    });
    expect(
      organizations.validator['~standard'].validate({
        ...organizations.defaultValues,
        inviteCode: 'abc',
      }),
    ).toEqual({
      issues: [{ message: 'Mindestens 6 Zeichen.', path: ['inviteCode'] }],
    });
  });
});

describe('texts in the locale of each validation (resource SPEC 20.3, ADR 0014)', () => {
  it('renders each text when the validator runs, so a change of locale shows on the next validation', () => {
    const values = { ...edit.defaultValues, name: '', priority: '9' };
    expect(edit.validator['~standard'].validate(values)).toEqual({
      issues: [
        { message: 'Name fehlt.', path: ['name'] },
        { message: 'Höchstens 5.', path: ['priority'] },
      ],
    });
    setLocale('en');
    expect(edit.validator['~standard'].validate(values)).toEqual({
      issues: [
        { message: 'Name is missing.', path: ['name'] },
        { message: 'At most 5.', path: ['priority'] },
      ],
    });
  });
});
