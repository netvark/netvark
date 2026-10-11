/**
 * The domain's types (resource SPEC 18.4) over typed declarations: a
 * resource has exactly the operations it declares, and `include` when a
 * relationship is includable; its rows are its public rows, and its list
 * takes a request in its own keyset fields. A resource typed wide may
 * have any of them. `createResourceRuntime` infers the domain and each
 * resource from the behaviors it is given.
 */
import type { Page } from '@netvark/kysely-keyset';
import type { PublicRowOf } from '@netvark/resource-core/server';

import type { Member, TestDomain } from '../test-support/domain';
import type { Domain, ResourceOperations } from './operations-types';
import type { RuntimeOptions } from './types';

import { describe, expectTypeOf, it } from 'vitest';

import { createDeclareResource } from '@netvark/resource-core';
import { createDomainDefiners } from '@netvark/resource-core/server';
import { contractFixture } from '@netvark/resource-core/testing';

import { createResourceRuntime } from './create-runtime';

const declareResource = createDeclareResource({
  catalog: contractFixture.catalog,
  codecs: contractFixture.codecs,
  scopes: { workspace: { column: 'workspace_id' } },
});
const Workspaces = declareResource('workspaces', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});
const Tasks = declareResource('tasks', {
  operations: ['list', 'get', 'create'],
  scope: 'workspace',
  fields: {
    title: { access: 'readWrite', filter: ['eq'], sort: true },
    done: { access: 'readWrite' },
  },
  relationships: {
    workspace_id: { target: () => Workspaces, access: 'read', include: true },
  },
});
const { defineResource, definePolicy } = createDomainDefiners<TestDomain>();
const TasksBehavior = defineResource(Tasks, {
  operations: { create: { values: ({ actor }) => ({ created_by: actor.id }) } },
  policy: definePolicy(Tasks, {
    list: () => true,
    get: () => true,
    create: () => true,
    include: { workspace: () => true },
  }),
});
const WorkspacesBehavior = defineResource(Workspaces, {
  policy: definePolicy(Workspaces, { get: () => true }),
});

type TaskOperations = ResourceOperations<typeof Tasks>;
declare const tasks: TaskOperations;
declare const options: RuntimeOptions<TestDomain>;

describe('ResourceOperations (resource SPEC 18.4)', () => {
  it('has exactly the operations the declaration declares, and include when a relationship is includable', () => {
    expectTypeOf<keyof TaskOperations>().toEqualTypeOf<
      'list' | 'get' | 'create' | 'include'
    >();
    expectTypeOf<
      keyof ResourceOperations<typeof Workspaces>
    >().toEqualTypeOf<'get'>();
    expectTypeOf(tasks.include).parameter(0).toEqualTypeOf<'workspace'>();
  });

  it('resolves to the public rows of the resource', () => {
    expectTypeOf(tasks.get).returns.resolves.toEqualTypeOf<
      PublicRowOf<typeof Tasks>
    >();
    expectTypeOf(tasks.create).returns.resolves.toEqualTypeOf<
      PublicRowOf<typeof Tasks>
    >();
    expectTypeOf(tasks.list).returns.resolves.toEqualTypeOf<
      Page<PublicRowOf<typeof Tasks>>
    >();
  });

  it('lists by the fields of its keyset, in their public names', () => {
    void tasks.list({
      filter: { field: 'title', op: 'eq', value: 'Boot' },
      sort: ['-title'],
    });
    // @ts-expect-error done neither filters nor sorts
    void tasks.list({ sort: ['done'] });
    // @ts-expect-error a field the resource does not have
    void tasks.list({ filter: { field: 'titel', op: 'eq', value: 'Boot' } });
  });

  it('may have any operation when the resource is typed wide', () => {
    expectTypeOf<keyof ResourceOperations>().toEqualTypeOf<
      'list' | 'get' | 'create' | 'update' | 'remove' | 'include'
    >();
    expectTypeOf<undefined>().toExtend<ResourceOperations['get']>();
  });
});

describe('Domain (resource SPEC 18.4)', () => {
  it('keys the operations by type, each typed by its behavior', () => {
    type Typed = Domain<{
      readonly tasks: typeof TasksBehavior;
      readonly workspaces: typeof WorkspacesBehavior;
    }>;
    expectTypeOf<keyof Typed>().toEqualTypeOf<'tasks' | 'workspaces'>();
    expectTypeOf<Typed['tasks']>().toEqualTypeOf<TaskOperations>();
  });

  it('is what createResourceRuntime runs as the actor, the domain inferred from the behaviors', () => {
    const runtime = createResourceRuntime({
      ...options,
      resources: { tasks: TasksBehavior, workspaces: WorkspacesBehavior },
    });
    expectTypeOf(runtime)
      .resolves.toHaveProperty('as')
      .parameter(0)
      .toEqualTypeOf<Member>();
    expectTypeOf(runtime)
      .resolves.toHaveProperty('as')
      .returns.toHaveProperty('tasks')
      .toEqualTypeOf<TaskOperations>();
  });
});
