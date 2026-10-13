import { beforeEach, describe, expect, it } from 'vitest';

import { resourceForm } from '@netvark/resource-ui';

import { mountForm, shown } from '../test-support/forms';
import { messages, setLocale } from '../test-support/messages';
import { Contacts } from '../test-support/resources';
import { resourceFormOptions } from './form-options';

const create = resourceForm(Contacts, 'create', {
  messages,
  members: ['name', 'email', 'organization'],
});

/** A JavaScript caller's argument, which the types would refuse. */
const untyped = resourceFormOptions as (model: unknown) => unknown;

beforeEach(() => {
  setLocale('de');
});

describe('resourceFormOptions (resource SPEC 20.5)', () => {
  it("gives a form the model's values to start from, and its validator under revalidateLogic", () => {
    const options = resourceFormOptions(create);
    expect(Object.keys(options)).toEqual([
      'defaultValues',
      'validationLogic',
      'validators',
    ]);
    expect(options.defaultValues).toBe(create.defaultValues);
    expect(options.validators).toEqual({ onDynamic: create.validator });
    expect(options.validationLogic).toBeTypeOf('function');
  });

  it('shows no error before the form is first submitted', () => {
    const { form, field } = mountForm(create);
    field('email').handleChange('keine Adresse');
    field('email').handleBlur();
    field('name').handleChange('Ada');
    field('name').handleChange('');
    field('name').handleBlur();
    expect(shown(field('email'))).toEqual([]);
    expect(shown(field('name'))).toEqual([]);
    expect(form.state.canSubmit).toBe(true);
  });

  it("refuses the first submit with the declaration's issues, each on its field, in the locale of the moment", async () => {
    const { form, field, submitted } = mountForm(create);
    field('email').handleChange('keine Adresse');
    await form.handleSubmit();
    expect(submitted).toEqual([]);
    expect(shown(field('name'))).toEqual(['Name fehlt.']);
    expect(shown(field('email'))).toEqual(['Hat nicht die erwartete Form.']);
    expect(shown(field('organization'))).toEqual(['Organisation fehlt.']);
    expect(form.state.isSubmitSuccessful).toBe(false);
  });

  it('validates on every change after the first submit', async () => {
    const { form, field } = mountForm(create);
    await form.handleSubmit();
    field('name').handleChange('Ada');
    expect(shown(field('name'))).toEqual([]);
    expect(shown(field('organization'))).toEqual(['Organisation fehlt.']);
    setLocale('en');
    field('email').handleChange('no address');
    expect(shown(field('email'))).toEqual(['Does not have the expected form.']);
    expect(shown(field('organization'))).toEqual(['Organization is missing.']);
    field('email').handleChange('ada@example.com');
    expect(shown(field('email'))).toEqual([]);
  });

  it('hands the values of a submit the validator accepts to the handler, and they make the write', async () => {
    const { form, field, submitted } = mountForm(create);
    field('name').handleChange('Ada Lovelace');
    field('organization').handleChange('7');
    await form.handleSubmit();
    expect(submitted).toEqual([
      { name: 'Ada Lovelace', email: '', organization: '7' },
    ]);
    expect(create.write(submitted[0] ?? {})).toEqual({
      attributes: { name: 'Ada Lovelace' },
      relationships: { organization: { type: 'organizations', id: '7' } },
    });
    expect(form.state.isSubmitSuccessful).toBe(true);
  });

  it.each([
    ['the resource', Contacts],
    ['undefined', undefined],
    ['its values alone', { defaultValues: create.defaultValues }],
  ])('refuses %s as the model', (_, model) => {
    expect(() => untyped(model)).toThrow(
      new TypeError(
        'resourceFormOptions: model must be what a resourceForm returned',
      ),
    );
  });
});
