create table contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id bigint not null references organizations (id) on delete cascade,
  kind contact_kind not null default 'person',
  name text not null check (char_length(name) between 1 and 200),
  nickname text check (nickname <> ''),
  email text check (email ~ '^[^@ ]+@[^@ ]+$'),
  status text not null default 'active' check (status in ('active', 'archived')),
  priority smallint check (priority between 1 and 5),
  discount percentage default 0,
  lifetime_value bigint,
  score double precision,
  tags text[] not null default '{}',
  channels contact_channel[] not null default '{}',
  vip boolean not null default false,
  birthday date,
  follow_up_at timestamp(0),
  details jsonb,
  search tsvector generated always as (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(nickname, ''))
  ) stored,
  created_at timestamptz not null default now(),
  constraint contacts_email_unique unique (organization_id, email)
);
