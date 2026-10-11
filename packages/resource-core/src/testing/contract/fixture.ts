import type { ZodType } from 'zod';

/**
 * The storage contract's fixture (SPEC 12.9): its migrations and seed, the
 * public catalog `pg-catalog extract` reads from them, the `point` codec,
 * the `workspace` scope, and the declarations the cases run. A harness
 * applies `migrations` once, runs `seed` in `reset()`, and gives its
 * adapter the catalog and a storage codec for `point`.
 * @packageDocumentation
 */
import type { PublicCatalog } from '@netvark/catalog-core';

import type { Codec } from '../../codecs/types';
import type { DeclaredResource } from '../../declare/declared-resource';
import type { Scope } from '../../server/scope';

import { z } from 'zod';

import { defineCodec } from '../../codecs/define-codec';
import { createDeclareResource } from '../../declare/create-declare-resource';
import { defineScope } from '../../server/scope';
import { CONTRACT_MIGRATIONS, CONTRACT_SEED } from './migrations';
import { publicCatalog } from './public-catalog';

/** The wire value of a `point`. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The actor of the cases: the workspace it works in, an `int8` id as text. */
export interface ContractActor {
  readonly workspace: string;
}

/**
 * The fixture's codec registry, which a harness's storage codecs mirror
 * (SPEC 7.1). A type alias, since a registry is a record and only an
 * object type alias is assignable to one without an index signature.
 */
export type ContractCodecs = {
  readonly point: Codec<readonly ['point'], ZodType<Point>>;
};

/** What `contractFixture` holds. */
export interface ContractFixture {
  /** The migrations, as SQL text, in the order a harness applies them. */
  readonly migrations: ReadonlyArray<string>;
  /** Empties the tables and inserts the seed rows; `reset()` runs it. */
  readonly seed: string;
  /** The public catalog of the migrations. */
  readonly catalog: PublicCatalog;
  readonly codecs: ContractCodecs;
  readonly scopes: { readonly workspace: Scope<'workspace_id', ContractActor> };
  readonly resources: {
    /** Unscoped, with an identity key. */
    readonly workspaces: DeclaredResource;
    /** Scoped to a workspace, with client ids, the server value `created_by`, and a field of each kind. */
    readonly tasks: DeclaredResource;
    /** Partitioned by its id, with client ids and an owner workspace. */
    readonly logs: DeclaredResource;
  };
}

const codecs: ContractCodecs = {
  point: defineCodec({
    types: ['point'],
    schema: z.object({ x: z.number(), y: z.number() }),
    fixtures: [{ x: 1.5, y: -2 }],
    description: 'A point in the plane.',
  }),
};

const declareResource = createDeclareResource({
  catalog: publicCatalog,
  codecs,
  scopes: { workspace: { column: 'workspace_id' } },
});

const workspaces: DeclaredResource = declareResource('workspaces', {
  operations: ['get', 'create', 'update'],
  fields: { name: { access: 'readWrite' }, created_in: { access: 'read' } },
});

const tasks: DeclaredResource = declareResource('tasks', {
  operations: ['list', 'get', 'create', 'update', 'remove'],
  scope: 'workspace',
  clientIds: true,
  fields: {
    title: { access: 'readWrite' },
    estimate: { access: 'readWrite' },
    points: { access: 'readWrite' },
    due_on: { access: 'readWrite' },
    starts_at: { access: 'readWrite' },
    tags: { access: 'readWrite' },
    details: { access: 'readWrite' },
    done: { access: 'readWrite' },
    location: { access: 'readWrite', codec: 'point' },
    location_text: { access: 'read' },
    secret: { access: 'write' },
    has_secret: { access: 'read' },
    created_by: { access: 'read' },
    created_in: { access: 'read' },
  },
  relationships: {
    workspace_id: { target: () => workspaces, access: 'read' },
    parent_id: { target: () => tasks, access: 'readWrite' },
  },
});

const logs: DeclaredResource = declareResource('logs', {
  operations: ['create'],
  clientIds: true,
  fields: { note: { access: 'readWrite' } },
  relationships: {
    owner_id: { target: () => workspaces, access: 'readWrite' },
  },
});

/** The schema, catalog, codec, scope, and declarations the contract's cases run on. */
export const contractFixture: ContractFixture = Object.freeze({
  migrations: CONTRACT_MIGRATIONS,
  seed: CONTRACT_SEED,
  catalog: publicCatalog,
  codecs,
  scopes: {
    workspace: defineScope({
      column: 'workspace_id',
      value: (actor: ContractActor) => actor.workspace,
      session: 'contract.workspace_id',
    }),
  },
  resources: { workspaces, tasks, logs },
});
