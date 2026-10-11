/**
 * The cases of obligation 3 (SPEC 12.8): rows come back in the read forms
 * of SPEC 5, a codec field through its storage codec, a `write` field
 * never; a stored value with no read form fails the read. The values are
 * the ones drivers get wrong by default: an `int8` past 2^53, a `numeric`
 * read as a float, a `timestamptz` read at millisecond precision or in the
 * local zone, a `date` read as a local midnight, a key in upper case, and
 * array elements that need quoting, `NULL` and the empty string among them.
 * @packageDocumentation
 */
import type { PublicRow } from '../../server/storage';
import type { Contract } from './context';
import type { ContractCase } from './types';

import { assertEqual, rejection } from './assert';
import { CREATOR, UNREADABLE } from './context';

const CLIENT_ID = '0F8FAD5B-D9CB-469F-A165-70867728950E';
const TAGS = [
  'b',
  'a',
  'a b',
  'quote"d',
  'back\\slash',
  'comma,',
  '{brace}',
  'NULL',
  '',
  'ünïcödé ✓',
];
const DETAILS = { b: 1, a: [true, null, 'x'], nested: { ratio: 1.5, s: 'ü' } };

/** Every writable field of a task, in its write form. */
const EVERY_FORM = {
  title: 'Every form',
  estimate: '1.5',
  points: '9007199254740993',
  dueOn: '2026-10-10',
  startsAt: '2026-10-10T12:30:00.123456+02:00',
  tags: TAGS,
  details: DETAILS,
  done: true,
  location: { x: 1.5, y: -2 },
  secret: 'hidden',
};

/** The row of `EVERY_FORM` created in workspace 1 under `parent`. */
function everyForm(parent: string): PublicRow {
  return {
    id: CLIENT_ID.toLowerCase(),
    title: 'Every form',
    estimate: '1.50',
    points: '9007199254740993',
    dueOn: '2026-10-10',
    startsAt: '2026-10-10T10:30:00.123456Z',
    tags: TAGS,
    details: DETAILS,
    done: true,
    location: { x: 1.5, y: -2 },
    locationText: '(1.5,-2)',
    hasSecret: true,
    createdBy: CREATOR,
    createdIn: '1',
    workspace: '1',
    parent,
  };
}

/** The cases of obligation 3. */
export function readCases<TTransaction>(
  contract: Contract<TTransaction>,
): ReadonlyArray<ContractCase> {
  const { harness, tasks, within } = contract;
  const { adapter } = harness;
  return [
    {
      name: 'obligation 3: reads every field in its read form, a codec field through its storage codec, and no write field',
      run: async () => {
        const parent = await contract.createTask('1', {
          attributes: { title: 'Parent' },
        });
        const expected = everyForm(parent.id);
        const created = await contract.createTask('1', {
          id: CLIENT_ID,
          attributes: EVERY_FORM,
          relationships: { parent: parent.id },
        });
        assertEqual(created, expected, 'the row create returns');
        assertEqual(
          await contract.getTask('1', expected.id),
          expected,
          'the row get returns',
        );
      },
    },
    {
      name: 'obligation 3: fails a read whose stored value has no read form',
      run: async () => {
        await rejection(
          within('9', async (tx) => adapter.get(tx, tasks, UNREADABLE)),
          'get of a task whose startsAt is infinity',
        );
        const readable = await contract.createTask('9', {
          attributes: { title: 'Readable', startsAt: '2026-10-10T00:00:00Z' },
        });
        assertEqual(
          (await contract.getTask('9', readable.id))?.['startsAt'],
          '2026-10-10T00:00:00Z',
          'startsAt of another task of workspace 9',
        );
      },
    },
  ];
}
