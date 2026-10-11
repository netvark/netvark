/**
 * The domain (resource SPEC 18.4): each resource's declared operations as
 * one actor runs them, `include` where a relationship is includable, and
 * the mistakes a composition can make, each a `TypeError`.
 */
import type { Member } from '../test-support/domain';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { BEHAVIORS, domainOptions, member } from '../test-support/domain';
import {
  domainDatabase,
  domainStorage,
  storedTask,
  taskTitles,
} from '../test-support/domain-database';
import { createDomain } from './domain';

const statements: Array<string> = [];
const database = domainDatabase((event) => {
  statements.push(event.query.sql);
});
const storage = domainStorage(database.db);

beforeEach(async () => {
  await database.reset();
  statements.length = 0;
});
afterAll(async () => {
  await database.close();
});

describe('createDomain (resource SPEC 18.4)', () => {
  it('holds the operations each declaration declares, and include where a relationship is includable', () => {
    const domain = createDomain(domainOptions(storage))(member('1'));
    expect(Object.keys(domain)).toEqual(['tasks', 'workspaces', 'logs']);
    expect(Object.keys(domain['tasks'] ?? {})).toEqual([
      'list',
      'get',
      'create',
      'update',
      'remove',
      'include',
    ]);
    expect(Object.keys(domain['workspaces'] ?? {})).toEqual(['get', 'create']);
    expect(Object.keys(domain['logs'] ?? {})).toEqual(['list', 'create']);
    expect(Object.isFrozen(domain)).toBe(true);
    expect(Object.isFrozen(domain['tasks'])).toBe(true);
  });

  it('refuses a storage createKyselyStorage did not make', () => {
    expect(() =>
      createDomain({ ...domainOptions(storage), storage: { ...storage } }),
    ).toThrow(
      new TypeError(
        'createResourceRuntime: options.storage must come from createKyselyStorage',
      ),
    );
  });

  it('runs no operation, and no statement, for an actor without a value for every scope', async () => {
    const tenantless: Member = {
      ...member('1'),
      workspace: undefined as never,
    };
    const tasks = createDomain(domainOptions(storage))(tenantless)['tasks'];
    await expect(tasks?.list?.()).rejects.toThrow(
      new TypeError(
        'scopeValues: scope workspace gave a value that is not a string or a finite number',
      ),
    );
    expect(statements).toEqual([]);
  });

  it('rejects a create whose quota the options do not hold, writing nothing', async () => {
    const tasks = createDomain({ ...domainOptions(storage), quotas: {} })(
      member('1'),
    )['tasks'];
    await expect(
      tasks?.create?.({ attributes: { title: 'a' } }),
    ).rejects.toThrow(
      new TypeError('tasks: options.quotas has no quota tasks'),
    );
    expect(await taskTitles(database.db, '1')).toEqual([]);
  });

  it('rejects an include whose target has no behavior in the options', async () => {
    const id = await storedTask(storage, 'a');
    const resources = { tasks: BEHAVIORS.tasks };
    const tasks = createDomain({ ...domainOptions(storage), resources })(
      member('1'),
    )['tasks'];
    await expect(
      tasks?.include?.('workspace', [{ id, workspace: '1' }]),
    ).rejects.toThrow(
      new TypeError(
        'tasks: the target of workspace has no behavior in options.resources',
      ),
    );
  });
});
