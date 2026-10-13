import { beforeEach, describe, expect, it } from 'vitest';

import { bindResponseErrors } from './bind-errors';
import { mountForm, shown } from './test-support/forms';
import { setLocale } from './test-support/messages';
import {
  taskCreate as create,
  MISSING,
  NO_LABEL,
  refusedOnce,
  TAKEN,
  TITLE_TAKEN,
} from './test-support/refusals';

beforeEach(() => {
  setLocale('de');
});

describe('bindResponseErrors: a refusal of one field (resource SPEC 20.5, ADR 0017)', () => {
  it("sets the server's text as the field's onSubmit error, from the form, and marks the field touched", () => {
    const { form, field } = mountForm(create);
    expect(field('label').state.meta.isTouched).toBe(false);
    expect(bindResponseErrors(form, create, NO_LABEL)).toEqual({
      fields: { label: MISSING },
      form: [],
    });
    const { meta } = field('label').state;
    expect(meta.errorMap.onSubmit).toEqual({ message: MISSING });
    expect(meta.errorSourceMap.onSubmit).toBe('form');
    expect(meta.isTouched).toBe(true);
    expect(shown(field('label'))).toEqual([MISSING]);
    expect(shown(field('title'))).toEqual([]);
  });

  it('keeps the text through changes and blurs of other fields, and blocks a submit until its field changes', async () => {
    const { form, field, submitted, writes } = await refusedOnce(NO_LABEL);
    expect(submitted).toHaveLength(1);
    expect(form.state.isSubmitSuccessful).toBe(true);
    expect(shown(field('label'))).toEqual([MISSING]);
    field('title').handleChange('Plan the release');
    field('title').handleBlur();
    field('points').handleBlur();
    expect(shown(field('label'))).toEqual([MISSING]);
    await form.handleSubmit();
    expect(submitted).toHaveLength(1);
    expect(shown(field('label'))).toEqual([MISSING]);
    field('label').handleChange('EFGH');
    expect(shown(field('label'))).toEqual([]);
    await form.handleSubmit();
    expect(writes).toEqual([
      {
        attributes: { title: 'Plan the launch' },
        relationships: {
          workspace: { type: 'workspaces', id: '1' },
          label: { type: 'labels', id: 'ABCD' },
        },
      },
      {
        attributes: { title: 'Plan the release' },
        relationships: {
          workspace: { type: 'workspaces', id: '1' },
          label: { type: 'labels', id: 'EFGH' },
        },
      },
    ]);
  });

  it('clears the text when its field loses focus, as TanStack Form clears an onSubmit error', () => {
    const { form, field } = mountForm(create);
    bindResponseErrors(form, create, NO_LABEL);
    field('label').handleBlur();
    expect(shown(field('label'))).toEqual([]);
  });

  it('holds the text as the server sent it, whatever the locale after', () => {
    const { form, field } = mountForm(create);
    bindResponseErrors(form, create, NO_LABEL);
    setLocale('en');
    field('title').handleChange('Plan');
    expect(shown(field('label'))).toEqual([MISSING]);
  });
});

describe('bindResponseErrors: a refusal of several fields together (resource SPEC 20.5, ADR 0017)', () => {
  it("sets the text as each field's onServer error, from the form", () => {
    const { form, field } = mountForm(create);
    expect(bindResponseErrors(form, create, TITLE_TAKEN)).toEqual({
      fields: { title: TAKEN, workspace: TAKEN },
      form: [],
    });
    for (const name of ['title', 'workspace']) {
      const { meta } = field(name).state;
      expect(meta.errorMap.onServer).toEqual({ message: TAKEN });
      expect(meta.errorMap.onSubmit).toBeUndefined();
      expect(meta.errorSourceMap.onServer).toBe('form');
      expect(meta.isTouched).toBe(true);
    }
  });

  it('blocks a submit of the same values', async () => {
    const { form, field, submitted } = await refusedOnce(TITLE_TAKEN);
    await form.handleSubmit();
    expect(submitted).toHaveLength(1);
    expect(shown(field('title'))).toEqual([TAKEN]);
    expect(shown(field('workspace'))).toEqual([TAKEN]);
  });

  it.each([
    ['the title changes', 'title', 'Plan the release'],
    ['the workspace changes', 'workspace', '2'],
    ['another field changes', 'points', '3'],
    ['a field loses focus', 'label', undefined],
  ] as const)(
    'clears the text on both fields when %s',
    async (_, name, value) => {
      const { form, field, submitted } = await refusedOnce(TITLE_TAKEN);
      if (value === undefined) {
        field(name).handleBlur();
      } else {
        field(name).handleChange(value);
      }
      expect(shown(field('title'))).toEqual([]);
      expect(shown(field('workspace'))).toEqual([]);
      await form.handleSubmit();
      expect(submitted).toHaveLength(2);
    },
  );
});
