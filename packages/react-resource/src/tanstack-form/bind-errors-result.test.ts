import { beforeEach, describe, expect, it } from 'vitest';

import {
  contactCreate as create,
  EMAIL_TAKEN,
  MISSING,
  NO_ORGANIZATION,
  refused,
} from '../test-support/contact-refusals';
import { mountForm, shown } from '../test-support/forms';
import { setLocale } from '../test-support/messages';
import { Contacts } from '../test-support/resources';
import { bindResponseErrors } from './bind-errors';

/** A JavaScript caller's arguments, which the types would refuse. */
const untyped = bindResponseErrors as (...args: Array<unknown>) => unknown;

/** A 422's error object on the member `pointer` names. */
function at(pointer: string, detail: string) {
  return { status: '422', detail, source: { pointer } };
}

beforeEach(() => {
  setLocale('de');
});

describe('bindResponseErrors: what it replaces, and what it returns (resource SPEC 20.5)', () => {
  it('replaces the texts the binding before set, and leaves every other error be', () => {
    const { form, field } = mountForm(create);
    bindResponseErrors(form, create, EMAIL_TAKEN);
    const own = { message: 'Eigener Fehler.' };
    field('name').setMeta((previous) => ({
      ...previous,
      errorMap: { ...previous.errorMap, onSubmit: own },
    }));
    expect(bindResponseErrors(form, create, NO_ORGANIZATION)).toEqual({
      fields: { organization: MISSING },
      form: [],
    });
    expect(shown(field('email'))).toEqual([]);
    expect(field('organization').state.meta.errorMap).toEqual({
      onSubmit: { message: MISSING },
    });
    expect(field('name').state.meta.errorMap.onSubmit).toBe(own);
  });

  it('binds nothing for an error that is no ResponseError, and clears what the binding before set', () => {
    const { form, field } = mountForm(create);
    bindResponseErrors(form, create, NO_ORGANIZATION);
    expect(
      bindResponseErrors(form, create, new TypeError('fetch failed')),
    ).toEqual({ fields: {}, form: [] });
    expect(shown(field('organization'))).toEqual([]);
  });

  it('gives the form the texts on no held member, and the text of a held member the form has no field for', () => {
    const { form, field } = mountForm(create, {
      rendered: ['name', 'email', 'organization'],
    });
    const errors = bindResponseErrors(
      form,
      create,
      refused(422, [
        at('/data/attributes/tags', 'Zu viele Schlagwörter.'),
        at('/data/attributes/nickname', 'Spitzname vergeben.'),
        at('/data/attributes/email', 'Keine Adresse.'),
      ]),
    );
    expect(errors).toEqual({
      fields: { email: 'Keine Adresse.' },
      form: ['Zu viele Schlagwörter.', 'Spitzname vergeben.'],
    });
    expect(form.getFieldMeta('nickname')).toBeUndefined();
    expect(field('email').state.meta.errorMap.onSubmit).toEqual({
      message: 'Keine Adresse.',
    });
    expect(Object.isFrozen(errors)).toBe(true);
    expect(Object.isFrozen(errors.fields)).toBe(true);
    expect(Object.isFrozen(errors.form)).toBe(true);
  });

  it('gives the form each distinct text once', () => {
    const { form } = mountForm(create, { rendered: ['name'] });
    expect(
      bindResponseErrors(
        form,
        create,
        refused(422, [
          at('/data', 'Kein Spitzname.'),
          at('/data/attributes/nickname', 'Kein Spitzname.'),
        ]),
      ),
    ).toEqual({ fields: {}, form: ['Kein Spitzname.'] });
  });
});

describe('bindResponseErrors: the TypeErrors of a JavaScript caller (resource SPEC 20.1)', () => {
  it.each([
    ['an object', {}],
    ['undefined', undefined],
    ['the model', create],
  ])('refuses %s as the form', (_, form) => {
    expect(() => untyped(form, create, EMAIL_TAKEN)).toThrow(
      new TypeError('bindResponseErrors: form must be a TanStack Form FormApi'),
    );
  });

  it.each([
    ['the resource', Contacts],
    ['undefined', undefined],
    ['its errors alone', { errors: create.errors }],
  ])('refuses %s as the model', (_, model) => {
    const { form } = mountForm(create);
    expect(() => untyped(form, model, EMAIL_TAKEN)).toThrow(
      new TypeError(
        'bindResponseErrors: model must be what a resourceForm returned',
      ),
    );
  });
});
