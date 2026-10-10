-- Constraints PostgreSQL 18 records but never checks (NOT ENFORCED), beside
-- one it enforces. The rows the application imports may break the first
-- kind, so the API must accept what the database stores: pg-catalog keeps
-- `enforced: false` in the public catalog, and resource-core derives no
-- schema check, validator, or error code from such a constraint (catalog
-- ADR 0010). An unenforced foreign key still declares a relationship.
-- @ref https://www.postgresql.org/docs/18/sql-createtable.html
create table owners (
  id uuid primary key
);

create table imported_contacts (
  id uuid primary key,
  name text not null,
  nickname text
    constraint imported_contacts_nickname_check
    check (nickname is not null) not enforced,
  email text
    constraint imported_contacts_email_check
    check (email ~ '^[^@ ]+@[^@ ]+$') not enforced,
  status text
    constraint imported_contacts_status_check
    check (status in ('active', 'archived')) not enforced,
  score integer
    constraint imported_contacts_score_check check (score between 0 and 100),
  owner_id uuid
    constraint imported_contacts_owner_id_fkey references owners (id) not enforced,
  constraint imported_contacts_reachable_check
    check (email is not null or owner_id is not null) not enforced
);
