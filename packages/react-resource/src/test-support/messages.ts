/**
 * The unit tests' messages (resource SPEC 20.8): `defaultMessages`' English
 * texts, with every label a closure that reads `locale`, so a test switches
 * the language as Paraglide does it, by changing what the message functions
 * read, and never by building other messages. Not published with the
 * package.
 * @ref https://paraglidejs.com/basics#dynamic-messages
 * @packageDocumentation
 */
import type { Label, Messages } from '@netvark/resource-core';

import { defaultMessages, defineMessages } from '@netvark/resource-core';

import { RESOURCES } from './resources';

type Locale = 'de' | 'en';

let locale: Locale = 'de';

/** Makes every message read `next`, as Paraglide's `setLocale` does. */
export function setLocale(next: Locale): void {
  locale = next;
}

/** A label that reads the locale at each call. */
function text(german: string, english: string): Label {
  return () => (locale === 'de' ? german : english);
}

const english = defaultMessages(RESOURCES);

export const messages: Messages = defineMessages(
  RESOURCES,
  {},
  {
    ...english,
    fields: {
      plans: { seats: text('Plätze', 'Seats') },
      organizations: {
        name: text('Name', 'Name'),
        verified: text('Geprüft', 'Verified'),
        foundedOn: text('Gegründet am', 'Founded on'),
        createdAt: text('Erstellt am', 'Created at'),
        plan: text('Tarif', 'Plan'),
      },
      contacts: {
        kind: text('Art', 'Kind'),
        name: text('Name', 'Name'),
        nickname: text('Spitzname', 'Nickname'),
        email: text('E-Mail', 'Email'),
        status: text('Status', 'Status'),
        priority: text('Priorität', 'Priority'),
        discount: text('Rabatt', 'Discount'),
        lifetimeValue: text('Kundenwert', 'Lifetime value'),
        score: text('Bewertung', 'Score'),
        tags: text('Schlagwörter', 'Tags'),
        channels: text('Kanäle', 'Channels'),
        vip: text('VIP', 'VIP'),
        birthday: text('Geburtstag', 'Birthday'),
        followUpAt: text('Wiedervorlage', 'Follow up at'),
        details: text('Details', 'Details'),
        createdAt: text('Erstellt am', 'Created at'),
        organization: text('Organisation', 'Organization'),
      },
    },
    options: {
      contacts: {
        kind: {
          person: text('Person', 'Person'),
          company: text('Firma', 'Company'),
        },
        status: {
          active: text('Aktiv', 'Active'),
          archived: text('Archiviert', 'Archived'),
        },
        channels: {
          email: text('E-Mail', 'Email'),
          phone: text('Telefon', 'Phone'),
          post: text('Post', 'Mail'),
        },
      },
    },
  },
);
