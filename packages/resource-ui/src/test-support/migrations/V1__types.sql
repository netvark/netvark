create type contact_kind as enum ('person', 'company');
create type contact_channel as enum ('email', 'phone', 'post');
create type plan_tier as enum ('free', 'team', 'enterprise');

create domain percentage as numeric(5, 2) check (value >= 0 and value <= 100);
