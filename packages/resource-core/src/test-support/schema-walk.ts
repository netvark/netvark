/**
 * A walk over a composed schema (SPEC 6.2): every node resource-core puts
 * together, down to the schemas of codecs and validators, which belong to
 * the application. Each node must be of a kind the composition uses, so a
 * kind added later is walked or fails here. Not published with the
 * package.
 * @packageDocumentation
 */
import type { $ZodType } from 'zod/v4/core';

import {
  $ZodArray,
  $ZodBoolean,
  $ZodCatch,
  $ZodDefault,
  $ZodEnum,
  $ZodLazy,
  $ZodLiteral,
  $ZodNullable,
  $ZodNumber,
  $ZodObject,
  $ZodOptional,
  $ZodPipe,
  $ZodPrefault,
  $ZodString,
  $ZodTransform,
  $ZodUnknown,
} from 'zod/v4/core';

/** What a composed schema never holds: each puts a value where the client sent none, or changes the one it sent. */
const FORBIDDEN = [
  ['default', $ZodDefault],
  ['prefault', $ZodPrefault],
  ['catch', $ZodCatch],
  ['transform', $ZodTransform],
  ['pipe', $ZodPipe],
] as const;

/** The leaves of the composition: the wire forms. */
const LEAVES = [
  $ZodString,
  $ZodNumber,
  $ZodBoolean,
  $ZodEnum,
  $ZodLiteral,
  $ZodUnknown,
] as const;

type Children = ReadonlyArray<readonly [string, $ZodType]>;

/**
 * A node's definition, where Zod Core keeps its parts.
 * @ref https://zod.dev/library-authors#how-to-accept-user-defined-schemas
 */
function defOf<TNode extends $ZodType>(node: TNode): TNode['_zod']['def'] {
  // oxlint-disable-next-line eslint/no-underscore-dangle -- reason: `_zod.def` is Zod Core's documented introspection surface for library authors, shared by zod and zod/mini
  return node._zod.def;
}

function wrapped(node: $ZodType): $ZodType | undefined {
  if (
    node instanceof $ZodOptional ||
    node instanceof $ZodNullable ||
    node instanceof $ZodDefault ||
    node instanceof $ZodPrefault ||
    node instanceof $ZodCatch
  ) {
    return defOf(node).innerType;
  }
  return node instanceof $ZodLazy ? defOf(node).getter() : undefined;
}

function children(node: $ZodType, path: string): Children {
  if (node instanceof $ZodObject) {
    return Object.entries(defOf(node).shape).map(([key, member]) => [
      `${path}.${key}`,
      member,
    ]);
  }
  if (node instanceof $ZodArray) {
    return [[`${path}[]`, defOf(node).element]];
  }
  if (node instanceof $ZodPipe) {
    return [
      [`${path}<in>`, defOf(node).in],
      [`${path}<out>`, defOf(node).out],
    ];
  }
  const inner = wrapped(node);
  if (inner !== undefined) {
    return [[path, inner]];
  }
  if (
    LEAVES.some((leaf) => node instanceof leaf) ||
    FORBIDDEN.some(([, kind]) => node instanceof kind)
  ) {
    return [];
  }
  throw new Error(`${path}: a ${defOf(node).type} node the walk does not know`);
}

/** Every forbidden node under `schema` as `path: kind`, not entering `opaque` schemas. */
export function forbiddenNodes(
  schema: $ZodType,
  opaque: ReadonlySet<$ZodType>,
): ReadonlyArray<string> {
  const found: Array<string> = [];
  const pending: Array<readonly [string, $ZodType]> = [['$', schema]];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const [path, node] = next;
    if (opaque.has(node)) {
      continue;
    }
    for (const [name, kind] of FORBIDDEN) {
      if (node instanceof kind) {
        found.push(`${path}: ${name}`);
      }
    }
    pending.push(...children(node, path));
  }
  return found.toSorted();
}

/** The schemas of every codec and validator in `registries`. */
export function registrySchemas(registries: {
  readonly codecs: Readonly<Record<string, { readonly schema: $ZodType }>>;
  readonly validators: Readonly<Record<string, { readonly schema: $ZodType }>>;
}): ReadonlySet<$ZodType> {
  return new Set(
    [
      ...Object.values(registries.codecs),
      ...Object.values(registries.validators),
    ].map(({ schema }) => schema),
  );
}
