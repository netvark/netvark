create table contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id bigint not null references organizations (id) on delete cascade,
  kind contact_kind not null default 'person',
  name text not null check (char_length(name) between 1 and 200),
  nickname text check (nickname <> ''),
  email email,
  website text check (website is null or website ~ '^https://'),
  status text not null default 'active' check (status in ('active', 'archived')),
  priority smallint check (priority between 1 and 5),
  discount percentage default 0,
  tags text[] not null default '{}',
  search tsvector generated always as (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(nickname, ''))
  ) stored,
  created_at timestamptz not null default now(),
  constraint contacts_email_unique unique (organization_id, email)
);

comment on table contacts is 'People and companies an organization works with.';
comment on column contacts.search is 'Full-text search over name and nickname.';

create index contacts_name_trgm on contacts using gin (name gin_trgm_ops);
create index contacts_active on contacts (organization_id, created_at desc) where status = 'active';
create index contacts_lower_email on contacts (lower(email));
