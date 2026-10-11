// The extraction configuration of the oracle's schema (resource SPEC 15.3).
// `pg-catalog extract` run in this directory writes catalog.ts and
// public-catalog.ts; the suite runs `pg-catalog extract --check` here to
// prove they are current.
import { defineExtraction } from '@netvark/pg-catalog';

export default defineExtraction({
  migrations: 'migrations',
  database: { pglite: { extensions: ['citext'] } },
  out: {
    catalog: { file: 'catalog.ts', interface: 'OracleCatalog' },
    public: {
      file: 'public-catalog.ts',
      interface: 'OraclePublicCatalog',
      tables: [
        'key_amounts',
        'key_bigints',
        'key_booleans',
        'key_codes',
        'key_dates',
        'key_doubles',
        'key_instants',
        'key_integers',
        'key_locals',
        'key_moods',
        'key_names',
        'key_numerics',
        'key_reals',
        'key_smallints',
        'key_texts',
        'key_uuids',
        'key_wholes',
        'links',
        'numbers',
        'others',
        'texts',
      ],
    },
  },
});
