import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineValidator } from '../codecs/define-validator';
import {
  catalogOf,
  column,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { issuesOf, outputOf } from '../test-support/validation';

const UUID = { type: 'uuid', sqlType: 'uuid' };
const SUBJECT = '7c1b0c6e-2a4b-4d0b-9f3a-1e2d3c4b5a69';

function foreignKey(name: string, target: string) {
  return {
    kind: 'foreignKey',
    columns: [name],
    references: { table: target, columns: ['id'] },
    enforced: true,
  } as const;
}

function check(...columns: ReadonlyArray<string>) {
  return { kind: 'check', columns, rule: null, enforced: true } as const;
}

const declare = untypedDeclare(
  catalogOf({
    owners: table('owners', {
      id: column({
        type: 'int4',
        sqlType: 'integer',
        nullable: false,
        identity: 'always',
      }),
    }),
    subjects: table('subjects', {
      id: column({ ...UUID, nullable: false, default: { literal: null } }),
    }),
    tasks: table(
      'tasks',
      {
        id: column({ ...UUID, nullable: false, default: { literal: null } }),
        note: column(),
        priority: column({ type: 'int4', sqlType: 'integer' }),
        owner_id: column({ type: 'int4', sqlType: 'integer' }),
        subject_id: column(UUID),
        entity_id: column(UUID),
      },
      {
        tasks_owner_id_fkey: foreignKey('owner_id', 'owners'),
        tasks_subject_id_fkey: foreignKey('subject_id', 'subjects'),
        tasks_entity_id_fkey: foreignKey('entity_id', 'subjects'),
        tasks_owner_check: check('owner_id'),
        tasks_owner_or_note: check('owner_id', 'note'),
        tasks_one_target: check('subject_id', 'entity_id'),
      },
    ),
  }),
  {
    validators: {
      notThirteen: defineValidator({
        schema: z
          .string()
          .nullable()
          .refine((id) => id !== '13'),
        fixtures: { accept: ['1', null], reject: ['13'] },
      }),
      ownerOrNote: defineValidator({
        schema: z
          .object({ owner: z.string().nullable(), note: z.string().nullable() })
          .refine(({ owner, note }) => owner !== null || note !== null),
        fixtures: {
          accept: [{ owner: '1', note: null }],
          reject: [{ owner: null, note: null }],
        },
      }),
      exactlyOne: defineValidator({
        schema: z
          .object({
            subject: z.string().nullable(),
            entity: z.string().nullable(),
          })
          .refine(
            ({ subject, entity }) => (subject === null) !== (entity === null),
          ),
        fixtures: {
          accept: [{ subject: SUBJECT, entity: null }],
          reject: [{ subject: null, entity: null }],
        },
      }),
    },
  },
);

const Owners = declare('owners', {
  operations: ['get'],
  fields: {},
});
const Subjects = declare('subjects', { operations: ['get'], fields: {} });
const Tasks = declare('tasks', {
  operations: ['create', 'update'],
  fields: { note: { access: 'readWrite' }, priority: { access: 'readWrite' } },
  relationships: {
    owner_id: { target: () => Owners, access: 'readWrite' },
    subject_id: { target: () => Subjects, access: 'readWrite' },
    entity_id: { target: () => Subjects, access: 'readWrite' },
  },
  rules: {
    tasks_owner_check: { validator: 'notThirteen' },
    tasks_owner_or_note: { validator: 'ownerOrNote' },
    tasks_one_target: { validator: 'exactlyOne' },
  },
});

const owner = (id: string) => ({ type: 'owners', id });
const subject = { type: 'subjects', id: SUBJECT };

describe('write (SPEC 6.2)', () => {
  it('takes { attributes, relationships } and outputs both without undefined members', () => {
    const value = {
      attributes: { note: 'Call back', priority: undefined },
      relationships: { owner: owner('1') },
    };
    expect(outputOf(Tasks.write.create, value)).toEqual({
      attributes: { note: 'Call back' },
      relationships: { owner: owner('1') },
    });
  });

  it('requires both parts and rejects any other member', () => {
    expect(issuesOf(Tasks.write.create, { meta: {} })).toEqual([
      { code: 'required', path: ['attributes'] },
      { code: 'required', path: ['relationships'] },
      { code: 'additionalProperties', path: ['meta'] },
    ]);
    expect(issuesOf(Tasks.write.update, [])).toEqual([
      { code: 'type', expected: 'object', path: [] },
    ]);
  });

  it('names an attribute issue by its JSON type, an int4 as integer', () => {
    expect(
      issuesOf(Tasks.write.update, {
        attributes: { priority: 1.5 },
        relationships: {},
      }),
    ).toEqual([
      { code: 'type', expected: 'integer', path: ['attributes', 'priority'] },
    ]);
  });

  it("checks an int4 foreign key's id as integer text", () => {
    expect(
      issuesOf(Tasks.write.update, {
        attributes: {},
        relationships: { owner: owner('1.5') },
      }),
    ).toEqual([
      {
        code: 'format',
        expected: 'int32',
        path: ['relationships', 'owner', 'id'],
      },
    ]);
  });

  it("runs a foreign key column's validator on its id, or null", () => {
    expect(
      issuesOf(Tasks.write.update, {
        attributes: {},
        relationships: { owner: owner('13') },
      }),
    ).toEqual([
      { code: 'TASKS_OWNER_CHECK', path: ['relationships', 'owner'] },
    ]);
    expect(
      outputOf(Tasks.write.update, {
        attributes: { note: 'Unassigned' },
        relationships: { owner: null },
      }),
    ).toEqual({
      attributes: { note: 'Unassigned' },
      relationships: { owner: null },
    });
  });
});

describe('multi-column CHECKs over relationships (SPEC 3.5, 7.2)', () => {
  it('runs a CHECK over relationships only on the linkage, ids by public name', () => {
    expect(
      issuesOf(Tasks.write.update, {
        attributes: {},
        relationships: { subject: null, entity: null },
      }),
    ).toEqual([
      { code: 'TASKS_ONE_TARGET', path: ['relationships', 'subject'] },
      { code: 'TASKS_ONE_TARGET', path: ['relationships', 'entity'] },
    ]);
    expect(
      Tasks.linkage.update
        .safeParse({ subject, entity: subject })
        .error?.issues.map((issue) => issue.path),
    ).toEqual([['subject'], ['entity']]);
    expect(
      Tasks.linkage.update.safeParse({ subject, entity: null }).success,
    ).toBe(true);
  });

  it('runs a CHECK over a field and a relationship on write, at each member', () => {
    expect(
      issuesOf(Tasks.write.update, {
        attributes: { note: null },
        relationships: { owner: null },
      }),
    ).toEqual([
      { code: 'TASKS_OWNER_OR_NOTE', path: ['relationships', 'owner'] },
      { code: 'TASKS_OWNER_OR_NOTE', path: ['attributes', 'note'] },
    ]);
  });

  it('leaves a CHECK to the database when the write lacks a member', () => {
    expect(
      outputOf(Tasks.write.update, {
        attributes: { note: null },
        relationships: { subject: null },
      }),
    ).toEqual({ attributes: { note: null }, relationships: { subject: null } });
  });

  it('runs every CHECK whose members parsed, alongside the other issues', () => {
    expect(
      issuesOf(Tasks.write.create, {
        attributes: { note: null, priority: 'high' },
        relationships: { owner: null, subject: null, entity: null },
      }),
    ).toEqual([
      { code: 'type', expected: 'integer', path: ['attributes', 'priority'] },
      { code: 'TASKS_ONE_TARGET', path: ['relationships', 'subject'] },
      { code: 'TASKS_ONE_TARGET', path: ['relationships', 'entity'] },
      { code: 'TASKS_OWNER_OR_NOTE', path: ['relationships', 'owner'] },
      { code: 'TASKS_OWNER_OR_NOTE', path: ['attributes', 'note'] },
    ]);
  });
});
