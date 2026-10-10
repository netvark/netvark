/**
 * The NOT ENFORCED catalog (SPEC 15.1, catalog ADR 0010): constraints
 * PostgreSQL 18 records but never checks, beside one it enforces, as the
 * `e2e/resource/fixtures/postgres18` schema below holds them, typed by an
 * explicit interface as `contacts.ts` is. Its tables carry two rules no
 * extraction writes (`catalog/imported-contacts-tables.ts`). Not published
 * with the package.
 *
 * ```sql
 * create table owners (id uuid primary key);
 *
 * create table imported_contacts (
 *   id uuid primary key,
 *   name text not null,
 *   nickname text constraint imported_contacts_nickname_check
 *     check (nickname is not null) not enforced,
 *   email text constraint imported_contacts_email_check
 *     check (email ~ '^[^@ ]+@[^@ ]+$') not enforced,
 *   status text constraint imported_contacts_status_check
 *     check (status in ('active', 'archived')) not enforced,
 *   score integer constraint imported_contacts_score_check
 *     check (score between 0 and 100),
 *   owner_id uuid constraint imported_contacts_owner_id_fkey
 *     references owners (id) not enforced,
 *   constraint imported_contacts_reachable_check
 *     check (email is not null or owner_id is not null) not enforced
 * );
 * ```
 * @packageDocumentation
 */
import {
  IMPORTED_CONTACTS_TABLE,
  OWNERS_TABLE,
} from './catalog/imported-contacts-tables';

export interface UnenforcedCatalog {
  readonly format: 3;
  readonly enums: Readonly<Record<string, never>>;
  readonly domains: Readonly<Record<string, never>>;
  readonly tables: {
    readonly imported_contacts: typeof IMPORTED_CONTACTS_TABLE;
    readonly owners: typeof OWNERS_TABLE;
  };
}

export const unenforcedCatalog: UnenforcedCatalog = {
  format: 3,
  enums: {},
  domains: {},
  tables: {
    imported_contacts: IMPORTED_CONTACTS_TABLE,
    owners: OWNERS_TABLE,
  },
};
