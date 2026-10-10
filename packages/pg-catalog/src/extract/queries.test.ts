import { describe, expect, it } from 'vitest';

import { tablesQuery } from './queries';

// The live queries run against PGlite (PostgreSQL 18) in read-*.test.ts and
// against PostgreSQL 14 when CATALOG_PG_URL is set; these pin which columns
// each major is asked for, since a column a major lacks fails the query.
describe('tablesQuery: version fragments (SPEC 7.2)', () => {
  it('asks PostgreSQL 14 for neither indnullsnotdistinct nor conenforced', () => {
    const sql = tablesQuery(140_019);
    expect(sql).not.toContain('indnullsnotdistinct');
    expect(sql).not.toContain('conenforced');
    expect(sql).toContain("'enforced', true");
    expect(sql).toContain("'nullsNotDistinct', false");
  });

  it('reads indnullsnotdistinct from PostgreSQL 15', () => {
    const sql = tablesQuery(150_000);
    expect(sql).toContain('coalesce(ki.indnullsnotdistinct, false)');
    expect(sql).toContain("'nullsNotDistinct', i.indnullsnotdistinct");
    expect(sql).not.toContain('conenforced');
  });

  it('reads conenforced from PostgreSQL 18', () => {
    expect(tablesQuery(180_000)).toContain("'enforced', k.conenforced");
  });
});
