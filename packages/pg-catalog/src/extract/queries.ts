/**
 * The extraction SQL (SPEC 7.2). Every query reads `pg_catalog` only, since
 * `information_schema` hides objects the role has no privilege on, and
 * returns one `json_agg(...)::text` value, so PGlite and `pg` hand back the
 * same data whatever their type parsers do. Builtins are written unqualified:
 * PostgreSQL searches `pg_catalog` before the `search_path` schemas unless
 * the path names it, and reading pins the path to the configured schemas.
 * @ref https://www.postgresql.org/docs/18/ddl-schemas.html#DDL-SCHEMAS-CATALOG
 * @ref https://www.postgresql.org/docs/18/functions-info.html#FUNCTIONS-INFO-CATALOG
 * @packageDocumentation
 */

/** `server_version_num` of the first major with `pg_index.indnullsnotdistinct`. */
const NULLS_NOT_DISTINCT_VERSION = 150_000;
/** `server_version_num` of the first major with `pg_constraint.conenforced`. */
const ENFORCED_VERSION = 180_000;

export const VERSION_QUERY =
  "select current_setting('server_version_num')::int as version";

/** Pins `search_path` to the configured schemas ($1), each quoted by `quote_ident`, in order. */
export const SEARCH_PATH_QUERY: string = `select set_config('search_path', (
  select coalesce(string_agg(quote_ident(s.name), ', ' order by s.position), '')
  from unnest($1::text[]) with ordinality as s(name, position)
), false)`;

/**
 * Objects owned by an extension have a `pg_depend` row with `deptype 'e'`,
 * the test pg_dump uses to leave them out.
 * @ref https://www.postgresql.org/docs/18/catalog-pg-depend.html
 */
function notExtensionMember(catalog: string, oid: string): string {
  return `not exists (select from pg_depend e where e.classid = '${catalog}'::regclass and e.objid = ${oid} and e.deptype = 'e')`;
}

/**
 * Every domain with the type it finally rests on: `typbasetype` followed
 * through domains over domains to the first non-domain type.
 */
const DOMAIN_BASES = `with recursive domain_chain(domain, base) as (
  select t.oid, t.typbasetype from pg_type t where t.typtype = 'd'
  union all
  select c.domain, t.typbasetype from domain_chain c join pg_type t on t.oid = c.base and t.typtype = 'd'
), domain_base(domain, base) as (
  select c.domain, c.base from domain_chain c join pg_type t on t.oid = c.base and t.typtype <> 'd'
)`;

/**
 * The type facts of a column or domain type: the element type for an array
 * (a base type of category `A` with an element type; a domain over an
 * array is not one), and the base type through domains with the label
 * `get_const_expr` gives its constants.
 * @ref https://www.postgresql.org/docs/18/catalog-pg-type.html
 */
function typeFacts(oid: string): string {
  // The aliases start with "tf_" so they never shadow the caller's.
  return `select
      tf_element.typname as "typeName",
      tf_element_schema.nspname as "typeSchema",
      tf_element.typtype as "typeType",
      tf_shape.array as "array",
      tf_base.typname as "baseName",
      tf_base_schema.nspname as "baseSchema",
      tf_base.typtype as "baseType",
      format_type(tf_base.oid, -1) as "baseSpelling"
    from pg_type tf_type
    cross join lateral (
      select tf_type.typtype = 'b' and tf_type.typcategory = 'A' and tf_type.typelem <> 0 as array
    ) tf_shape
    join pg_type tf_element on tf_element.oid = case when tf_shape.array then tf_type.typelem else tf_type.oid end
    join pg_namespace tf_element_schema on tf_element_schema.oid = tf_element.typnamespace
    join pg_type tf_base on tf_base.oid = coalesce(
      (select tf_domain.base from domain_base tf_domain where tf_domain.domain = tf_type.oid),
      tf_type.oid
    )
    join pg_namespace tf_base_schema on tf_base_schema.oid = tf_base.typnamespace
    where tf_type.oid = ${oid}`;
}

export const EXTENSIONS_QUERY: string = `select coalesce(json_agg(x.extname), '[]'::json)::text as data
from pg_extension x
join pg_namespace n on n.oid = x.extnamespace
where n.nspname = any($1::text[])`;

export const ENUMS_QUERY: string = `select coalesce(json_agg(json_build_object(
  'schema', n.nspname,
  'name', t.typname,
  'labels', (select coalesce(json_agg(l.enumlabel order by l.enumsortorder), '[]'::json) from pg_enum l where l.enumtypid = t.oid)
)), '[]'::json)::text as data
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
where t.typtype = 'e' and n.nspname = any($1::text[]) and ${notExtensionMember('pg_type', 't.oid')}`;

/**
 * Domains with their CHECK constraints. `deterministic` reads the collation
 * of the type the domain is declared over, not the domain's own: PostgreSQL
 * gives `VALUE` that type's collation, so a domain's CHECKs compare under it.
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/commands/typecmds.c (domainAddCheckConstraint: domVal->collation)
 */
export const DOMAINS_QUERY: string = `${DOMAIN_BASES}
select coalesce(json_agg(json_build_object(
  'schema', n.nspname,
  'name', t.typname,
  'typeName', f."typeName", 'typeSchema', f."typeSchema", 'typeType', f."typeType", 'array', f."array",
  'baseName', f."baseName", 'baseSchema', f."baseSchema", 'baseType', f."baseType", 'baseSpelling', f."baseSpelling",
  'sqlType', format_type(t.typbasetype, t.typtypmod),
  'typmod', t.typtypmod,
  'notNull', t.typnotnull,
  'default', pg_get_expr(t.typdefaultbin, 0),
  'collation', case when t.typcollation <> 0 and t.typcollation <> b.typcollation then co.collname end,
  'deterministic', bco.collisdeterministic,
  'comment', obj_description(t.oid, 'pg_type'),
  'constraints', (select coalesce(json_agg(json_build_object(
      'name', k.conname,
      'expression', pg_get_expr(k.conbin, 0),
      'validated', k.convalidated,
      'definition', pg_get_constraintdef(k.oid)
    )), '[]'::json)
    from pg_constraint k where k.contypid = t.oid and k.contype = 'c')
)), '[]'::json)::text as data
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
join pg_type b on b.oid = t.typbasetype
left join pg_collation co on co.oid = t.typcollation
left join pg_collation bco on bco.oid = b.typcollation
cross join lateral (${typeFacts('t.typbasetype')}) f
where t.typtype = 'd' and n.nspname = any($1::text[]) and ${notExtensionMember('pg_type', 't.oid')}`;

const COLUMNS = `select coalesce(json_agg(json_build_object(
    'name', a.attname,
    'position', a.attnum,
    'typeName', f."typeName", 'typeSchema', f."typeSchema", 'typeType', f."typeType", 'array', f."array",
    'baseName', f."baseName", 'baseSchema', f."baseSchema", 'baseType', f."baseType", 'baseSpelling', f."baseSpelling",
    'sqlType', format_type(a.atttypid, a.atttypmod),
    'typmod', a.atttypmod,
    'notNull', a.attnotnull,
    'identity', a.attidentity,
    'generated', a.attgenerated,
    'default', pg_get_expr(d.adbin, d.adrelid),
    'collation', case when a.attcollation <> 0 and a.attcollation <> ty.typcollation then co.collname end,
    'deterministic', co.collisdeterministic,
    'comment', col_description(a.attrelid, a.attnum)
  )), '[]'::json)
  from pg_attribute a
  join pg_type ty on ty.oid = a.atttypid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  left join pg_collation co on co.oid = a.attcollation
  cross join lateral (${typeFacts('a.atttypid')}) f
  where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped`;

/** Maps an `int2[]` of attribute numbers of `relation` to names, in order; zeros (expressions) drop out. */
function attributeNames(numbers: string, relation: string): string {
  return `(select coalesce(json_agg(a.attname order by u.position), '[]'::json)
    from unnest(${numbers}) with ordinality as u(attnum, position)
    join pg_attribute a on a.attrelid = ${relation} and a.attnum = u.attnum)`;
}

/**
 * The constraints declared on each table. A foreign key that references a
 * partitioned table also gets one clone per partition of that table, with
 * `conparentid` set and a name that differs between majors; pg_dump leaves
 * the clones out, and so does the catalog.
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/bin/pg_dump/pg_dump.c (getConstraints: "AND conparentid = 0")
 * @ref https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/commands/tablecmds.c (addFkConstraint names the clones)
 */
function constraints(version: number): string {
  const enforced = version >= ENFORCED_VERSION ? 'k.conenforced' : 'true';
  const nullsNotDistinct =
    version >= NULLS_NOT_DISTINCT_VERSION
      ? 'coalesce(ki.indnullsnotdistinct, false)'
      : 'false';
  return `select coalesce(json_agg(json_build_object(
    'name', k.conname,
    'type', k.contype,
    'columns', ${attributeNames('k.conkey', 'k.conrelid')},
    'referencedSchema', rn.nspname,
    'referencedTable', rc.relname,
    'referencedColumns', ${attributeNames('k.confkey', 'k.confrelid')},
    'onUpdate', k.confupdtype,
    'onDelete', k.confdeltype,
    'validated', k.convalidated,
    'enforced', ${enforced},
    'nullsNotDistinct', ${nullsNotDistinct},
    'expression', pg_get_expr(k.conbin, k.conrelid),
    'definition', pg_get_constraintdef(k.oid)
  )), '[]'::json)
  from pg_constraint k
  left join pg_class rc on rc.oid = k.confrelid
  left join pg_namespace rn on rn.oid = rc.relnamespace
  left join pg_index ki on ki.indexrelid = k.conindid and k.contype = 'u'
  where k.conrelid = c.oid and k.contype in ('p', 'u', 'f', 'c', 'x')
    and k.conparentid = 0`;
}

function indexes(version: number): string {
  const nullsNotDistinct =
    version >= NULLS_NOT_DISTINCT_VERSION ? 'i.indnullsnotdistinct' : 'false';
  return `select coalesce(json_agg(json_build_object(
    'name', ic.relname,
    'method', am.amname,
    'unique', i.indisunique,
    'primary', i.indisprimary,
    'nullsNotDistinct', ${nullsNotDistinct},
    'columns', (select json_agg(a.attname order by u.position)
      from unnest(i.indkey::int2[]) with ordinality as u(attnum, position)
      left join pg_attribute a on a.attrelid = i.indrelid and a.attnum = u.attnum
      where u.position <= i.indnkeyatts),
    'include', (select coalesce(json_agg(a.attname order by u.position), '[]'::json)
      from unnest(i.indkey::int2[]) with ordinality as u(attnum, position)
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = u.attnum
      where u.position > i.indnkeyatts),
    'predicate', pg_get_expr(i.indpred, i.indrelid),
    'definition', pg_get_indexdef(i.indexrelid)
  )), '[]'::json)
  from pg_index i
  join pg_class ic on ic.oid = i.indexrelid
  join pg_am am on am.oid = ic.relam
  where i.indrelid = c.oid`;
}

/** `polroles` holds 0 for the PUBLIC pseudo-role, which has no `pg_roles` row. */
const POLICIES = `select coalesce(json_agg(json_build_object(
    'name', p.polname,
    'command', p.polcmd,
    'permissive', p.polpermissive,
    'roles', (select coalesce(json_agg(case when r.id = 0 then 'public' else ro.rolname end), '[]'::json)
      from unnest(p.polroles) as r(id) left join pg_roles ro on ro.oid = r.id),
    'using', pg_get_expr(p.polqual, p.polrelid),
    'withCheck', pg_get_expr(p.polwithcheck, p.polrelid)
  )), '[]'::json)
  from pg_policy p where p.polrelid = c.oid`;

/** Ordinary and partitioned tables, partitions excluded, with everything they own nested. */
export function tablesQuery(version: number): string {
  return `${DOMAIN_BASES}
select coalesce(json_agg(json_build_object(
  'schema', n.nspname,
  'name', c.relname,
  'comment', obj_description(c.oid, 'pg_class'),
  'rowSecurity', c.relrowsecurity,
  'forceRowSecurity', c.relforcerowsecurity,
  'columns', (${COLUMNS}),
  'constraints', (${constraints(version)}),
  'indexes', (${indexes(version)}),
  'policies', (${POLICIES})
)), '[]'::json)::text as data
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p') and not c.relispartition and n.nspname = any($1::text[])
  and ${notExtensionMember('pg_class', 'c.oid')}`;
}
