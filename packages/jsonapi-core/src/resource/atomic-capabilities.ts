/**
 * A definition's Atomic Operations capability (SPEC 5.1, ADR 0023): the
 * most operations one request at the definition's base takes. The
 * processor reads it from the definitions it runs, and a screen reads the
 * same value from the definition it imports, so a selection one request
 * cannot hold is refused before anything is sent.
 * @ref https://jsonapi.org/ext/atomic/#processing
 * @packageDocumentation
 */
import { DEFAULT_MAX_OPERATIONS } from '../internal/constants';

/**
 * What a definition, or a configured definer's defaults, may say about
 * Atomic Operations.
 */
export interface AtomicCapabilitiesInit {
  /**
   * The most operations one request takes; default `DEFAULT_MAX_OPERATIONS`
   * (10).
   */
  readonly max?: number | undefined;
}

/** A definition's Atomic Operations capability, every member set. */
export interface AtomicCapabilities {
  readonly max: number;
}

/** Throws `TypeError` naming `what` unless `value` is a positive safe integer. */
export function assertAtomicMax(what: string, value: unknown): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(
      `${what} must be a positive safe integer, received ${String(value)}`,
    );
  }
}

/**
 * The capability `init` gives, its default filled in; `TypeError` naming
 * `atomic.max` for a cap that is none.
 */
export function resolveAtomic(
  init: AtomicCapabilitiesInit | undefined,
): AtomicCapabilities {
  const max = init?.max ?? DEFAULT_MAX_OPERATIONS;
  assertAtomicMax('atomic.max', max);
  return { max };
}
