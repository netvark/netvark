-- Repeatable: Flyway runs it after the versioned migrations, again whenever
-- it changes. Views are not part of the catalog.
create or replace view active_contacts as
  select id, organization_id, name from contacts where status = 'active';
