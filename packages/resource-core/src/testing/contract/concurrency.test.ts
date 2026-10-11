import type { Within } from './concurrency';

import { describe, expect, it } from 'vitest';

import { ContractFailure } from './assert';
import { committed, overlap, settled } from './concurrency';

/** Transactions that run at once, as on a server with a pool. */
const concurrent: Within<string> = async (run) => run('tx');

/** Transactions that run one at a time, as PGlite's do. */
function serialized(): Within<string> {
  let queue: Promise<unknown> = Promise.resolve();
  return async (run) => {
    const result = queue.then(async () => run('tx'));
    queue = result.catch(() => null);
    return result;
  };
}

/** The steps of an overlap that log what runs, in order. */
function logged(log: Array<string>) {
  return {
    hold: async () => {
      await Promise.resolve();
      log.push('hold');
      return 'held';
    },
    second: async () => {
      await Promise.resolve();
      log.push('second');
      return 'second';
    },
    release: async () => {
      await Promise.resolve();
      log.push('release');
    },
  };
}

describe('overlap', () => {
  it('starts the second transaction while the first holds, and ends the first after it', async () => {
    const log: Array<string> = [];
    const outcome = await overlap(concurrent, logged(log));
    expect(log).toEqual(['hold', 'second', 'release']);
    expect(outcome).toEqual({
      first: { ok: true, value: 'held' },
      second: { ok: true, value: 'second' },
    });
  });

  it('ends the first transaction when an adapter starts the second only after it', async () => {
    const log: Array<string> = [];
    const outcome = await overlap(serialized(), logged(log));
    expect(log).toEqual(['hold', 'release', 'second']);
    expect(outcome.second).toEqual({ ok: true, value: 'second' });
  });

  it('settles each transaction on its own', async () => {
    const refused = new Error('refused');
    const outcome = await overlap(concurrent, {
      ...logged([]),
      second: async () => {
        await Promise.resolve();
        throw refused;
      },
    });
    expect(outcome).toEqual({
      first: { ok: true, value: 'held' },
      second: { ok: false, error: refused },
    });
  });

  it('never starts the second transaction when the first fails to hold', async () => {
    const log: Array<string> = [];
    const refused = new Error('refused');
    const outcome = await overlap(concurrent, {
      ...logged(log),
      hold: async () => {
        await Promise.resolve();
        throw refused;
      },
    });
    expect(log).toEqual([]);
    expect(outcome.first).toEqual({ ok: false, error: refused });
    expect(outcome.second).toMatchObject({
      ok: false,
      error: { message: 'the second transaction never started' },
    });
  });
});

describe('settled', () => {
  it('gives the value of a fulfilled outcome and throws the error of a rejected one', () => {
    const refused = new Error('refused');
    expect(settled({ ok: true, value: 1 })).toBe(1);
    expect(() => settled({ ok: false, error: refused })).toThrow(refused);
  });
});

describe('committed', () => {
  it('gives the value of a transaction that committed', () => {
    expect(committed({ ok: true, value: 1 }, 'the first')).toBe(1);
  });

  it('throws the failure of a check unchanged', () => {
    const failure = new ContractFailure('a check failed');
    expect(() => committed({ ok: false, error: failure }, 'the first')).toThrow(
      failure,
    );
  });

  it('turns a database error into a failure naming its SQLSTATE, with the error as the cause', () => {
    const refusal = Object.assign(new Error('refused'), { code: '23503' });
    let thrown: unknown;
    try {
      committed({ ok: false, error: refusal }, 'the first');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ContractFailure);
    expect(thrown).toMatchObject({
      message:
        'the first: expected it to commit, but it rejected with SQLSTATE 23503',
      cause: refusal,
    });
  });

  it('names no SQLSTATE for an error without one', () => {
    expect(() =>
      committed({ ok: false, error: 'refused' }, 'the first'),
    ).toThrow('the first: expected it to commit, but it rejected');
  });
});
