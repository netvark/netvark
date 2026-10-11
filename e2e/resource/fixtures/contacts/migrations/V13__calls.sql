-- Calls, partitioned by a hash of their id. A declared resource has a
-- single-column key, and PostgreSQL wants the partition key in every unique
-- constraint, so a table a resource can be declared on is partitioned by its
-- id. One partition lives in another schema and is partitioned again, as
-- partitioning tools lay them out; a violation names the partition that
-- holds the row, never calls.
create schema archive;

create table calls (
  id uuid primary key default gen_random_uuid(),
  organization_id int8 not null references organizations (id),
  contact_id uuid not null references contacts (id) on delete cascade,
  minutes int4 not null check (minutes between 1 and 600),
  note text not null
) partition by hash (id);

create table calls_even partition of calls for values with (modulus 2, remainder 0);

create table archive.calls_odd partition of calls for values with (modulus 2, remainder 1)
  partition by hash (id);
create table archive.calls_odd_1 partition of archive.calls_odd
  for values with (modulus 4, remainder 1);
create table archive.calls_odd_3 partition of archive.calls_odd
  for values with (modulus 4, remainder 3);
