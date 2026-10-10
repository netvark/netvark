-- The oracle's schema (resource SPEC 15.3): a column for every wire form of
-- SPEC 5.1, with each type modifier and each rule shape of SPEC 6.1 from a
-- column CHECK and from a domain, and one key table per type a relationship
-- id can take (SPEC 3.4). The oracle writes each boundary fixture into its
-- column and compares PostgreSQL's verdict with the schema's.
create extension if not exists citext;

create type mood as enum ('happy', 'sad', 'angry');

create domain code_text as text check (value ~ '^[A-Z]+$');
create domain short_code as code_text
  check (char_length(value) >= 2 and char_length(value) <= 3);
create domain state_text as text check (value in ('open', 'closed', 'held'));
create domain percent as numeric(5, 2) check (value >= 0 and value <= 100);

create table texts (
  id integer generated always as identity primary key,
  plain text,
  short varchar(3),
  padded char(3),
  letter char,
  loose citext,
  sized text check (char_length(sized) >= 2 and char_length(sized) <= 5),
  nonempty text check (nonempty <> ''),
  word text check (word ~ '^[a-z]+$'),
  state text check (state in ('open', 'closed')),
  code short_code,
  status state_text check (status in ('open', 'closed', 'lost')),
  tags text[],
  codes varchar(2)[]
);

create table numbers (
  id integer generated always as identity primary key,
  small smallint,
  regular integer,
  big bigint,
  single real,
  double double precision,
  amount numeric(5, 2),
  whole numeric(4, 0),
  exact numeric,
  ranged integer check (ranged > 0 and ranged <= 100),
  floor bigint check (floor >= -5),
  scaled double precision check (scaled >= -1.5 and scaled < 2.5),
  share numeric check (share <= 0.5),
  price numeric(6, 2) check (price > 0),
  pct percent,
  counts integer[]
);

create table others (
  id integer generated always as identity primary key,
  key uuid,
  day date,
  local_at timestamp,
  local_ms timestamp(3),
  at timestamptz,
  at_s timestamptz(0),
  flag boolean,
  data json,
  datab jsonb,
  feeling mood,
  calm mood check (calm in ('happy', 'sad')),
  days date[],
  keys uuid[]
);

create table key_smallints (id smallint primary key);
create table key_bigints (id bigint primary key);
create table key_numerics (id numeric(6, 2) primary key);
create table key_reals (id real primary key);
create table key_doubles (id double precision primary key);
create table key_booleans (id boolean primary key);
create table key_texts (id varchar(8) primary key);
create table key_uuids (id uuid primary key);
create table key_dates (id date primary key);
create table key_instants (id timestamptz primary key);
create table key_moods (id mood primary key);

create table links (
  id integer generated always as identity primary key,
  smallint_id smallint references key_smallints (id),
  bigint_id bigint references key_bigints (id),
  numeric_id numeric(6, 2) references key_numerics (id),
  real_id real references key_reals (id),
  double_id double precision references key_doubles (id),
  boolean_id boolean references key_booleans (id),
  text_id varchar(8) references key_texts (id),
  uuid_id uuid references key_uuids (id),
  date_id date references key_dates (id),
  instant_id timestamptz references key_instants (id),
  mood_id mood references key_moods (id)
);
