-- The outbox: the runtime records each operation's events here, in the
-- operation's own transaction, and a relay delivers them once it commits.
create table outbox (
  position int8 generated always as identity primary key,
  name text not null,
  version int4 not null,
  payload jsonb not null
);
