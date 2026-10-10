create type contact_kind as enum ('person', 'company');
create type phone_kind as enum ('mobile', 'landline', 'fax');

create domain email as citext check (value ~ '^[^@ ]+@[^@ ]+$');
comment on domain email is 'An email address, compared case-insensitively.';

create domain short_text as varchar(120) check (char_length(value) between 1 and 120);
create domain percentage as numeric(5, 2) check (value >= 0 and value <= 100);
create domain country_code as text check (value ~ '^[A-Z]{2}$');
create domain required_note as text check (value is not null);
