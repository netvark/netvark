/**
 * The registries the unit tests declare against: codecs and validators
 * made by `defineCodec` and `defineValidator`, a scope, and a domain rule
 * over the unit-test catalog. Each validator mirrors its CHECK: `email`
 * the `email` domain's `value ~ '^[^@ ]+@[^@ ]+$'` on citext, `room`
 * `room ~ '^(?!x)'`, and `contactOrNotes`
 * `contact_id is not null or notes is not null`, over the public names,
 * the relationship as its id (SPEC 7.2). A CHECK passes `NULL`, so a
 * validator of a nullable column accepts `null`.
 * Not published with the package.
 * @packageDocumentation
 */
import type { ZodType } from 'zod';

import type { Codec, Validator } from '../codecs/types';

import { z } from 'zod';

import { defineCodec } from '../codecs/define-codec';
import { defineValidator } from '../codecs/define-validator';

interface Period {
  readonly start: string;
  readonly end: string;
}

interface ContactOrNotes {
  readonly contact: string | null;
  readonly notes: string | null;
}

/** The registries' types, spelled out because an exported value needs an explicit type (`isolatedDeclarations`). */
interface TestRegistries {
  readonly codecs: {
    readonly range: Codec<readonly ['tstzrange'], ZodType<Period>>;
    readonly phone: Codec<readonly ['text', 'varchar'], ZodType<string>>;
  };
  /** Each schema typed by its input too: the declaration checks a validator's input where it attaches (SPEC 7.2). */
  readonly validators: {
    readonly email: Validator<ZodType<string | null, string | null>>;
    readonly room: Validator<ZodType<string, string>>;
    readonly contactOrNotes: Validator<ZodType<ContactOrNotes, ContactOrNotes>>;
  };
  readonly scopes: {
    readonly organization: { readonly column: 'organization_id' };
  };
  readonly domains: {
    readonly email: { readonly email_check: { readonly validator: 'email' } };
  };
}

const instant = z.iso.datetime({ offset: true });

export const TEST_REGISTRIES: TestRegistries = {
  codecs: {
    range: defineCodec({
      types: ['tstzrange'],
      schema: z.object({ start: instant, end: instant }),
      fixtures: [
        { start: '2026-01-05T09:00:00Z', end: '2026-01-05T10:00:00Z' },
      ],
    }),
    phone: defineCodec({
      types: ['text', 'varchar'],
      schema: z.string().regex(/^\+[1-9][0-9]{6,14}$/u),
      fixtures: ['+493012345678'],
      description: 'A phone number in E.164 form.',
    }),
  },
  validators: {
    email: defineValidator({
      schema: z
        .string()
        .regex(/^[^@ ]+@[^@ ]+$/u)
        .nullable(),
      fixtures: {
        accept: ['ada@example.com', null],
        reject: ['ada.example.com', 'ada @example.com'],
      },
    }),
    room: defineValidator({
      schema: z.string().regex(/^(?!x)/u),
      fixtures: { accept: ['a-12', ''], reject: ['x-12'] },
    }),
    contactOrNotes: defineValidator({
      schema: z
        .object({
          contact: z.string().nullable(),
          notes: z.string().nullable(),
        })
        .refine(({ contact, notes }) => contact !== null || notes !== null),
      fixtures: {
        accept: [
          { contact: '7c1b0c6e-2a4b-4d0b-9f3a-1e2d3c4b5a69', notes: null },
          { contact: null, notes: 'Lobby' },
        ],
        reject: [{ contact: null, notes: null }],
      },
    }),
  },
  scopes: { organization: { column: 'organization_id' } },
  domains: { email: { email_check: { validator: 'email' } } },
};
