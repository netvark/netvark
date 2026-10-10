-- What the resource suite adds to the contacts application (resource SPEC
-- 15.4). meetings.during, a tstzrange, is the column that needs a codec, and
-- meetings_no_double_booking the exclusion constraint; this migration adds
-- the CHECKs a declaration answers with validators (one over two columns,
-- one the rule translator does not cover, and a domain's) and two tables
-- whose keys cannot carry a resource id.
create domain handle as text check (value = lower(value));
comment on domain handle is 'A lower-case public handle.';

alter table organizations add column handle handle unique;

alter table meetings
  add constraint meetings_contact_or_notes
    check (contact_id is not null or notes is not null),
  add constraint meetings_room_lowercase check (room = lower(room));

-- PostgreSQL accepts a jsonb primary key and a foreign key to it, since
-- jsonb has a btree operator class, but a resource id is a string on the
-- wire, which neither column can carry (resource SPEC 3.4).
create table import_batches (
  source jsonb primary key,
  started_at timestamptz not null default now()
);

create table import_rows (
  id uuid primary key default gen_random_uuid(),
  batch jsonb not null references import_batches (source),
  payload jsonb not null
);
