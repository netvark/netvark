/**
 * A schema of CHECK constraints for the rule tests: one per shape the
 * recognizer reads, the ones it must leave alone, and the collation cases.
 * `rulesMigrations` runs on PostgreSQL 14 to 18; `rules18Migrations` adds
 * a NOT ENFORCED CHECK, which only PostgreSQL 18 has.
 */
import type { Migration } from '../migrations/load';

export const rulesMigrations: ReadonlyArray<Migration> = [
  {
    name: 'V1__rules.sql',
    sql: `create collation case_insensitive (provider = icu, locale = 'und-u-ks-level2', deterministic = false);
create type mood as enum ('happy', 'sad');
create domain lower_word as text check (value ~ '^[a-z]+$');
create domain short_word as lower_word check (char_length(value) <= 8);
create domain percentage as numeric(5,2) check (value >= 0 and value <= 100);
create domain ci_text as text collate case_insensitive;
create domain ci_word as text collate case_insensitive
  constraint ci_word_pattern check (value ~ '^[ab]$')
  constraint ci_word_member check (value in ('a', 'b'));
create domain over_ci as ci_text collate "C" check (value ~ '^a$');
create table rules (
  name text constraint name_length check (char_length(name) between 1 and 200),
  code varchar(10) constraint code_member check (code in ('a', 'b')),
  slug text constraint slug_pattern check (slug ~ '^[a-z0-9-]+$'),
  website text constraint website_pattern check (website is null or website ~ '^https://'),
  qty integer constraint qty_range check (qty > 0),
  price numeric(10,2) constraint price_range check (price >= 0),
  ratio double precision constraint ratio_range check (ratio between 0 and 1),
  feeling mood constraint feeling_member check (feeling in ('happy')),
  word short_word constraint word_length check (char_length(word) >= 2),
  ci text collate case_insensitive constraint ci_member check (ci in ('a')),
  low integer,
  high integer,
  constraint low_below_high check (low < high),
  note text,
  nickname text constraint nickname_lower check (lower(nickname) = nickname)
);
alter table rules add constraint note_length check (char_length(note) <= 100) not valid;`,
  },
];

export const rules18Migrations: ReadonlyArray<Migration> = [
  ...rulesMigrations,
  {
    name: 'V2__not_enforced.sql',
    sql: 'alter table rules add constraint qty_cap check (qty < 100) not enforced;',
  },
];
