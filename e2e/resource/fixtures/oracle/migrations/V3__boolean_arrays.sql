-- A boolean array, whose elements PostgreSQL prints with boolout as t and f,
-- while a boolean cast to text prints true or false (resource SPEC 5.1).
alter table others add column flags boolean[];
