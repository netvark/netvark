// The extraction configuration of the oracle's schema (resource SPEC 15.3).
// `pg-catalog extract` run in this directory writes catalog.ts and
// public-catalog.ts; the suite runs `pg-catalog extract --check` here to
// prove they are current.
import { defineExtraction } from '@netvark/pg-catalog';

export default defineExtraction({
  migrations: 'migrations',
  database: { pglite: { extensions: ['citext'] } },
  out: {
    catalog: 'catalog.ts',
    public: {
      file: 'public-catalog.ts',
      tables: [
        'key_bigints',
        'key_booleans',
        'key_dates',
        'key_doubles',
        'key_instants',
        'key_moods',
        'key_numerics',
        'key_reals',
        'key_smallints',
        'key_texts',
        'key_uuids',
        'links',
        'numbers',
        'others',
        'texts',
      ],
    },
  },
});
