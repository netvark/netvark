/**
 * Two transactions of the contract's concurrent cases (SPEC 12.9), the
 * second started while the first holds what it took: a quota's lock, a
 * row's lock. The first transaction takes it, the second starts, and the
 * first finishes only after the second had time to reach the database,
 * so the second either waits for the first or shows the defect. An
 * adapter that serializes its transactions, as PGlite's does, starts the
 * second only after the first ends, so the first waits `START_MS` for a
 * start that cannot come; a pass proves nothing there, and a harness on a
 * server gives its adapter at least two connections.
 * @packageDocumentation
 */
import { ContractFailure } from './assert';

/** How long the first transaction waits for the second to start. */
const START_MS = 500;
/** How long it then waits for the second to reach the database. */
const WAIT_MS = 100;

/** How a promise settled. */
export type Settled<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly error: unknown };

/** What each transaction of an overlap does. */
export interface Overlap<TTransaction, THeld, TSecond> {
  /** The first transaction's start, which takes what the second must wait for. */
  readonly hold: (tx: TTransaction) => Promise<THeld>;
  /** The second transaction, started while the first holds. */
  readonly second: (tx: TTransaction) => Promise<TSecond>;
  /** The first transaction's end, once the second had time to reach the database. */
  readonly release: (tx: TTransaction) => Promise<void>;
}

/** How both transactions settled; the first's value is what `hold` returned. */
export interface Overlapped<THeld, TSecond> {
  readonly first: Settled<THeld>;
  readonly second: Settled<TSecond>;
}

/** Runs `run` in one transaction. */
export type Within<TTransaction> = <TResult>(
  run: (tx: TTransaction) => Promise<TResult>,
) => Promise<TResult>;

async function settle<TValue>(
  promise: Promise<TValue>,
): Promise<Settled<TValue>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/** The placeholder of a signal's `fire`, which the promise's executor replaces at once. */
function nothing(): void {
  // Never runs: `new Promise` calls its executor synchronously.
}

/** A promise and the function that fulfills it. */
function signal(): {
  readonly fired: Promise<void>;
  readonly fire: () => void;
} {
  let fire: () => void = nothing;
  const fired = new Promise<void>((resolve) => {
    fire = resolve;
  });
  return { fired, fire };
}

/** Runs the overlap's two transactions; the second never starts when `hold` fails. */
export async function overlap<TTransaction, THeld, TSecond>(
  within: Within<TTransaction>,
  steps: Overlap<TTransaction, THeld, TSecond>,
): Promise<Overlapped<THeld, TSecond>> {
  const started = signal();
  let second: Promise<Settled<TSecond>> = Promise.resolve({
    ok: false,
    error: new ContractFailure('the second transaction never started'),
  });
  const first = await settle(
    within(async (tx) => {
      const held = await steps.hold(tx);
      second = settle(
        within(async (other) => {
          started.fire();
          return steps.second(other);
        }),
      );
      await Promise.race([started.fired, delay(START_MS)]);
      await delay(WAIT_MS);
      await steps.release(tx);
      return held;
    }),
  );
  return { first, second: await second };
}

/** The value of `outcome`, or its error thrown. */
export function settled<TValue>(outcome: Settled<TValue>): TValue {
  if (!outcome.ok) {
    throw outcome.error;
  }
  return outcome.value;
}

/**
 * The value of a transaction that must commit; a `ContractFailure` naming
 * `what` and the SQLSTATE when it rejected with anything but a failed
 * check, the error as its cause.
 */
export function committed<TValue>(
  outcome: Settled<TValue>,
  what: string,
): TValue {
  if (outcome.ok) {
    return outcome.value;
  }
  const { error } = outcome;
  if (error instanceof ContractFailure) {
    throw error;
  }
  const code: unknown =
    typeof error === 'object' && error !== null
      ? Reflect.get(error, 'code')
      : undefined;
  const reason = typeof code === 'string' ? ` with SQLSTATE ${code}` : '';
  throw new ContractFailure(
    `${what}: expected it to commit, but it rejected${reason}`,
    { cause: error },
  );
}
