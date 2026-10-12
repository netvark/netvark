// @vitest-environment jsdom
/**
 * The list screen (resource SPEC 20.7, 20.8), rendered in jsdom as the
 * README writes it: its state in a TanStack Router route's search, the
 * page TanStack Query reads, and TanStack Table v9 rendering the model's
 * sorting and column filters, against the contacts API of
 * `contacts-api.ts`. A header sends `sort=-name`, the status choice
 * `filter[status][in]`, the pages follow the server's links and a sort
 * change starts over, a stale link opens with what the definition
 * accepts, and a create elsewhere on the screen refetches the list.
 * @ref https://vitest.dev/guide/environment#environments-for-specific-files
 * @ref https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/
 */
import type { ContactsApi } from '../test-support/contacts-api';

import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  contactId,
  contactRow,
  contactsApi,
} from '../test-support/contacts-api';
import { contactsTable } from '../test-support/screens/contacts-table';
import { CreateContact } from '../test-support/screens/create-contact';
import { renderScreen } from '../test-support/screens/render-screen';
import { screenQueries } from '../test-support/screens/screen-queries';

const ROWS = [
  contactRow(1, 'Ada', { email: 'ada@example.com', priority: 2 }),
  contactRow(2, 'Bea', { status: 'archived', priority: 5 }),
  contactRow(3, 'Cleo', { priority: 1 }),
];

afterEach(() => {
  cleanup();
});

/** A route search as TanStack Router writes it: each member's JSON. */
function routed(search: Readonly<Record<string, unknown>>): string {
  const params = new URLSearchParams(
    Object.entries(search).map(([name, value]) => [
      name,
      JSON.stringify(value),
    ]),
  );
  return `/contacts?${params.toString()}`;
}

/** The names the table shows, in order. */
function names(): ReadonlyArray<string | null> {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? null);
}

/** The path and query, decoded, of the last list request. */
function lastList(api: ContactsApi): string | undefined {
  return api.arrivals.findLast(
    ({ method, target }) =>
      method === 'GET' && target.startsWith('/api/contacts'),
  )?.target;
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name });
}

/** The order a column's header announces, as `aria-sort`. */
function sortOf(name: string): string | null {
  return screen.getByRole('columnheader', { name }).getAttribute('aria-sort');
}

function checkbox(name: string): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>('checkbox', { name });
}

async function listScreen(entry = '/contacts') {
  const api = contactsApi({ contacts: ROWS });
  const list = contactsTable(screenQueries(api), entry);
  const rendered = renderScreen(api, list.element);
  await screen.findByRole('table');
  return { api, list, ...rendered };
}

describe('the list screen', () => {
  it('shows the default order, then sends sort=-name from the header, which announces its order', async () => {
    const { api, user } = await listScreen();
    await waitFor(() => {
      expect(names()).toEqual(['Ada', 'Bea', 'Cleo']);
    });
    expect(lastList(api)).toBe('/api/contacts');
    expect(sortOf('Name')).toBe('ascending');
    expect([button('E-Mail').disabled, button('Priorität').disabled]).toEqual([
      true,
      false,
    ]);
    await user.click(button('Name'));
    await waitFor(() => {
      expect(names()).toEqual(['Cleo', 'Bea', 'Ada']);
    });
    expect(lastList(api)).toBe('/api/contacts?sort=-name');
    expect(sortOf('Name')).toBe('descending');
  });

  it('sends filter[status][in] for the chosen statuses, and no filter once none is chosen', async () => {
    const { api, list, user } = await listScreen();
    await user.click(checkbox('Archiviert'));
    await waitFor(() => {
      expect(names()).toEqual(['Bea']);
    });
    expect(lastList(api)).toBe('/api/contacts?filter[status][in]=archived');
    // The router validated its search again after the navigation; the choice is still a list.
    expect([checkbox('Archiviert').checked, list.search()]).toEqual([
      true,
      '?filter={"status":{"in":["archived"]}}',
    ]);
    await user.click(checkbox('Aktiv'));
    await waitFor(() => {
      expect(names()).toEqual(['Ada', 'Bea', 'Cleo']);
    });
    expect(lastList(api)).toBe(
      '/api/contacts?filter[status][in]=archived&filter[status][in]=active',
    );
    await user.click(checkbox('Archiviert'));
    await user.click(checkbox('Aktiv'));
    await waitFor(() => {
      expect(list.search()).toBe('');
    });
    expect([checkbox('Archiviert').checked, checkbox('Aktiv').checked]).toEqual(
      [false, false],
    );
    expect(names()).toEqual(['Ada', 'Bea', 'Cleo']);
  });

  it("pages by the server's links both ways, and starts over at the first page when the sort changes", async () => {
    const { api, user } = await listScreen(routed({ page: { size: 2 } }));
    await waitFor(() => {
      expect(names()).toEqual(['Ada', 'Bea']);
    });
    expect([button('Zurück').disabled, button('Weiter').disabled]).toEqual([
      true,
      false,
    ]);
    await user.click(button('Weiter'));
    await waitFor(() => {
      expect(names()).toEqual(['Cleo']);
    });
    expect(lastList(api)).toBe(
      `/api/contacts?page[size]=2&page[after]=${contactId(2)}`,
    );
    expect([button('Zurück').disabled, button('Weiter').disabled]).toEqual([
      false,
      true,
    ]);
    await user.click(button('Zurück'));
    await waitFor(() => {
      expect(names()).toEqual(['Ada', 'Bea']);
    });
    expect(lastList(api)).toBe(
      `/api/contacts?page[size]=2&page[before]=${contactId(3)}`,
    );
    await user.click(button('Weiter'));
    await waitFor(() => {
      expect(names()).toEqual(['Cleo']);
    });
    await user.click(button('Name'));
    await waitFor(() => {
      expect(names()).toEqual(['Cleo', 'Bea']);
    });
    expect(lastList(api)).toBe('/api/contacts?sort=-name&page[size]=2');
  });

  it('searches when the person submits', async () => {
    const { api, user } = await listScreen();
    await user.type(
      screen.getByRole('searchbox', { name: 'Suche' }),
      'cle{Enter}',
    );
    await waitFor(() => {
      expect(names()).toEqual(['Cleo']);
    });
    expect(lastList(api)).toBe('/api/contacts?filter[q]=cle');
  });

  it('opens a stale link with what the definition accepts', async () => {
    const { api } = await listScreen(
      routed({
        sort: ['nickname'],
        filter: { status: { in: ['archived'] }, vip: { gte: 1 } },
      }),
    );
    await waitFor(() => {
      expect(names()).toEqual(['Bea']);
    });
    expect(lastList(api)).toBe('/api/contacts?filter[status][in]=archived');
    expect(checkbox('Archiviert').checked).toBe(true);
  });

  it('refetches the list after a create elsewhere on the screen', async () => {
    const api = contactsApi({ contacts: ROWS });
    const queries = screenQueries(api);
    const list = contactsTable(queries, '/contacts');
    const { user } = renderScreen(
      api,
      <>
        {list.element}
        <CreateContact api={queries} />
      </>,
    );
    await screen.findByRole('option', { name: 'Acme' });
    await waitFor(() => {
      expect(names()).toEqual(['Ada', 'Bea', 'Cleo']);
    });
    await user.type(screen.getByLabelText('Name'), 'Dora');
    await user.selectOptions(screen.getByLabelText('Organisation'), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => {
      expect(names()).toEqual(['Ada', 'Bea', 'Cleo', 'Dora']);
    });
  });
});
