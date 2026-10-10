create table organizations (
  id bigint generated always as identity primary key,
  name short_text not null,
  slug varchar(63) not null unique check (slug ~ '^[a-z0-9-]+$'),
  seats integer not null default 5 check (seats > 0),
  country country_code,
  created_at timestamptz not null default now()
);

comment on table organizations is 'Tenants: every contact belongs to one.';
