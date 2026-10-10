/**
 * Boundary fixtures of `uuid`, `date`, `timestamp(p)`, `timestamptz(p)`,
 * `bool`, and `json`/`jsonb` (SPEC 5.1, 5.2): the date limits, leap days,
 * a seventh fraction digit and one past p, zeros past p, leap seconds and
 * `24:00`, offsets PostgreSQL drops or refuses, spellings it reads but the
 * wire form refuses, and U+0000 and unpaired surrogates inside JSON.
 * @ref https://www.postgresql.org/docs/18/datatype-datetime.html
 * @ref https://www.postgresql.org/docs/18/datatype-uuid.html
 * @ref https://www.postgresql.org/docs/18/datatype-json.html
 * @packageDocumentation
 */
import type { ValueForm } from '../schema/value-form';
import type { BoundaryFixture } from './fixture';

import { fixture } from './fixture';

type StringForm = Extract<ValueForm, { readonly kind: 'string' }>;

const UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const UUIDS: ReadonlyArray<BoundaryFixture> = [
  fixture(UUID, 'lower case'),
  fixture(UUID.toUpperCase(), 'upper case'),
  fixture('00000000-0000-0000-0000-000000000000', 'all zeros'),
  fixture('ffffffff-ffff-ffff-ffff-ffffffffffff', 'all ones'),
  fixture(`{${UUID}}`, 'braces'),
  fixture(UUID.replaceAll('-', ''), 'no hyphens'),
  fixture(UUID.slice(0, -1), 'one digit short'),
];

const DATES: ReadonlyArray<BoundaryFixture> = [
  fixture('0001-01-01', 'the first day'),
  fixture('9999-12-31', 'the last day'),
  fixture('0000-01-01', 'year zero'),
  fixture('10000-01-01', 'past year 9999'),
  fixture('2024-02-29', 'a leap day'),
  fixture('2100-02-29', 'no leap day in 2100'),
  fixture('2024-13-01', 'month 13'),
  fixture('2024-1-5', 'one-digit month and day'),
  fixture('infinity', 'infinity'),
];

const TIMESTAMPS: ReadonlyArray<BoundaryFixture> = [
  fixture('0001-01-01T00:00:00', 'the first instant'),
  fixture('9999-12-31T23:59:59.999999', 'the last microsecond'),
  fixture('9999-12-31T23:59:59.9999995', 'rounds into year 10000'),
  fixture('2024-02-29T12:00:00.1234567', 'a seventh fraction digit'),
  fixture('2024-02-29t12:00:00', 'lower-case t'),
  fixture('2024-02-29T12:00', 'no seconds'),
  fixture('2024-02-29T23:59:60', 'a leap second'),
  fixture('2024-02-29T24:00:00', 'hour 24'),
  fixture('2024-02-29 12:00:00', 'a space for T'),
];

const DIGITS = '1234567';
const ZEROS = '000000';
const NINES = '999999';

function fraction(digits: string): string {
  return digits === '' ? '' : `.${digits}`;
}

/**
 * The fixtures of a column keeping `digits` fraction digits: that many, one
 * more, which PostgreSQL rounds, zeros up to six digits, which keep the
 * instant, and the last instant. At six they meet the fixed fixtures.
 */
function precisionFixtures(digits: number): ReadonlyArray<BoundaryFixture> {
  const limit = `fraction digits ${String(digits)}`;
  const kept = DIGITS.slice(0, digits);
  return [
    fixture(`2024-02-29T12:00:00${fraction(kept)}`, limit),
    fixture(
      `2024-02-29T12:00:00${fraction(DIGITS.slice(0, digits + 1))}`,
      `${limit}, plus one`,
    ),
    fixture(
      `2024-02-29T12:00:00.${kept}${ZEROS.slice(digits)}`,
      `${limit}, zeros past it`,
    ),
    fixture(
      `9999-12-31T23:59:59${fraction(NINES.slice(0, digits))}`,
      `${limit}, the last instant`,
    ),
  ];
}

function offsetFree(digits: number): ReadonlyArray<BoundaryFixture> {
  return [
    ...TIMESTAMPS,
    ...precisionFixtures(digits),
    fixture('2020-01-01T06:15:00+02:00', 'an offset, which timestamp drops'),
    fixture('2020-01-01T06:15:00Z', 'Z, which timestamp drops'),
  ];
}

const ZONES: ReadonlyArray<BoundaryFixture> = [
  fixture('2024-02-29T12:00:00z', 'lower-case z'),
  fixture('2024-02-29T12:00:00', 'no offset'),
  fixture('2024-02-29T12:00:00+15:59', 'the largest offset'),
  fixture('2024-02-29T12:00:00+16:00', 'past the largest offset'),
  fixture('2024-02-29T12:00:00-15:59', 'the smallest offset'),
  fixture('0001-01-01T00:00:00+01:00', 'before year 0001 in UTC'),
  fixture('9999-12-31T23:00:00-01:00', 'past year 9999 in UTC'),
];

function zoned(digits: number): ReadonlyArray<BoundaryFixture> {
  return [
    ...[...TIMESTAMPS, ...precisionFixtures(digits)].map(({ value, label }) =>
      fixture(`${String(value)}Z`, label),
    ),
    ...ZONES,
  ];
}

/** The fixtures of `bool`. */
export const BOOLEAN_FIXTURES: ReadonlyArray<BoundaryFixture> = [
  fixture(true, 'true'),
  fixture(false, 'false'),
];

/** JSON values; `json` keeps U+0000 and unpaired surrogate escapes, `jsonb` fails on both. */
export const JSON_FIXTURES: ReadonlyArray<BoundaryFixture> = [
  fixture({}, 'an empty object'),
  fixture([], 'an empty array'),
  fixture('text', 'a string'),
  fixture(0, 'zero'),
  fixture(-1.5, 'a negative fraction'),
  fixture(Number.MAX_VALUE, 'the largest double'),
  fixture(true, 'a boolean'),
  fixture({ list: [1, 'b', null], nested: { deep: true } }, 'nested values'),
  fixture({ text: 'a\u0000b' }, 'U+0000 in a string'),
  fixture({ 'a\u0000b': 1 }, 'U+0000 in a key'),
  fixture({ text: 'a\uD800b' }, 'an unpaired surrogate in a string'),
  fixture({ 'a\uD800b': 1 }, 'an unpaired surrogate in a key'),
];

/** The fixtures of a string-carried form; a date-time's follow its fraction digits. */
export function stringFixtures(
  form: StringForm,
): ReadonlyArray<BoundaryFixture> {
  if (form.type === 'timestamp' || form.type === 'timestamptz') {
    return form.type === 'timestamp'
      ? offsetFree(form.fractionDigits)
      : zoned(form.fractionDigits);
  }
  return form.type === 'uuid' ? UUIDS : DATES;
}
