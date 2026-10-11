# ADR 0010: The database resolves the violations a partition raises

- Status: accepted
- Date: 2026-10-10

## Context

`constraintError` (SPEC 9.5) finds a violation's code by the table and constraint PostgreSQL names.
A row written through a partitioned table is stored in one of its partitions, and PostgreSQL 14 and
18 name that partition as the table, in whichever schema it lives. A CHECK keeps the partitioned
table's name, since a partition inherits it, and a cloned foreign key usually does; a PRIMARY KEY,
UNIQUE, or EXCLUDE violation names the partition's own index, which PostgreSQL names after the
partition and links to the partitioned table's through `pg_inherits` and `conparentid`. The catalog
leaves partitions out (catalog SPEC 2.2), so these violations got no code (#78).

Partitions are often created after the migrations ran. pg_partman and similar tools add them on a
schedule, and GitLab 17.11 ships 52 partitioned tables, 37 of them without a partition in its
`structure.sql`, next to an empty `gitlab_partitions_dynamic` schema: its partition manager creates
partitions while the application runs. The name of a partition's index comes from
`ChooseRelationName`, which truncates to 63 bytes and appends a number on a collision, so it cannot
be predicted from the partitioned table's names.

@ref https://www.postgresql.org/docs/18/ddl-partitioning.html @ref
https://www.postgresql.org/docs/18/functions-info.html#FUNCTIONS-INFO-PARTITION @ref
https://www.postgresql.org/docs/18/catalog-pg-constraint.html @ref
https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/commands/indexcmds.c
(`ChooseRelationName`) @ref https://docs.gitlab.com/development/database/partitioning/date_range/

## Decision

- The public catalog does not list partitions. A list taken at extraction would miss every partition
  created later, and `extract --check` and drift would report each one as a change.
- After an operation's transaction ended, the runtime asks the storage adapter, which asks the
  database: `StorageAdapter.partitionRoot(names)` (SPEC 12.8, obligation 11) returns the partitioned
  table at the top of the partition's tree and that table's name for the constraint. resource-core
  ships the query as `PARTITION_ROOT_SQL`: `pg_partition_root` for the table, the top of the
  `conparentid` chain for a cloned constraint, `pg_partition_root` of the index for an attached
  unique index, and the same name for an inherited CHECK.
- `partitionViolation(thrown, options)` says when to ask: an integrity violation of a write that
  names a table other than the resource's. `constraintError` takes the answer as `partition`, and
  keeps the SQLSTATE and kind checks it applies to any violation.

## Consequences

Partitions created at any time, in any schema and at any depth, map to the declared codes without a
catalog change, and the catalog format stays 3. A violation a partition raises costs one more query,
on the error path only. An adapter implements one more method, which the contract suite checks on a
fixture with a two-level partition in another schema. A declared resource has a single-column key,
and PostgreSQL wants the partition key in every unique constraint, so a declarable partitioned table
is partitioned by its id; the cases that reach clients are the partition's table name and, with
client ids, its primary key index.
