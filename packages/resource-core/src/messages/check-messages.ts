/**
 * The runtime check of a messages object (SPEC 10.1): every key the
 * resources and the application need, no key they do not, and a function
 * for every message and label. It collects every problem, so the gaps of
 * new messages show at once, the way TypeScript lists them. A function's
 * inputs are left to TypeScript: a Paraglide message function takes an
 * optional `options` too, so its arity says nothing.
 * @packageDocumentation
 */
import type { MessageIndex } from './message-index';

import { describe, isRecord } from '../internal/object';
import { ISSUE_KINDS } from '../schema/issue-kinds';

const SECTIONS = ['errors', 'constraints', 'validation', 'fields', 'options'];
const TEXT_KEYS = ['title', 'detail'];

type Problems = Array<string>;

/** The record at `path`, or `undefined` after reporting what it is instead. */
function record(
  path: string,
  value: unknown,
  problems: Problems,
): Readonly<Record<string, unknown>> | undefined {
  if (isRecord(value)) {
    return value;
  }
  problems.push(`${path}: must be an object, received ${describe(value)}`);
  return undefined;
}

/** Reports the required keys `value` lacks and the keys it has that are neither required nor allowed. */
function checkKeys(
  path: string,
  value: Readonly<Record<string, unknown>>,
  required: ReadonlyArray<string>,
  allowed: (key: string) => boolean,
  problems: Problems,
): void {
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      problems.push(`${path}.${key}: missing`);
    }
  }
  for (const key of Object.keys(value)) {
    if (!required.includes(key) && !allowed(key)) {
      problems.push(`${path}.${key}: not a key these messages take`);
    }
  }
}

function checkFunction(path: string, value: unknown, problems: Problems): void {
  if (typeof value !== 'function') {
    problems.push(`${path}: must be a function, received ${describe(value)}`);
  }
}

function checkText(path: string, value: unknown, problems: Problems): void {
  const text = record(path, value, problems);
  if (text !== undefined) {
    checkKeys(path, text, TEXT_KEYS, () => false, problems);
    for (const key of TEXT_KEYS.filter((name) => Object.hasOwn(text, name))) {
      checkFunction(`${path}.${key}`, text[key], problems);
    }
  }
}

/** Checks that `value` has exactly `keys`, and each present key with `check`. */
function checkSection<TKey extends string>(
  path: string,
  value: unknown,
  keys: ReadonlyArray<TKey>,
  check: (path: string, key: TKey, entry: unknown) => void,
  problems: Problems,
): void {
  const section = record(path, value, problems);
  if (section === undefined) {
    return;
  }
  checkKeys(path, section, keys, () => false, problems);
  for (const key of keys.filter((name) => Object.hasOwn(section, name))) {
    check(`${path}.${key}`, key, section[key]);
  }
}

function checkErrors(
  path: string,
  value: unknown,
  index: MessageIndex,
  problems: Problems,
): void {
  const errors = record(path, value, problems);
  if (errors === undefined) {
    return;
  }
  const known = (code: string): boolean =>
    index.codes.includes(code) || index.optional.has(code);
  checkKeys(
    path,
    errors,
    index.codes,
    (code) => index.optional.has(code),
    problems,
  );
  for (const [code, text] of Object.entries(errors).filter(([name]) =>
    known(name),
  )) {
    checkText(`${path}.${code}`, text, problems);
  }
}

/** Labels: exactly `names`, each a function. */
function checkLabels(
  path: string,
  value: unknown,
  names: ReadonlyArray<string>,
  problems: Problems,
): void {
  checkSection(
    path,
    value,
    names,
    (labelPath, _name, label) => {
      checkFunction(labelPath, label, problems);
    },
    problems,
  );
}

/** Every problem of `messages` over `index`, each prefixed with its path. */
export function checkMessages(
  path: string,
  messages: unknown,
  index: MessageIndex,
): ReadonlyArray<string> {
  const problems: Problems = [];
  const sections = record(path, messages, problems);
  if (sections === undefined) {
    return problems;
  }
  checkKeys(path, sections, SECTIONS, () => false, problems);
  checkErrors(`${path}.errors`, sections['errors'], index, problems);
  checkSection(
    `${path}.constraints`,
    sections['constraints'],
    index.kinds,
    (kindPath, _kind, text) => {
      checkText(kindPath, text, problems);
    },
    problems,
  );
  checkSection(
    `${path}.validation`,
    sections['validation'],
    ISSUE_KINDS,
    (kindPath, _kind, message) => {
      checkFunction(kindPath, message, problems);
    },
    problems,
  );
  checkSection(
    `${path}.fields`,
    sections['fields'],
    [...index.members.keys()],
    (typePath, type, labels) => {
      checkLabels(typePath, labels, index.members.get(type) ?? [], problems);
    },
    problems,
  );
  checkSection(
    `${path}.options`,
    sections['options'],
    [...index.options.keys()],
    (typePath, type, fields) => {
      const options =
        index.options.get(type) ?? new Map<string, ReadonlyArray<string>>();
      checkSection(
        typePath,
        fields,
        [...options.keys()],
        (fieldPath, field, labels) => {
          checkLabels(fieldPath, labels, options.get(field) ?? [], problems);
        },
        problems,
      );
    },
    problems,
  );
  return problems;
}
