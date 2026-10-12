/**
 * The contacts application's queries (resource SPEC 20.6), made once per
 * set of clients, as an application makes them beside its clients.
 */
import type { RecordOf } from '@netvark/jsonapi-client';
import type { ResourceQueries } from '@netvark/react-resource/query';

import type {
  ContactClients,
  ContactDefinitions,
} from '../../support/recorded-clients.ts';

import { resourceQueries } from '@netvark/react-resource/query';

type ContactsDefinition = ContactDefinitions['contacts'];

/** A contact as the client reads one. */
export type Contact = RecordOf<ContactDefinitions, ContactsDefinition>;

/** The contacts' reads and writes. */
export interface ContactQueries {
  readonly contacts: ResourceQueries<ContactDefinitions, ContactsDefinition>;
}

/** The queries over `clients`. */
export function contactQueries(clients: ContactClients): ContactQueries {
  return { contacts: resourceQueries(clients.contacts) };
}
