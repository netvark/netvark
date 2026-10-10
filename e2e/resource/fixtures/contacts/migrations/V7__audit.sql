create schema audit;
create type audit.operation as enum ('insert', 'update', 'delete');

create table audit.changes (
  id bigint generated always as identity primary key,
  table_name text not null,
  operation audit.operation not null,
  row_id text not null,
  changed_at timestamptz not null default now(),
  payload jsonb not null default '{}'
);
