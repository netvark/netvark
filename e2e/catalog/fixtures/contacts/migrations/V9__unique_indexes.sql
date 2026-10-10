-- Uniqueness only an index expresses: a plain unique index, a partial one
-- that holds among active contacts only, and one over an expression, which
-- the public catalog leaves out.
create unique index contact_phones_number_key on contact_phones (contact_id, number);
create unique index contacts_active_name on contacts (organization_id, name) where status = 'active';
create unique index organizations_lower_slug on organizations (lower(slug));
