import { beforeEach, describe, expect, it } from 'vitest';

import { bindResponseErrors } from './bind-errors';
import { mountForm, shown } from './test-support/forms';
import { setLocale } from './test-support/messages';
import {
  taskCreate as create,
  MISSING,
  NO_LABEL,
  refused,
  TITLE_TAKEN,
} from './test-support/refusals';
import { Tasks } from './test-support/resources';

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
    bindResponseErrors(form, create, TITLE_TAKEN);
    const own = { message: 'Eigener Fehler.' };
    field('points').setMeta((previous) => ({
      ...previous,
      errorMap: { ...previous.errorMap, onSubmit: own },
    }));
    expect(bindResponseErrors(form, create, NO_LABEL)).toEqual({
      fields: { label: MISSING },
      form: [],
    });
    expect(shown(field('title'))).toEqual([]);
    expect(shown(field('workspace'))).toEqual([]);
    expect(field('label').state.meta.errorMap).toEqual({
      onSubmit: { message: MISSING },
    });
    expect(field('points').state.meta.errorMap.onSubmit).toBe(own);
  });

  it('binds nothing for an error that is no ResponseError, and clears what the binding before set', () => {
    const { form, field } = mountForm(create);
    bindResponseErrors(form, create, NO_LABEL);
    expect(
      bindResponseErrors(form, create, new TypeError('fetch failed')),
    ).toEqual({ fields: {}, form: [] });
    expect(shown(field('label'))).toEqual([]);
  });

  it('gives the form the texts on no held member, and the text of a held member the form has no field for', () => {
    const { form, field } = mountForm(create, {
      rendered: ['title', 'points', 'workspace'],
    });
    const errors = bindResponseErrors(
      form,
      create,
      refused(422, [
        at('/data/attributes/tags', 'Zu viele Schlagwörter.'),
        at('/data/relationships/label', 'Kein Etikett.'),
        at('/data/attributes/points', 'Keine Zahl.'),
      ]),
    );
    expect(errors).toEqual({
      fields: { points: 'Keine Zahl.' },
      form: ['Zu viele Schlagwörter.', 'Kein Etikett.'],
    });
    expect(form.getFieldMeta('label')).toBeUndefined();
    expect(field('points').state.meta.errorMap.onSubmit).toEqual({
      message: 'Keine Zahl.',
    });
    expect(Object.isFrozen(errors)).toBe(true);
    expect(Object.isFrozen(errors.fields)).toBe(true);
    expect(Object.isFrozen(errors.form)).toBe(true);
  });

  it('gives the form each distinct text once', () => {
    const { form } = mountForm(create, { rendered: ['title'] });
    expect(
      bindResponseErrors(
        form,
        create,
        refused(422, [
          at('/data', 'Kein Etikett.'),
          at('/data/relationships/label', 'Kein Etikett.'),
        ]),
      ),
    ).toEqual({ fields: {}, form: ['Kein Etikett.'] });
  });
});

describe('bindResponseErrors: the TypeErrors of a JavaScript caller (resource SPEC 20.1)', () => {
  it.each([
    ['an object', {}],
    ['undefined', undefined],
    ['the model', create],
  ])('refuses %s as the form', (_, form) => {
    expect(() => untyped(form, create, TITLE_TAKEN)).toThrow(
      new TypeError('bindResponseErrors: form must be a TanStack Form FormApi'),
    );
  });

  it.each([
    ['the resource', Tasks],
    ['undefined', undefined],
    ['its errors alone', { errors: create.errors }],
  ])('refuses %s as the model', (_, model) => {
    const { form } = mountForm(create);
    expect(() => untyped(form, model, TITLE_TAKEN)).toThrow(
      new TypeError(
        'bindResponseErrors: model must be what a resourceForm returned',
      ),
    );
  });
});
