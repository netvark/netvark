import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineValidator } from '../codecs/define-validator';
import {
  catalogOf,
  column,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { issuesOf, outputOf } from '../test-support/validation';
import { CONSTRAINT_MESSAGE } from './issue-messages';

const INSTANT = { type: 'timestamptz', sqlType: 'timestamp with time zone' };
const EARLY = '2026-01-05T09:00:00Z';
const LATE = '2026-01-05T10:00:00Z';

let calls = 0;
const ordered = defineValidator({
  schema: z
    .object({ startsAt: z.string(), endsAt: z.string().nullable() })
    .refine(({ startsAt, endsAt }) => {
      calls += 1;
      return endsAt === null || startsAt < endsAt;
    }),
  fixtures: {
    accept: [
      { startsAt: EARLY, endsAt: LATE },
      { startsAt: EARLY, endsAt: null },
    ],
    reject: [{ startsAt: LATE, endsAt: EARLY }],
  },
});

const declare = untypedDeclare(
  catalogOf({
    events: table(
      'events',
      {
        id: column({
          type: 'uuid',
          sqlType: 'uuid',
          nullable: false,
          default: { literal: null },
        }),
        starts_at: column({ ...INSTANT, nullable: false }),
        ends_at: column(INSTANT),
        title: column({ nullable: false }),
      },
      {
        events_order: {
          kind: 'check',
          columns: ['starts_at', 'ends_at'],
          rule: null,
          enforced: true,
        },
      },
    ),
  }),
  { validators: { ordered } },
);

function events(fields: object, code?: string) {
  return declare('events', {
    operations: ['create', 'update'],
    fields,
    rules: { events_order: { validator: 'ordered', code } },
  });
}

const Events = events({
  starts_at: { access: 'readWrite' },
  ends_at: { access: 'readWrite' },
  title: { access: 'readWrite' },
});

const ORDER_ISSUES = [
  { code: 'EVENTS_ORDER', path: ['startsAt'] },
  { code: 'EVENTS_ORDER', path: ['endsAt'] },
];

describe('multi-column validators on the attributes (SPEC 3.5, 6.2)', () => {
  it('runs the validator on the members by public name, once per parse', () => {
    calls = 0;
    expect(
      outputOf(Events.validate.create, {
        startsAt: EARLY,
        endsAt: LATE,
        title: 'Review',
      }),
    ).toEqual({ startsAt: EARLY, endsAt: LATE, title: 'Review' });
    expect(calls).toBe(1);
    expect(
      outputOf(Events.validate.create, {
        startsAt: LATE,
        endsAt: null,
        title: 'Open-ended',
      }),
    ).toEqual({ startsAt: LATE, endsAt: null, title: 'Open-ended' });
  });

  it('raises the constraint code at each member when the validator rejects', () => {
    calls = 0;
    const result = Events.validate.create['~standard'].validate({
      startsAt: LATE,
      endsAt: EARLY,
      title: 'Backwards',
    });
    expect(result.issues).toEqual(
      ORDER_ISSUES.map((issue) => ({ ...issue, message: CONSTRAINT_MESSAGE })),
    );
    expect(calls).toBe(1);
  });

  it('leaves the CHECK to the database when a member is missing or undefined', () => {
    calls = 0;
    expect(
      outputOf(Events.validate.create, { startsAt: LATE, title: 'Later' }),
    ).toEqual({ startsAt: LATE, title: 'Later' });
    expect(
      outputOf(Events.validate.update, { startsAt: LATE, endsAt: undefined }),
    ).toEqual({ startsAt: LATE });
    expect(calls).toBe(0);
  });

  it('does not run when a member has its own issue', () => {
    calls = 0;
    expect(
      issuesOf(Events.validate.create, {
        startsAt: 'tomorrow',
        endsAt: EARLY,
        title: 'Vague',
      }),
    ).toEqual([{ code: 'format', expected: 'date-time', path: ['startsAt'] }]);
    expect(calls).toBe(0);
  });

  it('still runs when another member fails, so every issue is reported', () => {
    expect(
      issuesOf(Events.validate.create, {
        startsAt: LATE,
        endsAt: EARLY,
        title: 5,
        room: 'A',
      }),
    ).toEqual([
      { code: 'type', expected: 'string', path: ['title'] },
      { code: 'additionalProperties', path: ['room'] },
      ...ORDER_ISSUES,
    ]);
  });

  it('runs on update when the update carries every member', () => {
    expect(
      issuesOf(Events.validate.update, { startsAt: LATE, endsAt: EARLY }),
    ).toEqual(ORDER_ISSUES);
  });

  it('carries the code the declaration gives the CHECK', () => {
    const Renamed = events(
      {
        starts_at: { access: 'readWrite' },
        ends_at: { access: 'readWrite' },
      },
      'EVENT_ENDS_BEFORE_START',
    );
    expect(
      issuesOf(Renamed.validate.update, { startsAt: LATE, endsAt: EARLY }),
    ).toEqual([
      { code: 'EVENT_ENDS_BEFORE_START', path: ['startsAt'] },
      { code: 'EVENT_ENDS_BEFORE_START', path: ['endsAt'] },
    ]);
  });

  it('runs only in the schemas that hold every member', () => {
    const Partial = events({
      starts_at: { access: 'immutable' },
      ends_at: { access: 'readWrite' },
    });
    const Hidden = events({ starts_at: { access: 'readWrite' } });
    calls = 0;
    expect(
      outputOf(Partial.validate.create, { startsAt: EARLY, endsAt: LATE }),
    ).toEqual({ startsAt: EARLY, endsAt: LATE });
    expect(calls).toBe(1);
    expect(issuesOf(Partial.validate.update, { endsAt: EARLY })).toEqual([]);
    expect(issuesOf(Hidden.validate.create, { startsAt: LATE })).toEqual([]);
    expect(calls).toBe(1);
  });
});

describe('multi-column CHECKs that share a member', () => {
  const declareShared = untypedDeclare(
    catalogOf({
      spans: table(
        'spans',
        {
          id: column({
            type: 'uuid',
            sqlType: 'uuid',
            nullable: false,
            default: { literal: null },
          }),
          low: column({ type: 'int4', sqlType: 'integer' }),
          mid: column({ type: 'int4', sqlType: 'integer' }),
          high: column({ type: 'int4', sqlType: 'integer' }),
        },
        {
          spans_low_mid: {
            kind: 'check',
            columns: ['low', 'mid'],
            rule: null,
            enforced: true,
          },
          spans_mid_high: {
            kind: 'check',
            columns: ['mid', 'high'],
            rule: null,
            enforced: true,
          },
        },
      ),
    }),
    {
      validators: {
        lowMid: defineValidator({
          schema: z
            .object({ low: z.number(), mid: z.number() })
            .refine(({ low, mid }) => low <= mid),
          fixtures: {
            accept: [{ low: 1, mid: 2 }],
            reject: [{ low: 2, mid: 1 }],
          },
        }),
        midHigh: defineValidator({
          schema: z
            .object({ mid: z.number(), high: z.number() })
            .refine(({ mid, high }) => mid <= high),
          fixtures: {
            accept: [{ mid: 1, high: 2 }],
            reject: [{ mid: 2, high: 1 }],
          },
        }),
      },
    },
  );
  const Spans = declareShared('spans', {
    operations: ['create'],
    fields: {
      low: { access: 'readWrite' },
      mid: { access: 'readWrite' },
      high: { access: 'readWrite' },
    },
    rules: {
      spans_low_mid: { validator: 'lowMid' },
      spans_mid_high: { validator: 'midHigh' },
    },
  });

  it('reports every failing CHECK, though another rejected the shared member', () => {
    expect(
      issuesOf(Spans.validate.create, { low: 3, mid: 2, high: 1 }),
    ).toEqual([
      { code: 'SPANS_LOW_MID', path: ['low'] },
      { code: 'SPANS_LOW_MID', path: ['mid'] },
      { code: 'SPANS_MID_HIGH', path: ['mid'] },
      { code: 'SPANS_MID_HIGH', path: ['high'] },
    ]);
    expect(
      issuesOf(Spans.validate.create, { low: 1, mid: 2, high: 1 }),
    ).toEqual([
      { code: 'SPANS_MID_HIGH', path: ['mid'] },
      { code: 'SPANS_MID_HIGH', path: ['high'] },
    ]);
  });
});
