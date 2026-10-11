import { describe, expect, it } from 'vitest';

import { Contacts, Organizations } from '../test-support/definition-resources';
import {
  declareApplication,
  generateApplication,
} from '../test-support/generated/application';
import { parseSurface } from './parse-surface';
import { SURFACE_FORMAT, surfaceOf } from './surface';

/**
 * `parseSurface` (SPEC 13.2): every surface `surfaceOf` writes reads back
 * through JSON unchanged, and a value that is not one fails at the path of
 * its first problem.
 */

const GENERATED_SEEDS = 40;

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };

const BASE = surfaceOf([Organizations, Contacts]);

/** The base surface as JSON would give it back, with one edit. */
function edited(edit: (surface: Mutable<typeof BASE>) => void): unknown {
  const copy = JSON.parse(JSON.stringify(BASE)) as Mutable<typeof BASE>;
  edit(copy);
  return copy;
}

const contacts = (surface: Mutable<typeof BASE>) =>
  surface.resources['contacts']!;

/** The message `parseSurface` refuses `value` with. */
function refusal(value: unknown): string {
  try {
    parseSurface(value);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return 'accepted';
}

describe('parseSurface', () => {
  it('reads a surface back from its JSON unchanged', () => {
    expect(parseSurface(JSON.parse(JSON.stringify(BASE)))).toEqual(BASE);
  });

  it('reads back the surface of every generated catalog', () => {
    for (let seed = 1; seed <= GENERATED_SEEDS; seed += 1) {
      const resources = [
        ...declareApplication(generateApplication(seed)).values(),
      ];
      const surface = surfaceOf(resources);
      expect(parseSurface(JSON.parse(JSON.stringify(surface)))).toEqual(
        surface,
      );
    }
  });

  it('refuses a snapshot of another format, or none', () => {
    expect(() => parseSurface({ format: 2, resources: {} })).toThrow(
      new TypeError(
        `parseSurface.format: format 2 is not supported (expected ${String(SURFACE_FORMAT)})`,
      ),
    );
    expect(() => parseSurface({ resources: {} })).toThrow(
      /^parseSurface\.format: /u,
    );
    expect(() => parseSurface(null)).toThrow(/^parseSurface: /u);
    expect(() => parseSurface([])).toThrow(/^parseSurface: /u);
  });

  it('names the first member that is missing, unknown, or of the wrong kind', () => {
    const cases: ReadonlyArray<readonly [unknown, string]> = [
      [
        edited((surface) => {
          Reflect.deleteProperty(contacts(surface), 'codes');
        }),
        'parseSurface.resources.contacts.codes: ',
      ],
      [
        edited((surface) => {
          Reflect.set(contacts(surface), 'extra', true);
        }),
        'parseSurface.resources.contacts: ',
      ],
      [
        edited((surface) => {
          Reflect.set(contacts(surface).fields['email']!, 'nullable', 'no');
        }),
        'parseSurface.resources.contacts.fields.email.nullable: ',
      ],
      [
        edited((surface) => {
          contacts(surface).operations.push('delete' as never);
        }),
        'parseSurface.resources.contacts.operations.4: ',
      ],
      [
        edited((surface) => {
          contacts(surface).relationships['organization']!.access = 'write';
        }),
        'parseSurface.resources.contacts.relationships.organization.access: ',
      ],
      [
        edited((surface) => {
          contacts(surface).relationships['organization']!.operators.push('gt');
        }),
        'parseSurface.resources.contacts.relationships.organization.operators.',
      ],
      [
        edited((surface) => {
          contacts(surface).fields['email']!.limits.maxLength = -1;
        }),
        'parseSurface.resources.contacts.fields.email.limits.maxLength: ',
      ],
      [
        edited((surface) => {
          contacts(surface).codes['CONTACTS_EMAIL_UNIQUE'] = 409.5;
        }),
        'parseSurface.resources.contacts.codes.CONTACTS_EMAIL_UNIQUE: ',
      ],
      [
        edited((surface) => {
          Reflect.set(contacts(surface).fields['email']!, 'wire', 'text');
        }),
        'parseSurface.resources.contacts.fields.email.wire: ',
      ],
    ];
    for (const [value, prefix] of cases) {
      expect(() => parseSurface(value)).toThrow(TypeError);
      expect(refusal(value).startsWith(prefix)).toBe(true);
    }
  });
});
