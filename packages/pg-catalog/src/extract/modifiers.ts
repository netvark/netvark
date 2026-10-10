/**
 * Decodes the length, precision, and scale a type modifier (`atttypmod`,
 * `typtypmod`) encodes (SPEC 7.3).
 * @packageDocumentation
 */

/** The decoded modifier; every member is `null` for types without one. */
export interface TypeModifiers {
  readonly maxLength: number | null;
  readonly precision: number | null;
  readonly scale: number | null;
}

/** `VARHDRSZ`, the varlena header both encodings offset by. */
const VARHDRSZ = 4;
const PRECISION_SHIFT = 16;
const PRECISION_MASK = 0xff_ff;
const SCALE_MASK = 0x7_ff;
const SCALE_SIGN = 1024;
const NONE: TypeModifiers = { maxLength: null, precision: null, scale: null };
/** The types whose modifier is the number of fraction digits of a second, 0 to 6. */
const DATETIME_TYPES: ReadonlySet<string> = new Set([
  'timestamp',
  'timestamptz',
  'time',
  'timetz',
]);

/**
 * The modifiers of `type` (a `pg_catalog` type name) under `typmod`. For
 * `varchar` and `bpchar` a modifier above `VARHDRSZ` is the length plus
 * `VARHDRSZ` (`anychar_typmodout`); for `numeric` a modifier of at least
 * `VARHDRSZ` packs the precision above 16 bits and an 11-bit signed scale
 * below, which PostgreSQL 15 introduced and which reads PostgreSQL 14's
 * non-negative scales the same way; for `timestamp`, `timestamptz`,
 * `time`, and `timetz` a modifier of 0 or more is the precision itself
 * (`anytimestamp_typmodout`, `anytime_typmodout`), to which PostgreSQL
 * rounds a value. `interval` keeps `null`: its modifier also packs the
 * fields. -1 means no modifier.
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/varchar.c
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/numeric.c
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/timestamp.c
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/date.c
 */
export function typeModifiers(type: string, typmod: number): TypeModifiers {
  if ((type === 'varchar' || type === 'bpchar') && typmod > VARHDRSZ) {
    return { maxLength: typmod - VARHDRSZ, precision: null, scale: null };
  }
  if (type === 'numeric' && typmod >= VARHDRSZ) {
    const packed = typmod - VARHDRSZ;
    return {
      maxLength: null,
      precision: (packed >> PRECISION_SHIFT) & PRECISION_MASK,
      scale: ((packed & SCALE_MASK) ^ SCALE_SIGN) - SCALE_SIGN,
    };
  }
  if (DATETIME_TYPES.has(type) && typmod >= 0) {
    return { maxLength: null, precision: typmod, scale: null };
  }
  return NONE;
}
