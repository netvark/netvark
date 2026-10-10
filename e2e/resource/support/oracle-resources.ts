/**
 * The oracle's declarations (resource SPEC 15.3): every column of the
 * oracle's tables as a writable field, and one relationship per key type,
 * so `schema.update` and `linkage.update` hold a schema for each.
 */
import { createDeclareResource } from '@netvark/resource-core';

import { publicCatalog } from '../fixtures/oracle/public-catalog.ts';

export { publicCatalog };

const declareResource = createDeclareResource({ catalog: publicCatalog });
const rw = { access: 'readWrite' } as const;
const key = { operations: ['get'], fields: {} } as const;

export const Texts = declareResource('texts', {
  operations: ['update'],
  fields: {
    plain: rw,
    short: rw,
    padded: rw,
    letter: rw,
    loose: rw,
    sized: rw,
    nonempty: rw,
    word: rw,
    state: rw,
    code: rw,
    status: rw,
    tags: rw,
    codes: rw,
  },
});

export const Numbers = declareResource('numbers', {
  operations: ['update'],
  fields: {
    small: rw,
    regular: rw,
    big: rw,
    single: rw,
    double: rw,
    amount: rw,
    whole: rw,
    exact: rw,
    ranged: rw,
    floor: rw,
    scaled: rw,
    share: rw,
    price: rw,
    pct: rw,
    counts: rw,
  },
});

export const Others = declareResource('others', {
  operations: ['update'],
  fields: {
    key: rw,
    day: rw,
    local_at: rw,
    local_ms: rw,
    at: rw,
    at_s: rw,
    flag: rw,
    data: rw,
    datab: rw,
    feeling: rw,
    calm: rw,
    days: rw,
    keys: rw,
  },
});

const KeySmallints = declareResource('key_smallints', key);
const KeyBigints = declareResource('key_bigints', key);
const KeyNumerics = declareResource('key_numerics', key);
const KeyReals = declareResource('key_reals', key);
const KeyDoubles = declareResource('key_doubles', key);
const KeyBooleans = declareResource('key_booleans', key);
const KeyTexts = declareResource('key_texts', key);
const KeyUuids = declareResource('key_uuids', key);
const KeyDates = declareResource('key_dates', key);
const KeyInstants = declareResource('key_instants', key);
const KeyMoods = declareResource('key_moods', key);

export const Links = declareResource('links', {
  operations: ['update'],
  fields: {},
  relationships: {
    smallint_id: { target: () => KeySmallints, access: 'readWrite' },
    bigint_id: { target: () => KeyBigints, access: 'readWrite' },
    numeric_id: { target: () => KeyNumerics, access: 'readWrite' },
    real_id: { target: () => KeyReals, access: 'readWrite' },
    double_id: { target: () => KeyDoubles, access: 'readWrite' },
    boolean_id: { target: () => KeyBooleans, access: 'readWrite' },
    text_id: { target: () => KeyTexts, access: 'readWrite' },
    uuid_id: { target: () => KeyUuids, access: 'readWrite' },
    date_id: { target: () => KeyDates, access: 'readWrite' },
    instant_id: { target: () => KeyInstants, access: 'readWrite' },
    mood_id: { target: () => KeyMoods, access: 'readWrite' },
  },
});
