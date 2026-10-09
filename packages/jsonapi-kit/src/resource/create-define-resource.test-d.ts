import type { CreateAttributesOf, RowOf } from './types';

import { describe, expectTypeOf, it } from 'vitest';

import { createDefineResource } from './create-define-resource';

interface PersonRow {
  readonly id: string;
  readonly name: string;
}

interface CreatePerson {
  readonly name: string;
}

declare const createSchema: {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: 'test';
    readonly validate: (value: unknown) => { value: CreatePerson };
    readonly types: { input: unknown; output: CreatePerson };
  };
};

const define = createDefineResource({ links: { base: '/api/v1' } });

const People = define({
  type: 'people',
  attributes: ['name'],
  relationships: { articles: { type: 'articles', cardinality: 'many' } },
  serialize: (row: PersonRow) => ({
    id: row.id,
    attributes: { name: row.name },
    relationships: { articles: [] },
  }),
  query: { sort: ['name'], filter: { name: ['eq'] } },
  validate: { create: createSchema },
});

describe('createDefineResource types', () => {
  it('infers the same literal types as defineResource', () => {
    expectTypeOf(People.type).toEqualTypeOf<'people'>();
    expectTypeOf(People.attributes).toEqualTypeOf<ReadonlyArray<'name'>>();
    expectTypeOf(People.query.sort).toEqualTypeOf<ReadonlyArray<'name'>>();
    expectTypeOf<RowOf<typeof People>>().toEqualTypeOf<PersonRow>();
    expectTypeOf<
      CreateAttributesOf<typeof People>
    >().toEqualTypeOf<CreatePerson>();
  });

  it('rejects undeclared fields in serialize like defineResource does', () => {
    define({
      type: 'tags',
      attributes: ['name'],
      // @ts-expect-error -- "label" is not a declared attribute
      serialize: (row: { id: string }) => ({
        id: row.id,
        attributes: { label: row.id },
      }),
    });
  });
});
