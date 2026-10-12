import { beforeEach, describe, expect, it } from 'vitest';

import {
  contactCreate as create,
  EMAIL_TAKEN,
  MISSING,
  NO_ORGANIZATION,
  refusedOnce,
  TAKEN,
} from '../test-support/contact-refusals';
import { mountForm, shown } from '../test-support/forms';
import { setLocale } from '../test-support/messages';
import { bindResponseErrors } from './bind-errors';

beforeEach(() => {
  setLocale('de');
});

describe('bindResponseErrors: a refusal of one field (resource SPEC 20.5, ADR 0017)', () => {
  it("sets the server's text as the field's onSubmit error, from the form, and marks the field touched", () => {
    const { form, field } = mountForm(create);
    expect(field('organization').state.meta.isTouched).toBe(false);
    expect(bindResponseErrors(form, create, NO_ORGANIZATION)).toEqual({
      fields: { organization: MISSING },
      form: [],
    });
    const { meta } = field('organization').state;
    expect(meta.errorMap.onSubmit).toEqual({ message: MISSING });
    expect(meta.errorSourceMap.onSubmit).toBe('form');
    expect(meta.isTouched).toBe(true);
    expect(shown(field('organization'))).toEqual([MISSING]);
    expect(shown(field('name'))).toEqual([]);
  });

  it('keeps the text through changes and blurs of other fields, and blocks a submit until its field changes', async () => {
    const { form, field, submitted, writes } =
      await refusedOnce(NO_ORGANIZATION);
    expect(submitted).toHaveLength(1);
    expect(form.state.isSubmitSuccessful).toBe(true);
    expect(shown(field('organization'))).toEqual([MISSING]);
    field('name').handleChange('Ada King');
    field('name').handleBlur();
    field('email').handleBlur();
    expect(shown(field('organization'))).toEqual([MISSING]);
    await form.handleSubmit();
    expect(submitted).toHaveLength(1);
    expect(shown(field('organization'))).toEqual([MISSING]);
    field('organization').handleChange('8');
    expect(shown(field('organization'))).toEqual([]);
    await form.handleSubmit();
    expect(writes).toEqual([
      {
        attributes: { name: 'Ada Lovelace', email: 'ada@example.com' },
        relationships: { organization: { type: 'organizations', id: '7' } },
      },
      {
        attributes: { name: 'Ada King', email: 'ada@example.com' },
        relationships: { organization: { type: 'organizations', id: '8' } },
      },
    ]);
  });

  it('clears the text when its field loses focus, as TanStack Form clears an onSubmit error', () => {
    const { form, field } = mountForm(create);
    bindResponseErrors(form, create, NO_ORGANIZATION);
    field('organization').handleBlur();
    expect(shown(field('organization'))).toEqual([]);
  });

  it('holds the text as the server sent it, whatever the locale after', () => {
    const { form, field } = mountForm(create);
    bindResponseErrors(form, create, NO_ORGANIZATION);
    setLocale('en');
    field('name').handleChange('Ada');
    expect(shown(field('organization'))).toEqual([MISSING]);
  });
});

describe('bindResponseErrors: a refusal of several fields together (resource SPEC 20.5, ADR 0017)', () => {
  it("sets the text as each field's onServer error, from the form", () => {
    const { form, field } = mountForm(create);
    expect(bindResponseErrors(form, create, EMAIL_TAKEN)).toEqual({
      fields: { email: TAKEN, organization: TAKEN },
      form: [],
    });
    for (const name of ['email', 'organization']) {
      const { meta } = field(name).state;
      expect(meta.errorMap.onServer).toEqual({ message: TAKEN });
      expect(meta.errorMap.onSubmit).toBeUndefined();
      expect(meta.errorSourceMap.onServer).toBe('form');
      expect(meta.isTouched).toBe(true);
    }
  });

  it('blocks a submit of the same values', async () => {
    const { form, field, submitted } = await refusedOnce(EMAIL_TAKEN);
    await form.handleSubmit();
    expect(submitted).toHaveLength(1);
    expect(shown(field('email'))).toEqual([TAKEN]);
    expect(shown(field('organization'))).toEqual([TAKEN]);
  });

  it.each([
    ['the email changes', 'email', 'ada.king@example.com'],
    ['the organization changes', 'organization', '8'],
    ['another field changes', 'nickname', 'Ada'],
    ['a field loses focus', 'name', undefined],
  ] as const)(
    'clears the text on both fields when %s',
    async (_, name, value) => {
      const { form, field, submitted } = await refusedOnce(EMAIL_TAKEN);
      if (value === undefined) {
        field(name).handleBlur();
      } else {
        field(name).handleChange(value);
      }
      expect(shown(field('email'))).toEqual([]);
      expect(shown(field('organization'))).toEqual([]);
      await form.handleSubmit();
      expect(submitted).toHaveLength(2);
    },
  );
});
