import type { QueryKey } from '@tanstack/react-query';

import { hashKey } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { queryServer } from '../test-support/query-server';
import { resourceQueries } from './queries';

const { clients, queryClient } = queryServer(() => ({ status: 500 }));
const contacts = resourceQueries(clients.contacts);

describe('the keys of resourceQueries (resource SPEC 20.6)', () => {
  it('keys a read by the type, the call, and the query string it sends', () => {
    expect(contacts.all).toEqual(['contacts']);
    expect(contacts.list().queryKey).toEqual(['contacts', 'list', '']);
    expect(
      contacts.list({ sort: ['-created_at'], page: { size: 2 } }).queryKey,
    ).toEqual(['contacts', 'list', 'sort=-created_at&page%5Bsize%5D=2']);
    expect(contacts.pages({ page: { size: 2 } }).queryKey).toEqual([
      'contacts',
      'pages',
      'page%5Bsize%5D=2',
    ]);
    expect(contacts.get('7', { include: ['organization'] }).queryKey).toEqual([
      'contacts',
      'get',
      '7',
      'include=organization',
    ]);
    expect(contacts.get('7').queryKey).toEqual(['contacts', 'get', '7', '']);
  });

  it('writes the parameters in their one order, whatever order the query wrote its members in', () => {
    const written = contacts.list({
      search: 'ada',
      filter: { status: 'active' },
      sort: ['name'],
      fields: { contacts: ['name', 'email'] },
      include: ['organization'],
    });
    const reordered = contacts.list({
      include: ['organization'],
      fields: { contacts: ['name', 'email'] },
      sort: ['name'],
      filter: { status: 'active' },
      search: 'ada',
    });
    expect(written.queryKey).toEqual(reordered.queryKey);
    expect(written.queryKey[2]).toBe(
      'include=organization&fields%5Bcontacts%5D=name%2Cemail&sort=name&filter%5Bstatus%5D=active&filter%5Bq%5D=ada',
    );
  });

  it('keys two queries that make one request alike, and two requests apart', () => {
    const tens = [10n, 10, '10'].map(
      (gte) => contacts.list({ filter: { priority: { gte } } }).queryKey,
    );
    expect(tens[0]).toEqual([
      'contacts',
      'list',
      'filter%5Bpriority%5D%5Bgte%5D=10',
    ]);
    expect(tens[1]).toEqual(tens[0]);
    expect(tens[2]).toEqual(tens[0]);
    expect(contacts.list({ sort: ['name'] }).queryKey).not.toEqual(
      contacts.list({ sort: ['-name'] }).queryKey,
    );
    expect(contacts.list().queryKey).not.toEqual(contacts.pages().queryKey);
  });

  it('keys a bigint as its text, so every key is JSON as TanStack Query hashes it', () => {
    const key = contacts.list({
      filter: { priority: { gte: 2n ** 70n } },
    }).queryKey;
    expect(hashKey(key)).toBe(
      JSON.stringify([
        'contacts',
        'list',
        'filter%5Bpriority%5D%5Bgte%5D=1180591620717411303424',
      ]),
    );
  });

  it('keys a record by the include and fields a get sends, nothing else of the query', () => {
    const query = { include: ['organization'], sort: ['name'] } as const;
    expect(contacts.get('7', query).queryKey).toEqual(
      contacts.get('7', { include: ['organization'] }).queryKey,
    );
  });

  it('keys each write by the type and the call', () => {
    expect(contacts.create().mutationKey).toEqual(['contacts', 'create']);
    expect(contacts.update().mutationKey).toEqual(['contacts', 'update']);
    expect(contacts.remove().mutationKey).toEqual(['contacts', 'remove']);
  });

  it('reaches every list, page, and record of the type from [type], and every list from [type, list]', async () => {
    // Keys typed wide: what each entry holds is not what this test is about.
    const entries: ReadonlyArray<QueryKey> = [
      contacts.list({ sort: ['name'] }).queryKey,
      contacts.pages().queryKey,
      contacts.get('7').queryKey,
      resourceQueries(clients.organizations).list().queryKey,
    ];
    for (const key of entries) {
      queryClient.setQueryData(key, { data: [] });
    }
    const invalidated = () =>
      entries.map((key) => queryClient.getQueryState(key)?.isInvalidated);
    await queryClient.invalidateQueries({ queryKey: ['contacts', 'list'] });
    expect(invalidated()).toEqual([true, false, false, false]);
    await queryClient.invalidateQueries({ queryKey: contacts.all });
    expect(invalidated()).toEqual([true, true, true, false]);
  });
});
