/**
 * The cases of obligation 9 (SPEC 12.8): `record` writes events in the
 * operation's transaction, so they commit with its writes, in the order
 * recorded, and roll back with them. Payloads hold each JSON type.
 * @packageDocumentation
 */
import type { DomainEvent } from '../../server/event';
import type { Contract } from './context';
import type { ContractCase } from './types';

import { z } from 'zod';

import { defineEvent } from '../../server/event';
import { assertEqual, rejection } from './assert';
import { MISSING, taskCreate } from './context';

const TASK_CREATED = defineEvent(
  'task.created',
  1,
  z.object({ id: z.string(), title: z.string() }),
);
const TASK_PLANNED = defineEvent(
  'task.planned',
  2,
  z.object({
    id: z.string(),
    tags: z.array(z.string()),
    plan: z.object({
      estimate: z.string(),
      ratio: z.number(),
      urgent: z.boolean(),
      owner: z.null(),
    }),
  }),
);

/** An event's recorded members, whatever else a harness returns with it. */
function recorded(event: DomainEvent): DomainEvent {
  return { name: event.name, version: event.version, payload: event.payload };
}

/** The cases of obligation 9. */
export function eventCases<TTransaction>(
  contract: Contract<TTransaction>,
): ReadonlyArray<ContractCase> {
  const { harness, tasks, within } = contract;
  const { adapter } = harness;
  return [
    {
      name: 'obligation 9: records events with the transaction, in the order recorded',
      run: async () => {
        const events = await within('1', async (tx) => {
          const row = await adapter.create(
            tx,
            tasks,
            taskCreate({ attributes: { title: 'Evented' } }),
          );
          const created = TASK_CREATED.of({ id: row.id, title: 'Évènement ✓' });
          const planned = TASK_PLANNED.of({
            id: row.id,
            tags: ['a', 'b'],
            plan: { estimate: '1.50', ratio: 0.25, urgent: false, owner: null },
          });
          const again = TASK_CREATED.of({ id: row.id, title: 'Again' });
          await adapter.record(tx, [created]);
          await adapter.record(tx, []);
          await adapter.record(tx, [planned, again]);
          return [created, planned, again];
        });
        assertEqual(
          (await harness.events()).map((event) => recorded(event)),
          events.map((event) => recorded(event)),
          'the outbox after the commit',
        );
      },
    },
    {
      name: 'obligation 9: drops the events of a transaction that rolls back',
      run: async () => {
        await rejection(
          within('1', async (tx) => {
            await adapter.record(tx, [
              TASK_CREATED.of({ id: MISSING, title: 'Never' }),
            ]);
            throw new Error('rolled back');
          }),
          'a transaction whose run throws after recording',
        );
        assertEqual(
          (await harness.events()).map((event) => recorded(event)),
          [],
          'the outbox after the rollback',
        );
      },
    },
  ];
}
