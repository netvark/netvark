create table plans (
  id plan_tier primary key,
  seats integer not null check (seats > 0)
);

create table organizations (
  id bigint generated always as identity primary key,
  name varchar(120) not null check (char_length(name) >= 1),
  plan_id plan_tier not null default 'free' references plans (id),
  verified boolean not null default false,
  marketing_opt_in boolean not null,
  open_days boolean[] not null default '{t,t,t,t,t,f,f}',
  founded_on date,
  invite_code text check (char_length(invite_code) between 6 and 32),
  created_at timestamptz not null default now(),
  constraint organizations_enterprise_verified check (plan_id <> 'enterprise' or verified)
);
