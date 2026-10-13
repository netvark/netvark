/**
 * A selection's actions on screen (resource SPEC 21.5): the bar over the
 * rows a person selects on the contacts list
 * (`screens/contact-actions.tsx`), rendered by React in jsdom as
 * `contact-actions.e2e.test.tsx` renders it, on PGlite and on the server
 * `RESOURCE_PG_URL` names. Each action sends the selection in one Atomic
 * Operations request, which refetches the list once the server has committed
 * all of it. A restore the index on active names refuses lands on the record
 * of the operation the error names and on the member its pointer names, and
 * the server commits none of the selection; the person deselects that record
 * and restores the rest. A removal refused at the operation itself lands
 * under its record's menu. A selection larger than one request takes is held
 * back, its reason on the bar's actions, before anything is sent.
 * @ref https://jsonapi.org/ext/atomic/#processing ("A server MUST perform all operations atomically")
 * @ref https://jsonapi.org/ext/atomic/#processing-errors
 */
import type { RuntimeDatabase } from '../runtime/database.ts';
import type { ContactsServer } from '../support/contacts-server.ts';
import type { Departure } from '../support/recorded-clients.ts';

import { QueryClient } from '@tanstack/react-query';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { getLocale } from '../localization/paraglide/runtime.js';
import { runtimeDatabases } from '../runtime/database.ts';
import { ARCHIVED } from '../runtime/seed.ts';
import {
  announces,
  barButton,
  checkbox,
  listed,
  refusalOf,
  shows,
} from '../support/action-screen.ts';
import { contactActionQueries } from '../support/contact-queries.ts';
import { openContactsServer } from '../support/contacts-server.ts';
import {
  recordedClients,
  recordedTransport,
  sentFrom,
} from '../support/recorded-clients.ts';
import { preferLanguages } from '../support/screen-person.ts';
import { contactActionsScreen } from './screens/contact-actions.tsx';
import { renderScreen } from './screens/render-screen.tsx';

const BEA = '00000000-0000-4000-8000-0000000000b1';
const ZOE = '00000000-0000-4000-8000-0000000000b2';
/** An archived contact whose name Zoe, who is active, holds. */
const TWIN = '00000000-0000-4000-8000-0000000000b3';
const ARCHIVED_ONLY = { filter: { status: { eq: 'archived' } } };

/** Inserts an Acme contact as the database's owner, past the plan's quota. */
function contact(id: string, name: string, status: string): string {
  return `insert into contacts (id, organization_id, name, status) values ('${id}', 1, '${name}', '${status}')`;
}

/** Whether each of the bar's actions is disabled, and the reason its title gives. */
function barStates(): Array<[boolean, string]> {
  return ['Wiederherstellen', 'Entfernen'].map((label) => {
    const { disabled, title } = barButton(label);
    return [disabled, title];
  });
}

describe.each(runtimeDatabases())(
  "on %s, a selection's actions, in German",
  (_name, open) => {
    let database: RuntimeDatabase;
    let server: ContactsServer;
    let queryClient: QueryClient;
    const departures: Array<Departure> = [];

    beforeAll(async () => {
      preferLanguages(['de-DE', 'de']);
      database = await open();
      server = await openContactsServer(database);
    });
    beforeEach(async () => {
      await database.reset();
      departures.length = 0;
      queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
    });
    afterEach(() => {
      cleanup();
      queryClient.clear();
    });
    afterAll(async () => {
      await server.close();
      await database.close();
    });

    /** The list `search` holds, under the editor's transport. */
    function actionsScreen(search: Record<string, unknown>) {
      const api = contactActionQueries(
        recordedTransport(server.origin, departures, getLocale),
      );
      return renderScreen(queryClient, contactActionsScreen(api, search));
    }

    /** The status of the contact `id`, as the editor reads it past the screen. */
    async function statusOf(id: string): Promise<string> {
      const clients = recordedClients(server.origin, [], getLocale);
      return (await clients.contacts.get(id)).data.status;
    }

    it('restores a selection in one request that refetches the list', async () => {
      await database.exec(contact(BEA, 'Bea', 'archived'));
      const { user } = actionsScreen(ARCHIVED_ONLY);
      await shows(['Bea: Archiviert', 'Old Name: Archiviert']);
      // Nothing selected, nothing to run.
      expect(barButton('Wiederherstellen').disabled).toBe(true);
      await user.click(checkbox('Bea'));
      await user.click(checkbox('Old Name'));
      const from = departures.length;
      await user.click(barButton('Wiederherstellen'));
      await shows([]);
      await announces('2 Kontakte wiederhergestellt.');
      expect(sentFrom(departures, from)).toEqual([
        'POST /api/operations',
        'GET /api/contacts filter[status][eq]=archived',
      ]);
      expect(departures[from]?.body).toEqual({
        'atomic:operations': [BEA, ARCHIVED].map((id) => ({
          op: 'update',
          data: { type: 'contacts', id, attributes: { status: 'active' } },
        })),
      });
      expect([await statusOf(BEA), await statusOf(ARCHIVED)]).toEqual([
        'active',
        'active',
      ]);
    });

    it('removes a selection in one request once the person confirms it, refetching the list', async () => {
      await database.exec(contact(BEA, 'Bea', 'active'));
      const { user } = actionsScreen({});
      await shows(['Ada: Aktiv', 'Bea: Aktiv', 'Old Name: Archiviert']);
      await user.click(checkbox('Bea'));
      await user.click(checkbox('Old Name'));
      const from = departures.length;
      await user.click(barButton('Entfernen'));
      const dialog = screen.getByRole('dialog', {
        name: '2 Kontakte entfernen?',
      });
      expect(sentFrom(departures, from)).toEqual([]);
      await user.click(
        within(dialog).getByRole('button', { name: 'Endgültig entfernen' }),
      );
      await shows(['Ada: Aktiv']);
      await announces('2 Kontakte entfernt.');
      expect(sentFrom(departures, from)).toEqual([
        'POST /api/operations',
        'GET /api/contacts',
      ]);
      expect(departures[from]?.body).toEqual({
        'atomic:operations': [BEA, ARCHIVED].map((id) => ({
          op: 'remove',
          ref: { type: 'contacts', id },
        })),
      });
      expect(await database.contacts(1)).toBe(1);
    });

    it('puts a refused restore on the record and member it names, commits none of the selection, and restores the rest once the person deselects that record', async () => {
      await database.exec(
        [contact(ZOE, 'Zoe', 'active'), contact(TWIN, 'Zoe', 'archived')].join(
          ';\n',
        ),
      );
      const { user } = actionsScreen(ARCHIVED_ONLY);
      await shows(['Old Name: Archiviert', 'Zoe: Archiviert']);
      await user.click(
        screen.getByRole('checkbox', { name: 'Alle auswählen' }),
      );
      const from = departures.length;
      await user.click(barButton('Wiederherstellen'));
      // The second operation fails, so the error lands on the second record.
      await waitFor(() => {
        expect(refusalOf('Zoe')).toEqual({
          Name: 'Name: Ein anderer Datensatz hat diesen Wert bereits.',
        });
      });
      expect(
        ['Old Name', 'Zoe'].map((name) =>
          checkbox(name).getAttribute('aria-invalid'),
        ),
      ).toEqual(['false', 'true']);
      expect(refusalOf('Old Name')).toEqual({});
      expect(screen.queryByRole('alert')).toBeNull();
      // Nothing was committed, so nothing is refetched.
      expect(sentFrom(departures, from)).toEqual(['POST /api/operations']);
      expect(listed()).toEqual(['Old Name: Archiviert', 'Zoe: Archiviert']);
      expect([await statusOf(ARCHIVED), await statusOf(TWIN)]).toEqual([
        'archived',
        'archived',
      ]);
      await user.click(checkbox('Zoe'));
      await user.click(barButton('Wiederherstellen'));
      await shows(['Zoe: Archiviert']);
      await announces('1 Kontakt wiederhergestellt.');
      expect(refusalOf('Zoe')).toEqual({});
      expect(await statusOf(ARCHIVED)).toBe('active');
    });

    it("puts a refused removal's text, which names no member, under its record's menu, and commits none of the selection", async () => {
      const { user } = actionsScreen({});
      await shows(['Ada: Aktiv', 'Old Name: Archiviert']);
      await user.click(
        screen.getByRole('checkbox', { name: 'Alle auswählen' }),
      );
      const from = departures.length;
      await user.click(barButton('Entfernen'));
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: 'Endgültig entfernen',
        }),
      );
      // Ada's meeting refuses to lose its contact; the error points at the
      // operation itself.
      await waitFor(() => {
        expect(refusalOf('Ada')).toEqual({
          Aktionen:
            'Die Anfrage steht im Konflikt mit dem aktuellen Zustand der Ressource.',
        });
      });
      expect(refusalOf('Old Name')).toEqual({});
      expect(sentFrom(departures, from)).toEqual(['POST /api/operations']);
      expect(await database.contacts(1)).toBe(2);
    });

    it('holds back a selection larger than one request takes, before anything is sent', async () => {
      await database.exec(
        "insert into contacts (organization_id, name) select 1, 'Kontakt ' || n from generate_series(1, 9) as n",
      );
      const { user } = actionsScreen({});
      await waitFor(() => {
        expect(listed()).toHaveLength(11);
      });
      const from = departures.length;
      await user.click(
        screen.getByRole('checkbox', { name: 'Alle auswählen' }),
      );
      expect(barStates()).toEqual([
        [true, 'Höchstens 10 auf einmal.'],
        [true, 'Höchstens 10 auf einmal.'],
      ]);
      expect(sentFrom(departures, from)).toEqual([]);
      // Ten fit one request.
      await user.click(checkbox('Old Name'));
      expect(barStates()).toEqual([
        [false, ''],
        [false, ''],
      ]);
    });
  },
);
