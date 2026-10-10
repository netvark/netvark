import type {
  DefineDefaultedKeyset,
  DefineKeyset,
} from './create-define-keyset';

import { describe, expectTypeOf, it } from 'vitest';

import { SECRET } from '../test-support/fixtures';
import { createDefineKeyset } from './create-define-keyset';

const ITEMS = {
  table: 'items',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'integer' },
    name: { column: 'name', type: 'text' },
    tags: { column: 'tags', type: 'array', of: 'text' },
  },
} as const;

describe('createDefineKeyset types', () => {
  it('makes the cursor optional and partial when the defaults carry one', () => {
    const define = createDefineKeyset({ cursor: { secret: SECRET } });
    expectTypeOf(define).toEqualTypeOf<DefineDefaultedKeyset>();
    define(ITEMS);
    define({ ...ITEMS, cursor: { ttl: 60 } });
  });

  it('keeps the cursor required when the defaults carry none', () => {
    const withoutDefaults = createDefineKeyset();
    const pageOnly = createDefineKeyset({ page: { max: 50 } });
    expectTypeOf(withoutDefaults).toEqualTypeOf<DefineKeyset>();
    expectTypeOf(pageOnly).toEqualTypeOf<DefineKeyset>();
    // @ts-expect-error the definition must name its cursor
    pageOnly(ITEMS);
    pageOnly({ ...ITEMS, cursor: { secret: SECRET } });
  });

  it('infers the request vocabulary like defineKeyset', () => {
    const keyset = createDefineKeyset({ cursor: { secret: SECRET } })(ITEMS);
    type Sort = NonNullable<Parameters<typeof keyset.plan>[0]['sort']>;
    expectTypeOf<'name'>().toExtend<Sort[number]>();
    expectTypeOf<'-id'>().toExtend<Sort[number]>();
    // An array field is not sortable.
    expectTypeOf<'tags'>().not.toExtend<Sort[number]>();
  });

  it('rejects members the defaults do not have', () => {
    // @ts-expect-error not a default
    createDefineKeyset({ cursor: { secret: SECRET }, sort: {} });
  });
});
