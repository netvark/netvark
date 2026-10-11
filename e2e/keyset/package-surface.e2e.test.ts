/**
 * Package surface. Both packages must resolve through their published
 * `exports` maps at runtime and export exactly what the SPEC lists. Value
 * imports on purpose: a missing dist file or a wrong `exports` entry fails
 * here before any feature test runs.
 */
import { describe, expect, it } from 'vitest';

import * as core from '@netvark/keyset-core';
import * as kysely from '@netvark/kysely-keyset';

function names(module: object): Array<string> {
  return Object.keys(module).toSorted();
}

/** SPEC 1: the core's values. */
const CORE = [
  'CURSOR_VERSION',
  'DEFAULT_MAX_PAGE_SIZE',
  'DEFAULT_PAGE_SIZE',
  'InvalidCursorError',
  'InvalidFilterError',
  'InvalidFilterValueError',
  'InvalidPageSizeError',
  'KeysetError',
  'MIN_SECRET_BYTES',
  'OPERATORS',
  'PageSizeExceededError',
  'RangeNotSupportedError',
  'UnsupportedFilterError',
  'UnsupportedSearchError',
  'UnsupportedSortError',
  'checkScalar',
  'createCursorCodec',
  'createDefineKeyset',
  'createPlanner',
  'defineKeyset',
  'escapeLike',
  'finishPage',
  'isFieldName',
  'isKeysetError',
  'isOperator',
  'isSearchConfig',
  'keyAlias',
  'operatorsFor',
  'resolvePage',
  'resolveSort',
  'seekPredicate',
  'sortSignature',
].toSorted();

/**
 * SPEC 10: the adapter's own values, on top of the core's. Its
 * `createDefineKeyset` replaces the core's export of the same name.
 */
const ADAPTER = [
  'createDefineKeyset',
  'paginate',
  'renderPredicate',
  'renderTarget',
].toSorted();

describe('package surface', () => {
  it('@netvark/keyset-core exports the documented values', () => {
    expect(names(core)).toEqual(CORE);
  });

  it('@netvark/kysely-keyset re-exports the core and adds the adapter', () => {
    expect(names(kysely)).toEqual(
      [...new Set([...CORE, ...ADAPTER])].toSorted(),
    );
    expect(kysely.defineKeyset).toBe(core.defineKeyset);
    expect(kysely.createDefineKeyset).not.toBe(core.createDefineKeyset);
    expect(kysely.InvalidCursorError).toBe(core.InvalidCursorError);
  });

  it('resolves package.json through the exports map', async () => {
    const corePkg = (await import('@netvark/keyset-core/package.json', {
      with: { type: 'json' },
    })) as {
      default: { name: string };
    };
    const adapterPkg = (await import('@netvark/kysely-keyset/package.json', {
      with: { type: 'json' },
    })) as {
      default: { name: string };
    };
    expect(corePkg.default.name).toBe('@netvark/keyset-core');
    expect(adapterPkg.default.name).toBe('@netvark/kysely-keyset');
  });
});
