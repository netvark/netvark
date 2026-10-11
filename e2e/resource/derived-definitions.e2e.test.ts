/**
 * The two definitions every declared resource derives (resource SPEC 11),
 * through the built packages: the server's `createDefineKeyset({ cursor })`
 * accepts `keyset`; every request `@netvark/jsonapi-core`'s `parseQuery`
 * accepts on `resource`, `@netvark/keyset-core` plans; and what parseQuery
 * refuses, keyset-core refuses too, except a sort by the key, which only
 * keyset-core names. SPEC 15.5 holds the same property on two real
 * catalogs, where every page query also runs in PostgreSQL.
 */
import type { Keyset } from '@netvark/keyset-core';
import type { DeclaredResource } from '@netvark/resource-core';

import { describe, expect, it } from 'vitest';

import { isBanError, parseQuery } from '@netvark/jsonapi-core';
import {
  createDefineKeyset,
  isKeysetError,
  OPERATORS,
} from '@netvark/keyset-core';

import { Calls } from './resources/calls.ts';
import { Contacts } from './resources/contacts.ts';
import { ImportedContacts, Owners } from './resources/imported-contacts.ts';
import { Meetings } from './resources/meetings.ts';
import { Notes } from './resources/notes.ts';
import { Organizations } from './resources/organizations.ts';
import { filterRequest, keysetCondition } from './support/keyset-request.ts';

const defineKeyset = createDefineKeyset({
  cursor: { secret: 'an e2e cursor secret of at least thirty-two bytes' },
});

const RESOURCES: ReadonlyArray<readonly [string, DeclaredResource]> = [
  ['organizations', Organizations],
  ['contacts', Contacts],
  ['meetings', Meetings],
  ['notes', Notes],
  ['calls', Calls],
  ['owners', Owners],
  ['imported_contacts', ImportedContacts],
];

type Verdict = 'accepts' | 'refuses';

/** A refusal is a `BanError`; anything else thrown fails the test. */
function parsed(
  resource: DeclaredResource['resource'],
  query: string,
): Verdict {
  try {
    parseQuery(resource, query);
    return 'accepts';
  } catch (error) {
    if (isBanError(error)) {
      return 'refuses';
    }
    throw error;
  }
}

/** A refusal is a `KeysetError`; anything else thrown fails the test. */
async function planned(keyset: Keyset, request: object): Promise<Verdict> {
  try {
    await keyset.plan(request);
    return 'accepts';
  } catch (error) {
    if (isKeysetError(error)) {
      return 'refuses';
    }
    throw error;
  }
}

describe.each(RESOURCES)('%s', (table, declared) => {
  const keyset = defineKeyset(declared.keyset);
  const { resource } = declared;
  const { fields } = declared.keyset;
  const names = [
    ...new Set([
      ...Object.keys(fields),
      ...resource.attributes,
      ...Object.keys(resource.relationships),
      'undeclared',
    ]),
  ];

  it('defines a keyset for the table and its key with the resource page bounds', () => {
    expect(keyset.definition.table).toBe(table);
    expect(keyset.definition.key).toEqual(['id']);
    expect(keyset.definition.page).toEqual(resource.query.page);
    expect(parseQuery(resource, '').page?.size).toBe(
      keyset.definition.page.default,
    );
  });

  it('plans exactly the filters parseQuery accepts', async () => {
    const accepted: Array<string> = [];
    const disagreements: Array<string> = [];
    for (const name of names) {
      const field = fields[name];
      for (const op of OPERATORS) {
        const { query, condition } = filterRequest(name, field, op);
        const byParse = parsed(resource, query);
        if (byParse === 'accepts') {
          expect(parseQuery(resource, query).filter.conditions).toEqual([
            condition,
          ]);
        }
        const filter = keysetCondition(field, condition);
        const byPlan = await planned(keyset, { filter });
        if (byParse !== byPlan) {
          disagreements.push(
            `${query}: parseQuery ${byParse}, keyset-core ${byPlan}`,
          );
        } else if (byParse === 'accepts') {
          accepted.push(`${name} ${op}`);
        }
      }
    }
    expect(disagreements).toEqual([]);
    expect(accepted).toEqual(
      Object.entries(resource.query.filter).flatMap(([name, ops]) =>
        ops.map((op) => `${name} ${op}`),
      ),
    );
  });

  it('plans exactly the sorts parseQuery accepts, and the key besides', async () => {
    const verdicts: Array<string> = [];
    for (const name of names) {
      for (const item of [name, `-${name}`]) {
        const byParse = parsed(resource, `sort=${item}`);
        const byPlan = await planned(keyset, { sort: [item] });
        verdicts.push(`${item}: ${byParse}, ${byPlan}`);
      }
    }
    const expected = names.flatMap((name) =>
      [name, `-${name}`].map((item) => {
        if (name === 'id') {
          return `${item}: refuses, accepts`;
        }
        const verdict = resource.query.sort.includes(name)
          ? 'accepts'
          : 'refuses';
        return `${item}: ${verdict}, ${verdict}`;
      }),
    );
    expect(verdicts).toEqual(expected);
    await expect(planned(keyset, {})).resolves.toBe('accepts');
  });

  it('agrees on search, the page maximum, and include', async () => {
    const search = resource.query.search?.parameter ?? 'filter[q]';
    const term = parsed(resource, `${search}=ada%20lovelace`);
    const searched = await planned(keyset, { search: 'ada lovelace' });
    expect([term, searched]).toEqual(
      resource.query.search === undefined
        ? ['refuses', 'refuses']
        : ['accepts', 'accepts'],
    );
    const max = keyset.definition.page.max;
    expect(parsed(resource, `page[size]=${String(max)}`)).toBe('accepts');
    await expect(planned(keyset, { page: { size: max } })).resolves.toBe(
      'accepts',
    );
    expect(parsed(resource, `page[size]=${String(max + 1)}`)).toBe('refuses');
    await expect(planned(keyset, { page: { size: max + 1 } })).resolves.toBe(
      'refuses',
    );
    for (const path of resource.query.include) {
      expect(parsed(resource, `include=${path}`)).toBe('accepts');
      const relationship = resource.relationships[path];
      expect(relationship?.type).toBeTypeOf('string');
      expect(relationship?.resource?.().type).toBe(relationship?.type);
    }
  });
});
