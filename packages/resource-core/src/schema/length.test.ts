/**
 * The Zod floor (SPEC 15.6): `.min` and `.max` count code points from Zod
 * 4.5.0, as PostgreSQL's `char_length` and `varchar(n)` do; 4.4.3 counts
 * UTF-16 code units, so a character outside the Basic Multilingual Plane
 * counts twice. CI runs this file with `zod` 4.5.0 installed.
 * @ref https://github.com/colinhacks/zod/pull/6441
 * @ref https://www.postgresql.org/docs/18/datatype-character.html
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  catalogOf,
  column,
  table,
  untypedDeclare,
} from '../test-support/catalog-builder';
import { issuesOf, outputOf } from '../test-support/validation';

/** U+1F600, one code point and two UTF-16 code units. */
const GRINNING = '\u{1F600}';

const declare = untypedDeclare(
  catalogOf({
    marks: table(
      'marks',
      {
        id: column({ type: 'uuid', sqlType: 'uuid', nullable: false }),
        glyph: column({
          type: 'varchar',
          sqlType: 'character varying(1)',
          maxLength: 1,
        }),
        pair: column(),
      },
      {
        marks_pair_check: {
          kind: 'check',
          columns: ['pair'],
          rule: { kind: 'length', min: 2, max: null },
          enforced: true,
        },
      },
    ),
  }),
);
const Marks = declare('marks', {
  operations: ['update'],
  fields: { glyph: { access: 'readWrite' }, pair: { access: 'readWrite' } },
});

describe('lengths in code points (SPEC 6.1)', () => {
  it("counts U+1F600 once in Zod's own checks", () => {
    expect(GRINNING).toHaveLength(2);
    expect(z.string().max(1).safeParse(GRINNING).success).toBe(true);
    expect(z.string().min(2).safeParse(GRINNING).success).toBe(false);
  });

  it('takes U+1F600 for varchar(1) and refuses it for a minimum length of 2', () => {
    expect(outputOf(Marks.validate.update, { glyph: GRINNING })).toEqual({
      glyph: GRINNING,
    });
    expect(issuesOf(Marks.validate.update, { pair: GRINNING })).toEqual([
      { code: 'minLength', expected: '2', path: ['pair'] },
    ]);
    expect(
      outputOf(Marks.validate.update, { pair: `${GRINNING}${GRINNING}` }),
    ).toEqual({ pair: `${GRINNING}${GRINNING}` });
  });
});
