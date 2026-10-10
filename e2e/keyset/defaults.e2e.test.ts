import type { DB, Harness } from './support/db.ts';

/**
 * A configured definer (SPEC 3.6, 10.1): the application calls
 * `createDefineKeyset<DB>(defaults)` once, and every definition inherits
 * the cursor secret, the page sizes, and the text-search configuration,
 * overriding them member by member. English stemming makes the default
 * configuration observable: "programs" finds "wrote the first program"
 * only when both sides are stemmed.
 * Runs on PGlite, and on the server `KEYSET_PG_URL` names when set.
 * @ref https://www.postgresql.org/docs/current/textsearch-dictionaries.html#TEXTSEARCH-SNOWBALL-DICTIONARY
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createDefineKeyset,
  PageSizeExceededError,
} from '@netvark/kysely-keyset';

import { openPglite, openPostgres } from './support/db.ts';
import { COLUMN_FIELDS, SECRET } from './support/keysets.ts';
import { expectedIds } from './support/schema.ts';

const DEFAULT_SIZE = 3;
const DEFAULT_MAX = 4;
const OWN_MAX = 50;

const defineKeyset = createDefineKeyset<DB>({
  cursor: { secret: SECRET },
  page: { default: DEFAULT_SIZE, max: DEFAULT_MAX },
  search: { config: 'english' },
});

/** Everything from the defaults. */
const stemmed = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: COLUMN_FIELDS,
  search: { columns: ['first_name', 'bio'] },
});

/** Its own search configuration and page maximum; the default page size stays. */
const exact = defineKeyset({
  table: 'contacts',
  key: ['id'],
  fields: COLUMN_FIELDS,
  search: { columns: ['first_name', 'bio'], config: 'simple' },
  page: { max: OWN_MAX },
});

const URL = process.env['KEYSET_PG_URL'];

const HARNESSES: ReadonlyArray<readonly [string, () => Promise<Harness>]> = [
  ['PGlite', openPglite],
  ...(URL === undefined
    ? []
    : [['PostgreSQL server', async () => openPostgres(URL)] as const]),
];

describe.each(HARNESSES)('%s: a configured definer', (_name, open) => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await open();
  });
  afterAll(async () => {
    await harness.close();
  });

  function query() {
    return harness.db.selectFrom('contacts').select(['id', 'first_name']);
  }

  it('pages with the default size and walks every row with the default secret', async () => {
    const seen: Array<string> = [];
    let page = await stemmed.paginate(query(), {});
    seen.push(...page.rows.map((row) => row.id));
    expect(page.rows).toHaveLength(DEFAULT_SIZE);
    while (page.next !== null) {
      page = await stemmed.paginate(query(), { page: { after: page.next } });
      seen.push(...page.rows.map((row) => row.id));
    }
    expect(seen).toEqual(expectedIds(['id']));
  });

  it('enforces the default maximum unless the definition sets its own', async () => {
    await expect(
      stemmed.paginate(query(), { page: { size: DEFAULT_MAX + 1 } }),
    ).rejects.toBeInstanceOf(PageSizeExceededError);
    const own = await exact.paginate(query(), {
      page: { size: DEFAULT_MAX + 1 },
    });
    expect(own.rows).toHaveLength(DEFAULT_MAX + 1);
    const sized = await exact.paginate(query(), {});
    expect(sized.rows).toHaveLength(DEFAULT_SIZE);
  });

  it('searches with the default configuration unless the definition names one', async () => {
    async function names(
      keyset: typeof stemmed,
      search: string,
    ): Promise<Array<string>> {
      const page = await keyset.paginate(query(), { search });
      return page.rows.map((row) => row.first_name);
    }
    expect(await names(stemmed, 'programs')).toEqual(['Ada']);
    expect(await names(stemmed, 'walking')).toEqual(['Heidi']);
    expect(await names(exact, 'programs')).toEqual([]);
    expect(await names(exact, 'walks')).toEqual(['Heidi']);
  });
});
