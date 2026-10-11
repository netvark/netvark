import { describe, expect, it } from 'vitest';
import { safeParse } from 'zod/v4/core';

import { idMeta, valueMeta } from '../meta/value-meta';
import { idSchema } from '../schema/id-schema';
import { levelSchema } from '../schema/value-schema';
import { compileSchema } from '../test-support/openapi-ajv';
import {
  KEY_SPECS,
  MOOD_CATALOG,
  VALUE_SPECS,
} from '../test-support/value-specs';
import { idFixtures } from '../testing/id-boundaries';
import { valueFixtures } from '../testing/value-boundaries';
import { withNull, wireSchema } from './value-schema';

/**
 * What the schemas leave to the server, by fixture label (the module doc's
 * list); the schemas refuse every other fixture the server refuses. A
 * space for `T` passes Ajv's `date-time`, as RFC 3339 5.6 lets readers
 * allow.
 */
const UNSTATED: ReadonlyArray<RegExp> = [
  /U\+0000|unpaired surrogate/u,
  /negative zero/u,
  /(?:minimum, minus one|maximum, plus one|one step (?:above|below))$|^zero$/u,
  /(?:131072 integer|16383 fraction) digits, plus one/u,
  /float4/u,
  /year zero|leap second|largest offset|in UTC/u,
  /space for T/u,
];

function isUnstated(label: string): boolean {
  return UNSTATED.some((pattern) => pattern.test(label));
}

describe('wireSchema against the Zod schemas', () => {
  it.each(VALUE_SPECS)(
    'admits every boundary value of %s the server accepts, and null where nullable',
    (_, spec) => {
      const fixtures = [
        ...valueFixtures(spec, MOOD_CATALOG),
        { value: null, label: 'null' },
      ];
      for (const nullable of [false, true]) {
        const zod = levelSchema(spec, { nullable, validators: false });
        const schema = wireSchema(valueMeta(spec));
        const validate = compileSchema(nullable ? withNull(schema) : schema);
        const refused = fixtures.filter(
          ({ value }) => safeParse(zod, value).success && !validate(value),
        );
        expect(refused.map(({ label }) => label)).toEqual([]);
      }
    },
  );

  it.each(VALUE_SPECS)(
    'refuses the boundary values of %s the server refuses, but for what it cannot state',
    (_, spec) => {
      const zod = levelSchema(spec, { nullable: false, validators: false });
      const validate = compileSchema(wireSchema(valueMeta(spec)));
      const admitted = valueFixtures(spec, MOOD_CATALOG).filter(
        ({ value }) => !safeParse(zod, value).success && validate(value),
      );
      expect(
        admitted
          .map(({ label }) => label)
          .filter((label) => !isUnstated(label)),
      ).toEqual([]);
    },
  );

  it.each(KEY_SPECS)(
    'refuses the ids of %s the server refuses, but for what it cannot state',
    (_, spec) => {
      const zod = idSchema(spec, 'id');
      const validate = compileSchema(wireSchema(idMeta(spec)));
      const admitted = idFixtures(spec, MOOD_CATALOG).filter(
        ({ value }) => !safeParse(zod, value).success && validate(value),
      );
      expect(
        admitted
          .map(({ label }) => label)
          .filter((label) => !isUnstated(label)),
      ).toEqual([]);
    },
  );

  it.each(KEY_SPECS)('admits every id of %s the server accepts', (_, spec) => {
    const zod = idSchema(spec, 'id');
    const validate = compileSchema(wireSchema(idMeta(spec)));
    const refused = idFixtures(spec, MOOD_CATALOG).filter(
      ({ value }) => safeParse(zod, value).success && !validate(value),
    );
    expect(refused.map(({ label }) => label)).toEqual([]);
  });
});
