import { describe, expect, it } from 'vitest';

import { internalsOf } from '../../declare/declared-resource';
import { scopeValues } from '../../server/scope';
import { serverValueColumns } from '../../server/server-values';
import { contractFixture } from './fixture';

const { workspaces, tasks, logs } = contractFixture.resources;

/** The server values of a fixture resource. */
function serverValues(resource: unknown): ReadonlyArray<string> {
  const internals = internalsOf(resource);
  return internals === undefined ? [] : serverValueColumns(internals);
}

describe('the storage contract fixture', () => {
  it('is frozen, with the migrations as SQL text and a seed that empties first', () => {
    expect(Object.isFrozen(contractFixture)).toBe(true);
    expect(contractFixture.migrations).toHaveLength(2);
    expect(contractFixture.migrations[0]).toContain('create table tasks');
    expect(contractFixture.migrations[1]).toContain(
      'alter table logs attach partition contract_archive.logs_high',
    );
    expect(
      contractFixture.seed.startsWith('truncate table logs, tasks, workspaces'),
    ).toBe(true);
  });

  it('declares tasks with the public names the cases use', () => {
    expect(Object.keys(tasks.fields)).toEqual([
      'title',
      'estimate',
      'points',
      'dueOn',
      'startsAt',
      'tags',
      'details',
      'done',
      'location',
      'locationText',
      'secret',
      'hasSecret',
      'createdBy',
      'createdIn',
      'workspace',
      'parent',
    ]);
    expect(tasks.declaration.scope).toBe('workspace');
    expect(tasks.fields['location']?.codec).toBe('point');
    expect(Object.keys(workspaces.fields)).toEqual(['name', 'createdIn']);
    expect(workspaces.declaration.scope).toBeUndefined();
  });

  it('declares logs on the partitioned table with the codes obligation 11 expects', () => {
    expect(Object.keys(logs.fields)).toEqual(['note', 'owner']);
    expect(logs.errors).toMatchObject({
      LOGS_PKEY: { status: 409, kind: 'primaryKey', fields: ['id'] },
      LOGS_NOTE_CHECK: { status: 422, kind: 'check', fields: ['note'] },
      LOGS_NOTE_NOT_NULL: { status: 422, kind: 'notNull', fields: ['note'] },
      LOGS_OWNER_ID_FKEY: {
        status: 404,
        kind: 'foreignKey',
        fields: ['owner'],
      },
    });
  });

  it('leaves created_by alone to the server', () => {
    expect(serverValues(tasks)).toEqual(['created_by']);
    expect(serverValues(workspaces)).toEqual([]);
  });

  it('derives the codes the error cases expect', () => {
    expect(tasks.errors).toMatchObject({
      TASKS_TITLE_CHECK: { status: 422, kind: 'check', fields: ['title'] },
      TASKS_WORKSPACE_ID_TITLE_KEY: {
        status: 409,
        kind: 'unique',
        fields: ['title'],
      },
      TASKS_PKEY: { status: 409, kind: 'primaryKey', fields: ['id'] },
      TASKS_PARENT_ID_FKEY: {
        status: 404,
        kind: 'foreignKey',
        fields: ['parent'],
      },
    });
  });

  it("binds the workspace scope to the actor's workspace and the contract's parameter", () => {
    expect(scopeValues(contractFixture.scopes, { workspace: '1' })).toEqual([
      {
        scope: 'workspace',
        column: 'workspace_id',
        session: 'contract.workspace_id',
        value: '1',
      },
    ]);
  });

  it('parses points with the codec and refuses what is not one', () => {
    const { schema } = contractFixture.codecs.point;
    expect(schema.parse({ x: 1.5, y: -2 })).toEqual({ x: 1.5, y: -2 });
    expect(
      schema.safeParse({ x: Number.POSITIVE_INFINITY, y: 0 }).success,
    ).toBe(false);
    expect(schema.safeParse('(1,2)').success).toBe(false);
  });
});
