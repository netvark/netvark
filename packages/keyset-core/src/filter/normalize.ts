/**
 * Filter normalization (SPEC 4.1): the request's tree becomes a
 * `Predicate` over validated targets and values. Unknown fields and
 * operators, bad values, and malformed nodes are errors; nothing is
 * dropped. The structure is checked before the values: a structural
 * error is thrown where the walk meets it, while refused values are
 * gathered over the whole tree and thrown together (ADR 0019).
 * @ref https://jsonapi.org/format/1.1/#errors-processing ("it MAY continue processing and encounter multiple problems")
 * @packageDocumentation
 */
import type { Field, KeysetDefinition, Relation } from '../definition/types';
import type { InvalidFilterValue } from '../errors';
import type { Predicate } from '../plan/types';
import type { Filter } from './types';

import {
  InvalidFilterError,
  InvalidFilterValueError,
  UnsupportedFilterError,
} from '../errors';
import { describe, isRecord, ownMember } from '../internal/object';
import { conditionPredicate } from './condition';
import { isOperator } from './operators';

type Path = ReadonlyArray<string | number>;

interface Scope {
  /** The table the fields belong to. */
  readonly table: string;
  readonly fields: ReadonlyMap<string, Field>;
  /** Relations addressable from this scope; none inside a relation. */
  readonly relations: ReadonlyMap<string, Relation>;
}

const RELATION_NODE_SIZE = 2;

/** A refused condition's place in the tree; `normalizeFilter` throws before anything reads it. */
const REFUSED: Predicate = { kind: 'literal', value: false };

function relationScope(relation: Relation): Scope {
  return {
    table: relation.table,
    fields: relation.fields,
    relations: new Map(),
  };
}

function condition(
  scope: Scope,
  node: Record<string, unknown>,
  path: Path,
): Predicate {
  const name = node['field'];
  const op = node['op'];
  if (typeof name !== 'string' || typeof op !== 'string') {
    throw new InvalidFilterError(path);
  }
  if (!isOperator(op)) {
    throw new UnsupportedFilterError(name, op);
  }
  const dot = name.indexOf('.');
  if (dot !== -1) {
    const relation = scope.relations.get(name.slice(0, dot));
    const field = relation?.fields.get(name.slice(dot + 1));
    if (relation === undefined || field === undefined) {
      throw new UnsupportedFilterError(name);
    }
    const inner = relationScope(relation);
    const predicate = conditionPredicate(
      inner.table,
      inner.relations,
      field,
      op,
      node['value'],
      name,
    );
    return { kind: 'exists', relation, predicate };
  }
  const field = scope.fields.get(name);
  if (field === undefined) {
    throw new UnsupportedFilterError(name);
  }
  return conditionPredicate(
    scope.table,
    scope.relations,
    field,
    op,
    node['value'],
    name,
  );
}

/**
 * The condition's predicate, or `REFUSED` with its value's refusal added
 * to `refused` at the condition's path, so the walk goes on to the next
 * condition.
 */
function gathered(
  scope: Scope,
  node: Record<string, unknown>,
  path: Path,
  refused: Array<InvalidFilterValue>,
): Predicate {
  try {
    return condition(scope, node, path);
  } catch (error) {
    if (!(error instanceof InvalidFilterValueError)) {
      throw error;
    }
    for (const { field, operator, expected, path: within } of error.values) {
      refused.push({ field, operator, expected, path: [...path, ...within] });
    }
    return REFUSED;
  }
}

function relationNode(
  scope: Scope,
  node: Record<string, unknown>,
  path: Path,
  refused: Array<InvalidFilterValue>,
): Predicate {
  const name = ownMember(node, 'relation');
  const relation =
    typeof name === 'string' ? scope.relations.get(name) : undefined;
  if (relation === undefined) {
    throw new UnsupportedFilterError(
      typeof name === 'string' ? name : describe(name),
    );
  }
  const predicate = normalizeNode(
    relationScope(relation),
    ownMember(node, 'some'),
    [...path, 'some'],
    refused,
  );
  return { kind: 'exists', relation, predicate };
}

function normalizeNode(
  scope: Scope,
  node: unknown,
  path: Path,
  refused: Array<InvalidFilterValue>,
): Predicate {
  if (!isRecord(node)) {
    throw new InvalidFilterError(path);
  }
  const keys = Object.keys(node).filter((key) => node[key] !== undefined);
  const [head] = keys;
  if ((head === 'and' || head === 'or') && keys.length === 1) {
    const items = ownMember(node, head);
    if (!Array.isArray(items)) {
      throw new InvalidFilterError(path);
    }
    return {
      kind: head,
      items: items.map((item: unknown, index) =>
        normalizeNode(scope, item, [...path, head, index], refused),
      ),
    };
  }
  if (head === 'not' && keys.length === 1) {
    return {
      kind: 'not',
      item: normalizeNode(
        scope,
        ownMember(node, 'not'),
        [...path, 'not'],
        refused,
      ),
    };
  }
  if (
    keys.length === RELATION_NODE_SIZE &&
    keys.includes('relation') &&
    keys.includes('some')
  ) {
    return relationNode(scope, node, path, refused);
  }
  if (
    keys.includes('field') &&
    keys.includes('op') &&
    keys.every((key) => key === 'field' || key === 'op' || key === 'value')
  ) {
    return gathered(scope, node, path, refused);
  }
  throw new InvalidFilterError(path);
}

/**
 * The request's filter as a predicate over the definition; `null` when
 * absent. Throws `InvalidFilterValueError` with every refused value, in
 * the order of the request's conditions, once the tree is walked.
 */
export function normalizeFilter(
  definition: KeysetDefinition,
  filter?: Filter<string, Readonly<Record<string, string>>>,
): Predicate | null {
  if (filter === undefined) {
    return null;
  }
  const refused: Array<InvalidFilterValue> = [];
  const predicate = normalizeNode(
    {
      table: definition.table,
      fields: definition.fields,
      relations: definition.relations,
    },
    filter,
    [],
    refused,
  );
  if (refused.length > 0) {
    throw new InvalidFilterValueError(refused);
  }
  return predicate;
}
