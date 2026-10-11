// The extraction configuration of the contacts application, as the
// application keeps it next to its migrations. `pg-catalog extract` run in
// this directory writes catalog.ts and public-catalog.ts; the suite runs
// `pg-catalog extract --check` here to prove they are current.
import { defineExtraction } from '@netvark/pg-catalog';

export default defineExtraction({
  migrations: 'migrations',
  database: { pglite: { extensions: ['pg_trgm', 'btree_gist', 'citext'] } },
  schemas: ['public', 'audit'],
  out: {
    catalog: 'catalog.ts',
    public: {
      file: 'public-catalog.ts',
      tables: [
        'calls',
        'contacts',
        'contact_phones',
        'import_batches',
        'import_rows',
        'meetings',
        'notes',
        'organizations',
      ],
    },
  },
});
