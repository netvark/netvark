-- Notes on contacts, whose columns meet the names of resource SPEC 4. A
-- note's `type` is a member every resource object has, so a declaration
-- renames it with `as`; `author`, a foreign key without `_id`, needs `as`
-- for its relationship; `contact`, the name the note was taken under, which
-- outlives the contact, and `contact_id`, the foreign key, derive one public
-- name; and PostgreSQL names the CHECK on `priorität`
-- `notes_priorität_check`, whose derived code is not A-Z.
create table notes (
  id uuid primary key default gen_random_uuid(),
  organization_id bigint not null references organizations (id) on delete cascade,
  type text not null check (type in ('call', 'email', 'visit')),
  author uuid references contacts (id) on delete set null,
  contact text,
  contact_id uuid references contacts (id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  priorität smallint check (priorität between 1 and 3),
  created_at timestamptz not null default now()
);

comment on column notes.author is 'The contact who wrote the note.';
