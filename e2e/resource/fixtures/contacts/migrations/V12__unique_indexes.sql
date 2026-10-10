-- An organization's active contacts have distinct names. Only a partial
-- unique index can say so; PostgreSQL reports a duplicate with the index's
-- name as the constraint, so resource-core derives its code like a UNIQUE
-- constraint's.
create unique index contacts_active_name_unique on contacts (organization_id, name)
  where status = 'active';
