-- An activity timeline partitioned by quarter. A foreign key that references a
-- partitioned table is cloned once per partition, under names that differ
-- between majors; the catalog lists only the declared constraint.
create table activities (
  id uuid not null default gen_random_uuid(),
  contact_id uuid not null references contacts (id) on delete cascade,
  occurred_on date not null,
  summary text not null check (char_length(summary) between 1 and 500),
  primary key (id, occurred_on)
) partition by range (occurred_on);

create table activities_2026_q1 partition of activities
  for values from ('2026-01-01') to ('2026-04-01');
create table activities_2026_q2 partition of activities
  for values from ('2026-04-01') to ('2026-07-01');

create table activity_attachments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null,
  occurred_on date not null,
  file_name text not null check (char_length(file_name) between 1 and 255),
  constraint activity_attachments_activity_fk foreign key (activity_id, occurred_on)
    references activities (id, occurred_on) on delete cascade
);
