import type { Kysely } from 'kysely';

import type { QueryEvent } from '@netvark/kysely-keyset';

import type { DB, Harness } from './support/db.ts';

/**
 * Cursors bound to the tenant (SPEC 6.1, ADR 0015): an organization-scoped
 * table where every query filters on `org_id` and passes the same
 * organization as the cursor context, the way a multi-tenant API would. A
 * cursor resumes inside the organization that issued it and is rejected
 * inside another before any query runs, even though the sort, filter, and
 * search are identical. Without a context it crosses over and seeks with
 * the other organization's values, which is what the binding prevents.
 * Runs on PGlite, and on the server `KEYSET_PG_URL` names when set.
 */
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDefineKeyset, InvalidCursorError } from '@netvark/kysely-keyset';

import { databases } from './support/db.ts';
import { SECRET } from './support/keysets.ts';

interface ProjectsTable {
  id: string;
  org_id: string;
  name: string;
  created_at: string | Date;
}

type TenantDB = DB & { projects: ProjectsTable };

const ORGS = ['acme', 'globex'] as const;
type Org = (typeof ORGS)[number];
const PER_ORG = 5;
const PAGE_SIZE = 2;

/** Five projects per organization with interleaved creation times. */
const PROJECTS: ReadonlyArray<ProjectsTable> = ORGS.flatMap((org, o) =>
  Array.from({ length: PER_ORG }, (_, i) => ({
    id: `00000000-0000-4000-8000-0000000${String(o)}${String(i).padStart(4, '0')}`,
    org_id: org,
    name: `${org} ${String(i)}`,
    created_at: new Date(
      Date.UTC(2026, 0, 1, 0, i * ORGS.length + o),
    ).toISOString(),
  })),
);

/** An organization's project ids, newest first: what `-createdAt` must produce. */
function expected(org: Org): Array<string> {
  return PROJECTS.filter((project) => project.org_id === org)
    .toSorted((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at)),
    )
    .map((project) => project.id);
}

const defineKeyset = createDefineKeyset<TenantDB>({
  cursor: { secret: SECRET },
  page: { default: PAGE_SIZE, max: 10 },
});

const projects = defineKeyset({
  table: 'projects',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    name: { column: 'name', type: 'text' },
    createdAt: { column: 'created_at', type: 'timestamptz' },
  },
  sort: { default: ['-createdAt'] },
});

describe.each(databases())('%s: cursors bound to the tenant', (_name, open) => {
  let harness: Harness;
  let db: Kysely<TenantDB>;
  beforeAll(async () => {
    harness = await open();
    db = harness.db.$extendTables<{ projects: ProjectsTable }>();
    await sql`create table projects (
      id uuid primary key,
      org_id text not null,
      name text not null,
      created_at timestamptz not null
    )`.execute(db);
    await db
      .insertInto('projects')
      .values([...PROJECTS])
      .execute();
  });
  afterAll(async () => {
    await harness.close();
  });

  /** One organization's rows, the scope every query of its API applies. */
  function rowsOf(org: Org) {
    return db.selectFrom('projects').where('org_id', '=', org).select('id');
  }

  /** One organization's view: its rows, and its id as the cursor context. */
  async function page(org: Org, after?: string, events?: Array<QueryEvent>) {
    return projects.paginate(
      rowsOf(org),
      { page: { after } },
      {
        context: { org },
        onQuery: (event) => {
          events?.push(event);
        },
      },
    );
  }

  it('walks every project of one organization with cursors bound to it', async () => {
    for (const org of ORGS) {
      const seen: Array<string> = [];
      let current = await page(org);
      seen.push(...current.rows.map((row) => row.id));
      while (current.next !== null) {
        current = await page(org, current.next);
        seen.push(...current.rows.map((row) => row.id));
      }
      expect(seen).toEqual(expected(org));
    }
  });

  it("rejects one organization's cursor inside another before any query runs", async () => {
    const acme = await page('acme');
    const events: Array<QueryEvent> = [];
    const error: unknown = await page('globex', acme.next ?? '', events).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(InvalidCursorError);
    expect(error).toMatchObject({ parameter: 'after', reason: 'context' });
    expect(events).toEqual([]);
  });

  it('fails closed when an endpoint forgets the context, or adds one later', async () => {
    const query = rowsOf('acme');
    const bound = await page('acme');
    await expect(
      projects.paginate(query, { page: { after: bound.next ?? '' } }),
    ).rejects.toMatchObject({ reason: 'context' });
    const unbound = await projects.paginate(query, {});
    await expect(page('acme', unbound.next ?? '')).rejects.toMatchObject({
      reason: 'context',
    });
  });

  it("without a context, a cursor crosses over and seeks with another organization's values", async () => {
    const acme = await projects.paginate(rowsOf('acme'), {});
    const crossed = await projects.paginate(rowsOf('globex'), {
      page: { after: acme.next ?? '' },
    });
    // Accepted: the globex page starts below acme's second project, so it
    // skips the globex projects created after it.
    const [, second] = expected('acme');
    const boundary = PROJECTS.find((project) => project.id === second);
    const globexOlder = expected('globex').filter((id) => {
      const project = PROJECTS.find((candidate) => candidate.id === id);
      return String(project?.created_at) < String(boundary?.created_at);
    });
    expect(crossed.rows.map((row) => row.id)).toEqual(
      globexOlder.slice(0, PAGE_SIZE),
    );
    expect(globexOlder.length).toBeLessThan(PER_ORG);
  });
});
