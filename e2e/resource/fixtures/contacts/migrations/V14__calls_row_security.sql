-- Calls belong to a tenant too. The application's role owns no table, so
-- the policy binds it without FORCE; a role that owned calls would pass the
-- policy, so the runtime refuses to boot as one.
alter table calls enable row level security;
create policy calls_tenant_isolation on calls
  using (organization_id = current_setting('app.organization_id')::bigint);
