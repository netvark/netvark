/**
 * CHECK subjects for the recognizer tests, with the type facts the
 * extraction queries report for each type (SPEC 8.1).
 */
import type { CheckSubject } from '../recognize/subject';

type SubjectType = Omit<CheckSubject, 'column'>;

function builtin(
  name: string,
  spelling: string,
  deterministic: boolean | null = null,
): SubjectType {
  return {
    domain: false,
    array: false,
    baseSchema: 'pg_catalog',
    baseName: name,
    baseType: 'b',
    baseSpelling: spelling,
    deterministic,
  };
}

function enumType(schema: string, name: string, spelling: string): SubjectType {
  return {
    domain: false,
    array: false,
    baseSchema: schema,
    baseName: name,
    baseType: 'e',
    baseSpelling: spelling,
    deterministic: null,
  };
}

export const TEXT: SubjectType = builtin('text', 'text', true);
export const VARCHAR: SubjectType = builtin(
  'varchar',
  'character varying',
  true,
);
export const BPCHAR: SubjectType = builtin('bpchar', 'bpchar', true);
export const INT2: SubjectType = builtin('int2', 'smallint');
export const INT4: SubjectType = builtin('int4', 'integer');
export const INT8: SubjectType = builtin('int8', 'bigint');
export const NUMERIC: SubjectType = builtin('numeric', 'numeric');
export const FLOAT4: SubjectType = builtin('float4', 'real');
export const FLOAT8: SubjectType = builtin('float8', 'double precision');
export const TEXT_ARRAY: SubjectType = {
  ...builtin('_text', 'text[]', true),
  array: true,
};
export const CITEXT: SubjectType = {
  ...builtin('citext', 'citext', true),
  baseSchema: 'public',
};
export const MOOD: SubjectType = enumType('public', 'mood', 'mood');
export const WEIRD_MOOD: SubjectType = enumType(
  'public',
  'Weird Mood',
  '"Weird Mood"',
);
export const LEVEL: SubjectType = enumType('other', 'level', 'other.level');

/** The same base reached through a domain: a column of a domain type, or `VALUE` of a domain over a domain. */
export function viaDomain(type: SubjectType): SubjectType {
  return { ...type, domain: true };
}

/** The same type compared under a nondeterministic collation. */
export function nondeterministic(type: SubjectType): SubjectType {
  return { ...type, deterministic: false };
}

export function column(name: string, type: SubjectType): CheckSubject {
  return { column: name, ...type };
}

/** `VALUE` in a CHECK of a domain over `type`. */
export function value(type: SubjectType): CheckSubject {
  return { column: null, ...type };
}
