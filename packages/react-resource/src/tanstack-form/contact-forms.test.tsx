// @vitest-environment jsdom
/**
 * The create and the update screen (resource SPEC 20.8), rendered in
 * jsdom with TanStack Form and Query as an application uses them, against
 * the contacts API of `contacts-api.ts`, whose documents jsonapi-core
 * builds from the fixture's definitions: no error before the first
 * submit, the declaration's refusal in the language of each render, the
 * server's 422 and 409 on their fields until the person answers them, a
 * 500 without error objects left to the screen's own text, and an update
 * that sends only what the person changed, again after the record
 * refetched.
 * @ref https://vitest.dev/guide/environment#environments-for-specific-files
 * @ref https://testing-library.com/docs/react-testing-library/api#cleanup
 */
import type { Answer, Arrival } from '../test-support/query-server';

import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { errorDocument, errorItem, jsonApiError } from '@netvark/jsonapi-core';

import {
  contactId,
  contactRow,
  contactsApi,
} from '../test-support/contacts-api';
import { setLocale } from '../test-support/messages';
import {
  CreateContact,
  NOT_SAVED,
} from '../test-support/screens/create-contact';
import { EditContact } from '../test-support/screens/edit-contact';
import { errorOf, renderScreen } from '../test-support/screens/render-screen';
import { screenQueries } from '../test-support/screens/screen-queries';

const TOO_LONG = 'x'.repeat(201);
const UNDELIVERABLE = 'An diese Adresse kann nichts zugestellt werden.';
const TAKEN = 'Diese E-Mail hat schon ein Kontakt der Organisation.';

afterEach(() => {
  cleanup();
  setLocale('de');
});

/** The 422 of an email only the server checks. */
const undeliverable: Answer = {
  status: 422,
  document: errorDocument(
    jsonApiError([
      errorItem('VALIDATION_FAILED', {
        detail: UNDELIVERABLE,
        source: { pointer: '/data/attributes/email' },
      }),
    ]),
  ),
};

/** The 409 of `contacts_email_unique (organization_id, email)`, one object per member. */
const taken: Answer = {
  status: 409,
  document: {
    errors: ['/data/attributes/email', '/data/relationships/organization'].map(
      (pointer) => ({
        status: '409',
        code: 'CONTACT_EMAIL_TAKEN',
        title: 'Konflikt',
        detail: TAKEN,
        source: { pointer },
      }),
    ),
  },
};

/** Answers each write with the next of `answers`, and stores it once they run out. */
function answering(...answers: ReadonlyArray<Answer>) {
  const queue = [...answers];
  return (_arrival: Arrival) => queue.shift();
}

function writes(arrivals: ReadonlyArray<Arrival>) {
  return arrivals
    .filter(({ method }) => method !== 'GET')
    .map(({ method, body }) => ({ method, body }));
}

async function createScreen(
  onWrite?: (arrival: Arrival) => Answer | undefined,
) {
  const api = contactsApi({ contacts: [], onWrite });
  const rendered = renderScreen(
    api,
    <CreateContact api={screenQueries(api)} />,
  );
  await screen.findByRole('option', { name: 'Acme' });
  return { api, ...rendered };
}

describe('the create screen', () => {
  it('shows no error before the first submit, then the length refusal on its field, in English once the locale changes', async () => {
    const { api, user } = await createScreen();
    await user.click(screen.getByLabelText('Name'));
    await user.paste(TOO_LONG);
    await user.tab();
    expect(errorOf('Name')).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => {
      expect(errorOf('Name')).toBe('Höchstens 200 Zeichen.');
    });
    expect(errorOf('Organisation')).toBe('Organisation fehlt.');
    expect(writes(api.arrivals)).toEqual([]);
    setLocale('en');
    await user.type(screen.getByLabelText('Name'), 'x');
    expect(errorOf('Name')).toBe('At most 200 characters.');
  });

  it('sends the members the person set, leaves the status to its default, and starts over', async () => {
    const { api, user } = await createScreen();
    await user.type(screen.getByLabelText('Name'), 'Ada Lovelace');
    await user.type(screen.getByLabelText('E-Mail'), 'ada@example.com');
    await user.selectOptions(screen.getByLabelText('Organisation'), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('');
    });
    expect(writes(api.arrivals)).toEqual([
      {
        method: 'POST',
        body: {
          data: {
            type: 'contacts',
            attributes: { name: 'Ada Lovelace', email: 'ada@example.com' },
            relationships: {
              organization: { data: { type: 'organizations', id: '1' } },
            },
          },
        },
      },
    ]);
    expect(api.contacts.map(({ name, status }) => [name, status])).toEqual([
      ['Ada Lovelace', 'active'],
    ]);
  });

  it("puts the server's 422 and 409 on their fields in its words, each cleared by the change that answers it", async () => {
    const { api, user } = await createScreen(answering(undeliverable, taken));
    await user.type(screen.getByLabelText('Name'), 'Ada Lovelace');
    await user.type(screen.getByLabelText('E-Mail'), 'ada@example.com');
    await user.selectOptions(screen.getByLabelText('Organisation'), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText(UNDELIVERABLE)).toBeDefined();
    expect([errorOf('Name'), errorOf('E-Mail')]).toEqual([
      undefined,
      UNDELIVERABLE,
    ]);
    await user.clear(screen.getByLabelText('E-Mail'));
    await user.type(screen.getByLabelText('E-Mail'), 'ada@example.org');
    expect(errorOf('E-Mail')).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => {
      expect([errorOf('E-Mail'), errorOf('Organisation')]).toEqual([
        TAKEN,
        TAKEN,
      ]);
    });
    await user.selectOptions(screen.getByLabelText('Organisation'), 'Globex');
    expect([errorOf('E-Mail'), errorOf('Organisation')]).toEqual([
      undefined,
      undefined,
    ]);
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => {
      expect(api.contacts).toHaveLength(1);
    });
    expect(writes(api.arrivals)).toHaveLength(3);
  });

  it("shows the screen's own text for a 500 without error objects, and nothing on the fields", async () => {
    const { user } = await createScreen(
      answering({ status: 500, document: {} }),
    );
    await user.type(screen.getByLabelText('Name'), 'Ada Lovelace');
    await user.selectOptions(screen.getByLabelText('Organisation'), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect((await screen.findByRole('alert')).textContent).toBe(NOT_SAVED);
    expect(
      ['Name', 'E-Mail', 'Status', 'Organisation'].map((label) =>
        errorOf(label),
      ),
    ).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe('the edit screen', () => {
  it('sends only the members the person changed, measured against the record as it refetched, a cleared input as null', async () => {
    const id = contactId(1);
    const api = contactsApi({
      contacts: [contactRow(1, 'Ada', { nickname: 'Countess' })],
    });
    const { user } = renderScreen(
      api,
      <EditContact api={screenQueries(api)} id={id} />,
    );
    const save = async (count: number) => {
      await user.click(screen.getByRole('button', { name: 'Speichern' }));
      await waitFor(() => {
        // Each update refetches the record it changed before it settles.
        expect(
          api.arrivals.filter(({ method }) => method === 'GET'),
        ).toHaveLength(count + 1);
      });
    };
    const nickname =
      await screen.findByLabelText<HTMLInputElement>('Spitzname');
    expect(nickname.value).toBe('Countess');
    await user.clear(nickname);
    await user.type(nickname, 'Ada L.');
    await save(1);
    await user.type(screen.getByLabelText('Name'), ' Byron');
    await save(2);
    await user.clear(screen.getByLabelText('Spitzname'));
    await save(3);
    expect(writes(api.arrivals)).toEqual(
      [{ nickname: 'Ada L.' }, { name: 'Ada Byron' }, { nickname: null }].map(
        (attributes) => ({
          method: 'PATCH',
          body: { data: { type: 'contacts', id, attributes } },
        }),
      ),
    );
    expect(api.contacts[0]).toMatchObject({
      name: 'Ada Byron',
      nickname: null,
    });
  });
});
