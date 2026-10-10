// The extraction configuration of the PostgreSQL 18 schema (resource SPEC
// 15.4): NOT ENFORCED constraints, which PostgreSQL 14 cannot parse, so it
// replays into PGlite (PostgreSQL 18) only. `pg-catalog extract` run in this
// directory writes catalog.ts and public-catalog.ts; the suite runs
// `pg-catalog extract --check` here to prove they are current.
import { defineExtraction } from '@netvark/pg-catalog';

export default defineExtraction({
  migrations: 'migrations',
  database: { pglite: {} },
  out: {
    catalog: 'catalog.ts',
    public: {
      file: 'public-catalog.ts',
      tables: ['imported_contacts', 'owners'],
    },
  },
});
