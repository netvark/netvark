import type { DomainEvent } from './event';

import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { defineEvent } from './event';

const ContactCreated = defineEvent(
  'contact.created',
  1,
  z.object({ id: z.uuid(), name: z.string().trim() }),
);
const ID = '00000000-0000-4000-8000-000000000001';

describe('defineEvent (SPEC 12.7)', () => {
  it('makes a frozen event of a valid payload, with the schema output', () => {
    const event = ContactCreated.of({ id: ID, name: ' Ada ' });
    expect(event).toEqual({
      name: 'contact.created',
      version: 1,
      payload: { id: ID, name: 'Ada' },
    });
    expect(Object.isFrozen(event)).toBe(true);
    expectTypeOf(event).toEqualTypeOf<
      DomainEvent<'contact.created', 1, { id: string; name: string }>
    >();
    expect([ContactCreated.name, ContactCreated.version]).toEqual([
      'contact.created',
      1,
    ]);
  });

  it('refuses a payload the schema refuses, with the issues as the cause and no value in the message', () => {
    const secret = 'not-a-uuid-1234';
    let caught: unknown;
    try {
      // @ts-expect-error the name is missing
      ContactCreated.of({ id: secret });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TypeError);
    const error = caught as TypeError;
    expect(error.message).toBe(
      "contact.created v1: the payload does not match the event's schema",
    );
    expect(error.message).not.toContain(secret);
    expect(error.cause).toHaveLength(2);
  });

  it('refuses a schema that validates asynchronously', () => {
    const Audited = defineEvent(
      'contact.audited',
      2,
      z.object({ id: z.string() }).refine(async () => {
        await Promise.resolve();
        return true;
      }),
    );
    expect(() => Audited.of({ id: ID })).toThrow(
      new TypeError(
        'contact.audited v2: of() needs a schema that validates synchronously',
      ),
    );
  });

  it.each([
    [
      ['', 1, z.object({})],
      'defineEvent: the name must be letters and digits in segments joined by ".", "_", or "-"',
    ],
    [
      ['contact created', 1, z.object({})],
      'defineEvent: the name must be letters and digits in segments joined by ".", "_", or "-"',
    ],
    [
      ['contact.created', 0, z.object({})],
      'defineEvent: contact.created: the version must be a positive integer',
    ],
    [
      ['contact.created', 1.5, z.object({})],
      'defineEvent: contact.created: the version must be a positive integer',
    ],
    [
      ['contact.created', 1, {}],
      'defineEvent: contact.created: the schema must be a Standard Schema',
    ],
  ])('refuses the JavaScript arguments %#', (args, message) => {
    expect(() => Reflect.apply(defineEvent, undefined, args)).toThrow(
      new TypeError(message),
    );
  });
});
