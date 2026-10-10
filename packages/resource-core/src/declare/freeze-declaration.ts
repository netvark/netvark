/**
 * A frozen copy of a checked declaration (SPEC 3): later changes to the
 * caller's object cannot reach the declared resource. Functions (`target`)
 * and `example` values are kept by reference; the rest is plain data.
 * @packageDocumentation
 */
import type { Declaration } from './types';

function freezeRecord<TValue>(
  record: Readonly<Record<string, TValue>>,
  copy: (value: TValue) => TValue,
): Readonly<Record<string, TValue>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(record).map(([key, value]) => [key, copy(value)]),
    ),
  );
}

function freezeShallow<TValue extends object>(value: TValue): TValue {
  return Object.freeze({ ...value });
}

/** A deep frozen copy of `declaration`, typed as the original. */
export function freezeDeclaration<TDecl extends Declaration>(
  declaration: TDecl,
): TDecl {
  const { fields, relationships, search, sort, page, rules, operations } =
    declaration;
  return Object.freeze({
    ...declaration,
    operations: Object.freeze([...operations]),
    fields: freezeRecord(fields, (field) =>
      freezeShallow({
        ...field,
        ...(field.filter === undefined
          ? {}
          : { filter: Object.freeze([...field.filter]) }),
      }),
    ),
    ...(relationships === undefined
      ? {}
      : {
          relationships: freezeRecord(relationships, (relationship) =>
            freezeShallow({
              ...relationship,
              ...(relationship.filter === undefined
                ? {}
                : { filter: Object.freeze([...relationship.filter]) }),
            }),
          ),
        }),
    ...(search === undefined ? {} : { search: freezeShallow(search) }),
    ...(sort === undefined
      ? {}
      : {
          sort: Object.freeze({
            ...sort,
            ...(sort.default === undefined
              ? {}
              : {
                  default: Object.freeze(
                    sort.default.map((entry) =>
                      typeof entry === 'string' ? entry : freezeShallow(entry),
                    ),
                  ),
                }),
          }),
        }),
    ...(page === undefined ? {} : { page: freezeShallow(page) }),
    ...(rules === undefined
      ? {}
      : { rules: freezeRecord(rules, freezeShallow) }),
  });
}
