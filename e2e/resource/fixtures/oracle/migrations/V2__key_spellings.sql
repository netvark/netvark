-- Keys whose wire form takes several spellings of one value, which an id
-- outputs as PostgreSQL prints it, and keys whose type compares more
-- coarsely than any spelling (resource SPEC 3.4).
create table key_locals (id timestamp(3) primary key);
create table key_codes (id char(4) primary key);
create table key_names (id citext primary key);
create table key_amounts (id numeric primary key);
create table key_wholes (id numeric(4, 0) primary key);
create table key_integers (id integer primary key);

alter table links
  add column local_id timestamp(3) references key_locals (id),
  add column code_id char(4) references key_codes (id),
  add column name_id citext references key_names (id),
  add column amount_id numeric references key_amounts (id),
  add column whole_id numeric(4, 0) references key_wholes (id),
  add column integer_id integer references key_integers (id);
