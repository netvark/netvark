-- Trigram search on names, equality operators for the exclusion constraint,
-- and case-insensitive email addresses.
create extension if not exists pg_trgm;
create extension if not exists btree_gist;
create extension if not exists citext;
