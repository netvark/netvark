-- Every query runs with app.organization_id set to the caller's tenant.
alter table contacts enable row level security;
alter table contacts force row level security;
create policy contacts_tenant_isolation on contacts
  using (organization_id = current_setting('app.organization_id')::bigint)
  with check (organization_id = current_setting('app.organization_id')::bigint);

alter table meetings enable row level security;
create policy meetings_tenant_isolation on meetings
  using (organization_id = current_setting('app.organization_id')::bigint);
