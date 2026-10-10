import { describe, expect, it } from 'vitest';

import {
  catalogOf,
  column,
  domain,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { issuesOf, outputOf } from '../test-support/validation';

const NOT_NULL_RULE = { kind: 'check', rule: { kind: 'notNull' } } as const;

const declare = untypedDeclare(
  catalogOf(
    {
      things: table(
        'things',
        {
          id: column({
            type: 'uuid',
            sqlType: 'uuid',
            nullable: false,
            default: { literal: null },
          }),
          plain: column({ nullable: false }),
          defaulted: column({ nullable: false, default: { literal: 'x' } }),
          optional: column(),
          checked: column(),
          strict: column({ type: 'strict_text', typeKind: 'domain' }),
          noted: column({ type: 'noted_text', typeKind: 'domain' }),
          nested: column({ type: 'outer_text', typeKind: 'domain' }),
          domain_default: column({
            type: 'defaulted_text',
            typeKind: 'domain',
            nullable: false,
          }),
          nested_default: column({
            type: 'outer_default',
            typeKind: 'domain',
            nullable: false,
          }),
          numbered: column({
            type: 'int8',
            nullable: false,
            identity: 'byDefault',
          }),
          strict_list: column({
            type: 'strict_text',
            typeKind: 'domain',
            array: true,
          }),
        },
        {
          things_checked_check: {
            kind: 'check',
            columns: ['checked'],
            rule: { kind: 'notNull' },
          },
        },
      ),
    },
    {
      strict_text: domain('strict_text', { nullable: false }),
      noted_text: domain('noted_text', {
        constraints: { noted_text_check: NOT_NULL_RULE },
      }),
      outer_text: domain('outer_text', {
        type: 'strict_text',
        typeKind: 'domain',
      }),
      defaulted_text: domain('defaulted_text', { default: { literal: 'x' } }),
      outer_default: domain('outer_default', {
        type: 'defaulted_text',
        typeKind: 'domain',
      }),
    },
  ),
);

const Things = declare('things', {
  operations: ['create', 'update'],
  fields: {
    plain: { access: 'readWrite' },
    defaulted: { access: 'readWrite' },
    optional: { access: 'readWrite' },
    checked: { access: 'readWrite' },
    strict: { access: 'readWrite' },
    noted: { access: 'readWrite' },
    nested: { access: 'readWrite' },
    domain_default: { access: 'readWrite' },
    nested_default: { access: 'readWrite' },
    numbered: { access: 'immutable' },
    strict_list: { access: 'readWrite' },
  },
});

describe('required on insert (SPEC 6.3)', () => {
  it('requires an effectively NOT NULL column without a default, identity, or generation', () => {
    expect(issuesOf(Things.validate.create, {})).toEqual([
      { code: 'required', path: ['plain'] },
      { code: 'required', path: ['checked'] },
      { code: 'required', path: ['strict'] },
      { code: 'required', path: ['noted'] },
      { code: 'required', path: ['nested'] },
    ]);
  });

  it('takes an omitted default, domain default, identity, or nullable column', () => {
    const create = {
      plain: 'a',
      checked: 'b',
      strict: 'c',
      noted: 'd',
      nested: 'e',
    };
    expect(outputOf(Things.validate.create, create)).toEqual(create);
  });

  it('refuses null where a notNull rule, a NOT NULL domain, or a base domain forbids it (SPEC 6.1 step 4)', () => {
    expect(
      issuesOf(Things.validate.update, {
        optional: null,
        checked: null,
        strict: null,
        noted: null,
        nested: null,
        domainDefault: null,
      }),
    ).toEqual([
      { code: 'required', path: ['checked'] },
      { code: 'required', path: ['strict'] },
      { code: 'required', path: ['noted'] },
      { code: 'required', path: ['nested'] },
      { code: 'required', path: ['domainDefault'] },
    ]);
  });

  it('ignores the NOT NULL of an array element domain for the column, refusing null elements as any array does', () => {
    expect(outputOf(Things.validate.update, { strictList: null })).toEqual({
      strictList: null,
    });
    expect(issuesOf(Things.validate.update, { strictList: [null] })).toEqual([
      { code: 'type', expected: 'string', path: ['strictList', 0] },
    ]);
  });
});
