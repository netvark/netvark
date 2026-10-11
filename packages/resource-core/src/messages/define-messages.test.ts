import { describe, expect, it } from 'vitest';

import {
  Contacts,
  declare,
  Meetings,
  Organizations,
} from '../test-support/registry';
import { defaultMessages } from './default-messages';
import { defineMessages } from './define-messages';
import { localizeErrors } from './localize-errors';

const Tagged = declare('contacts', {
  operations: ['get', 'create'],
  scope: 'organization',
  fields: { name: { access: 'readWrite' }, kind: { access: 'readWrite' } },
  relationships: {
    organization_id: { target: () => Organizations, access: 'read' },
  },
});

const RESOURCES = [Organizations, Contacts, Meetings];
const TAGGED = [Organizations, Tagged];
const english: any = defaultMessages(RESOURCES);
const tagged: any = defaultMessages(TAGGED);

/** A copy of `record` without `key`. */
function without(record: object, key: string): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([name]) => name !== key),
  );
}

function problems(messages: unknown, resources = RESOURCES): Array<string> {
  try {
    defineMessages(resources, {}, messages as never);
  } catch (error) {
    if (error instanceof TypeError) {
      return error.message.split('; ');
    }
    throw error;
  }
  return [];
}

describe('defineMessages (SPEC 10.1)', () => {
  it('returns a frozen copy that keeps every function', () => {
    const input = { ...english, errors: { ...english.errors } };
    const messages: any = defineMessages(RESOURCES, {}, input);
    expect(messages).not.toBe(input);
    expect(messages).toStrictEqual(input);
    expect(Object.isFrozen(messages)).toBe(true);
    expect(Object.isFrozen(messages.errors.NOT_FOUND)).toBe(true);
    expect(Object.isFrozen(messages.fields.contacts)).toBe(true);
    expect(messages.errors.NOT_FOUND.title).toBe(
      english.errors.NOT_FOUND.title,
    );
    input.errors.NOT_FOUND = 'replaced';
    expect(messages.errors.NOT_FOUND.title()).toBe('Not Found');
  });

  it('is known to localizeErrors, and a spread of it is not', () => {
    const messages = defineMessages(RESOURCES, {}, english);
    expect(() => localizeErrors(messages)).not.toThrow();
    expect(() => localizeErrors({ ...messages })).toThrow(
      new TypeError(
        'localizeErrors: messages must be what defineMessages or defaultMessages returned',
      ),
    );
  });

  it('names every missing key at once', () => {
    const messages = {
      ...tagged,
      errors: without(tagged.errors, 'NOT_FOUND'),
      constraints: without(tagged.constraints, 'check'),
      validation: without(tagged.validation, 'pattern'),
      fields: {
        ...tagged.fields,
        contacts: without(tagged.fields.contacts, 'kind'),
      },
      options: {
        contacts: { kind: without(tagged.options.contacts.kind, 'company') },
      },
    };
    expect(problems(messages, TAGGED)).toStrictEqual([
      'defineMessages.messages.errors.NOT_FOUND: missing',
      'defineMessages.messages.constraints.check: missing',
      'defineMessages.messages.validation.pattern: missing',
      'defineMessages.messages.fields.contacts.kind: missing',
      'defineMessages.messages.options.contacts.kind.company: missing',
    ]);
  });

  it('refuses every key the resources and codes do not have', () => {
    const text = english.errors.NOT_FOUND;
    const label = english.fields.contacts.name;
    const messages = {
      ...tagged,
      locale: 'de',
      errors: { ...tagged.errors, TYPO: text },
      constraints: { ...tagged.constraints, exclusion: text },
      validation: { ...tagged.validation, fuzzy: label },
      fields: {
        ...tagged.fields,
        ghosts: {},
        contacts: { ...tagged.fields.contacts, ghost: label },
      },
      options: {
        contacts: {
          name: {},
          kind: { ...tagged.options.contacts.kind, robot: label },
        },
      },
    };
    expect(problems(messages, TAGGED)).toStrictEqual([
      'defineMessages.messages.locale: not a key these messages take',
      'defineMessages.messages.errors.TYPO: not a key these messages take',
      'defineMessages.messages.constraints.exclusion: not a key these messages take',
      'defineMessages.messages.validation.fuzzy: not a key these messages take',
      'defineMessages.messages.fields.ghosts: not a key these messages take',
      'defineMessages.messages.fields.contacts.ghost: not a key these messages take',
      'defineMessages.messages.options.contacts.name: not a key these messages take',
      'defineMessages.messages.options.contacts.kind.robot: not a key these messages take',
    ]);
  });

  it('refuses a message or label that is not a function, as a template string would be', () => {
    const messages = {
      ...english,
      errors: {
        ...english.errors,
        NOT_FOUND: {
          title: 'Nicht gefunden',
          detail: english.errors.NOT_FOUND.detail,
        },
        CONFLICT: { title: english.errors.CONFLICT.title },
        FORBIDDEN: 'Verboten',
      },
      validation: { ...english.validation, minLength: 'Mindestens {limit}.' },
      fields: {
        ...english.fields,
        contacts: { ...english.fields.contacts, name: 7 },
      },
    };
    expect(problems(messages)).toStrictEqual([
      'defineMessages.messages.errors.FORBIDDEN: must be an object, received "Verboten"',
      'defineMessages.messages.errors.NOT_FOUND.title: must be a function, received "Nicht gefunden"',
      'defineMessages.messages.errors.CONFLICT.detail: missing',
      'defineMessages.messages.validation.minLength: must be a function, received "Mindestens {limit}."',
      'defineMessages.messages.fields.contacts.name: must be a function, received 7',
    ]);
  });

  it('accepts texts for derived codes and for the other built-in codes', () => {
    const own = english.errors.CONFLICT;
    const messages = {
      ...english,
      errors: {
        ...english.errors,
        CONTACTS_EMAIL_UNIQUE: own,
        TOO_MANY_REQUESTS: own,
      },
    };
    expect(problems(messages)).toStrictEqual([]);
  });

  it('refuses messages and sections that are not objects', () => {
    expect(problems(null)).toStrictEqual([
      'defineMessages.messages: must be an object, received null',
    ]);
    expect(problems({ ...english, fields: [] })).toStrictEqual([
      'defineMessages.messages.fields: must be an object, received []',
    ]);
    expect(problems({ ...english, errors: 'Fehler' })).toStrictEqual([
      'defineMessages.messages.errors: must be an object, received "Fehler"',
    ]);
  });

  it('runs the registry checks first, as errorCatalog does', () => {
    expect(() => defineMessages([Contacts], {}, english)).toThrow(
      /^defineMessages: relationship contacts\.organization targets organizations, which is not listed/u,
    );
  });
});
