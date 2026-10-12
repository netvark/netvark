/**
 * `transaction(actor, work)` (resource SPEC 12.10, 18.4) on PGlite, when
 * nothing fails: the operations of one domain share one transaction, one
 * at a time, and it commits when `work` resolves, handing every event
 * over once; every misuse is a `TypeError`. What needs a second
 * connection, a reader that sees nothing before the commit and a
 * transaction inside `work`, runs in `e2e/resource`.
 */
import type { MemberApi, Member } from '../test-support/domain';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { domainOptions, member } from '../test-support/domain';
import { outboxEvents, storedTask } from '../test-support/domain-database';
import { transactionHarness } from '../test-support/transaction';
import { runTransaction } from './transaction';

const harness = transactionHarness();

beforeEach(async () => {
  await harness.reset();
});
afterAll(async () => {
  await harness.database.close();
});

describe('transaction: commit (resource SPEC 12.10)', () => {
  it('commits once work resolves, hands every event over once in order, and resolves to what work did', async () => {
    const old = await storedTask(harness.storage, 'Old');
    const id = await harness.transaction(member('1'), async (domain) => {
      const created = await domain.tasks.create({
        attributes: { title: 'New' },
      });
      await domain.tasks.update(old, { attributes: { title: 'Renamed' } });
      return created.id;
    });
    expect(await harness.titles()).toEqual(['New', 'Renamed']);
    expect(harness.committed).toHaveLength(1);
    expect(harness.committed[0]?.map(({ name }) => name)).toEqual([
      'task.created',
      'task.renamed',
    ]);
    expect(harness.committed[0]?.[0]?.payload).toEqual({ id, title: 'New' });
    expect(await outboxEvents(harness.database.db)).toEqual(
      harness.committed[0],
    );
  });

  it('runs every operation in it: a target and an include see the row an earlier one created', async () => {
    const included = await harness.transaction(member('1'), async (domain) => {
      const parent = await domain.tasks.create({
        attributes: { title: 'Parent' },
      });
      const child = await domain.tasks.create({
        attributes: { title: 'Child' },
        relationships: { parent: { type: 'tasks', id: parent.id } },
      });
      return domain.tasks.include('parent', [child]);
    });
    expect(included).toMatchObject([{ title: 'Parent' }]);
    expect(await harness.titles()).toEqual(['Child', 'Parent']);
  });

  it('waits for a call still pending when work resolves, and commits it', async () => {
    const pending: Array<Promise<unknown>> = [];
    await harness.transaction(member('1'), async (domain) => {
      pending.push(domain.tasks.create({ attributes: { title: 'Late' } }));
      await Promise.resolve();
    });
    await expect(pending[0]).resolves.toMatchObject({ title: 'Late' });
    expect(await harness.titles()).toEqual(['Late']);
  });

  it('sends what afterCommit throws to report, never to the caller, whose work committed', async () => {
    const reported: Array<unknown> = [];
    const failure = new Error('the relay is down');
    const options = domainOptions(harness.storage, {
      afterCommit: () => {
        throw failure;
      },
      report: (error) => {
        reported.push(error);
      },
    });
    await expect(
      harness.transaction(
        member('1'),
        async (domain) => domain.tasks.create({ attributes: { title: 'a' } }),
        options,
      ),
    ).resolves.toMatchObject({ title: 'a' });
    expect(reported).toEqual([failure]);
  });
});

describe('transaction: misuse (resource SPEC 12.10)', () => {
  it('refuses a call while another is pending, running nothing for it', async () => {
    const refused = await harness.transaction(member('1'), async (domain) => {
      const first = domain.tasks.create({ attributes: { title: 'First' } });
      const second = await domain.tasks
        .create({ attributes: { title: 'Second' } })
        .catch((error: unknown) => error);
      await first;
      return second;
    });
    expect(refused).toEqual(
      new TypeError(
        'transaction: an operation was called while another was pending; await each before the next',
      ),
    );
    expect(await harness.titles()).toEqual(['First']);
  });

  it('refuses a call once work settled', async () => {
    const kept: Array<MemberApi> = [];
    await harness.transaction(member('1'), async (domain) => {
      kept.push(domain);
      return domain.workspaces.get('1');
    });
    await expect(kept[0]?.tasks.list()).rejects.toThrow(
      new TypeError('transaction: an operation was called after work settled'),
    );
  });

  it('refuses a work that is not a function, and an actor without every scope, before any statement', async () => {
    await expect(
      runTransaction(harness.options, member('1'), () => ({}), 'work' as never),
    ).rejects.toThrow(new TypeError('transaction: work must be a function'));
    const tenantless: Member = {
      ...member('1'),
      workspace: undefined as never,
    };
    await expect(
      harness.transaction(tenantless, async (domain) => domain.tasks.list()),
    ).rejects.toThrow(
      new TypeError(
        'scopeValues: scope workspace gave a value that is not a string or a finite number',
      ),
    );
    expect(harness.statements).toEqual([]);
  });
});
