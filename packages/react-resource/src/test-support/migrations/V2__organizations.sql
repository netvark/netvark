create table plans (
  id plan_tier primary key,
  seats integer not null check (seats > 0)
);

create table organizations (
  id bigint generated always as identity primary key,
  name varchar(120) not null check (char_length(name) >= 1),
  plan_id plan_tier not null default 'free' references plans (id),
  verified boolean not null default false,
  founded_on date,
  created_at timestamptz not null default now()
);
