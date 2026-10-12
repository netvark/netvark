-- A char(4) foreign key to a char(6) key. PostgreSQL takes it, since both
-- are bpchar, but pads the value the two share to four characters in one
-- and six in the other, so the foreign key cannot spell its target's ids
-- (resource SPEC 3.1).
create table badges (
  code char(6) primary key
);

create table badge_awards (
  id uuid primary key default gen_random_uuid(),
  badge_id char(4) not null references badges (code)
);
