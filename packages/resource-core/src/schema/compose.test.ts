/**
 * The order of SPEC 6.1: the wire form or a codec, the domains' rules, the
 * column's rules, `.nullable()`, then the validators. `issues.test.ts`
 * pins each rule's issue; this file pins where each rule comes from and
 * how the steps combine.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineCodec } from '../codecs/define-codec';
import {
  catalogOf,
  column,
  domain,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { TEST_REGISTRIES } from '../test-support/definer';
import { issuesOf, outputOf } from '../test-support/validation';

const NUMERIC = { type: 'numeric', sqlType: 'numeric(5,2)', precision: 5 };
const tag = defineCodec({
  types: ['code_text'],
  schema: z.string().regex(/^#/u),
  fixtures: ['#launch'],
});

const declare = untypedDeclare(
  catalogOf(
    {
      items: table(
        'items',
        {
          id: column({ type: 'uuid', sqlType: 'uuid', nullable: false }),
          code: column({ type: 'short_code', typeKind: 'domain' }),
          state: column({ type: 'state_text', typeKind: 'domain' }),
          share: column({ type: 'percent', typeKind: 'domain' }),
          label: column(),
          phone: column(),
          tag: column({ type: 'code_text', typeKind: 'domain' }),
          room: column(),
        },
        {
          items_state_check: {
            kind: 'check',
            columns: ['state'],
            rule: { kind: 'enum', values: ['open', 'closed', 'lost'] },
            enforced: true,
          },
          items_share_check: {
            kind: 'check',
            columns: ['share'],
            rule: {
              kind: 'range',
              min: { value: '0', inclusive: false },
              max: { value: '50', inclusive: true },
            },
            enforced: true,
          },
          items_label_check: {
            kind: 'check',
            columns: ['label'],
            rule: { kind: 'length', min: 2, max: 3 },
            enforced: true,
          },
          items_phone_check: {
            kind: 'check',
            columns: ['phone'],
            rule: { kind: 'length', min: null, max: 3 },
            enforced: true,
          },
          items_room_length: {
            kind: 'check',
            columns: ['room'],
            rule: { kind: 'length', min: null, max: 3 },
            enforced: true,
          },
          items_room_check: {
            kind: 'check',
            columns: ['room'],
            rule: null,
            enforced: true,
          },
        },
      ),
    },
    {
      code_text: domain('code_text', {
        constraints: {
          code_text_check: {
            kind: 'check',
            rule: { kind: 'pattern', source: '^[A-Z]+$', flags: 'su' },
          },
        },
      }),
      short_code: domain('short_code', {
        type: 'code_text',
        typeKind: 'domain',
        constraints: {
          short_code_check: {
            kind: 'check',
            rule: { kind: 'length', min: 2, max: 3 },
          },
        },
      }),
      state_text: domain('state_text', {
        constraints: {
          state_text_check: {
            kind: 'check',
            rule: { kind: 'enum', values: ['open', 'closed', 'held'] },
          },
        },
      }),
      percent: domain('percent', {
        ...NUMERIC,
        scale: 2,
        constraints: {
          percent_check: {
            kind: 'check',
            rule: {
              kind: 'range',
              min: { value: '0', inclusive: true },
              max: { value: '100', inclusive: true },
            },
          },
        },
      }),
    },
  ),
  {
    codecs: { ...TEST_REGISTRIES.codecs, tag },
    validators: TEST_REGISTRIES.validators,
  },
);

const Items = declare('items', {
  operations: ['update'],
  fields: {
    code: { access: 'readWrite' },
    state: { access: 'readWrite' },
    share: { access: 'readWrite' },
    label: { access: 'readWrite' },
    phone: { access: 'readWrite', codec: 'phone' },
    tag: { access: 'readWrite', codec: 'tag' },
    room: { access: 'readWrite' },
  },
  rules: { items_room_check: { validator: 'room' } },
});

const issues = (value: object) => issuesOf(Items.validate.update, value);

describe('composing a field value (SPEC 6.1)', () => {
  it('folds the rules of a domain and of each base domain (step 2)', () => {
    expect(outputOf(Items.validate.update, { code: 'AB' })).toEqual({
      code: 'AB',
    });
    expect(issues({ code: 'ab' })).toEqual([
      { code: 'pattern', expected: '^[A-Z]+$', path: ['code'] },
    ]);
    expect(issues({ code: 'A' })).toEqual([
      { code: 'minLength', expected: '2', path: ['code'] },
    ]);
    expect(issues({ code: 'abcd' })).toEqual([
      { code: 'maxLength', expected: '3', path: ['code'] },
      { code: 'pattern', expected: '^[A-Z]+$', path: ['code'] },
    ]);
  });

  it("narrows a domain's rules with the column's: enum values intersect, the tighter bound wins (step 3)", () => {
    expect(issues({ state: 'held' })).toEqual([
      { code: 'enum', expected: '["open","closed"]', path: ['state'] },
    ]);
    expect(issues({ state: 'lost' })).toEqual([
      { code: 'enum', expected: '["open","closed"]', path: ['state'] },
    ]);
    expect(issues({ share: '0' })).toEqual([
      { code: 'exclusiveMinimum', expected: '0', path: ['share'] },
    ]);
    expect(outputOf(Items.validate.update, { share: '50' })).toEqual({
      share: '50',
    });
    expect(issues({ share: '100' })).toEqual([
      { code: 'maximum', expected: '50', path: ['share'] },
    ]);
  });

  it('applies every rule but notNull to non-null values only (step 4)', () => {
    expect(
      outputOf(Items.validate.update, { label: null, code: null, share: null }),
    ).toEqual({ label: null, code: null, share: null });
    expect(issues({ label: 'a' })).toEqual([
      { code: 'minLength', expected: '2', path: ['label'] },
    ]);
  });

  it("takes a codec's schema in place of the wire form and every rule (step 1)", () => {
    expect(outputOf(Items.validate.update, { phone: '+493012345678' })).toEqual(
      { phone: '+493012345678' },
    );
    expect(outputOf(Items.validate.update, { tag: '#launch' })).toEqual({
      tag: '#launch',
    });
    expect(issues({ tag: 'LAUNCH' })).toEqual([
      { code: 'format', expected: 'tag', path: ['tag'] },
    ]);
  });

  it('runs a validator last, on every value the steps before it accepted, null included (step 5)', () => {
    expect(issues({ room: 'x-1' })).toEqual([
      { code: 'ITEMS_ROOM_CHECK', path: ['room'] },
    ]);
    expect(issues({ room: 'x-123' })).toEqual([
      { code: 'maxLength', expected: '3', path: ['room'] },
    ]);
    // `room` refuses null, which a nullable column passes it; `tsc` refuses this attachment (SPEC 7.2).
    expect(issues({ room: null })).toEqual([
      { code: 'ITEMS_ROOM_CHECK', path: ['room'] },
    ]);
  });
});
