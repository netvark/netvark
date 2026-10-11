/** formatRules (SPEC 10.3): the exact text of each kind of report. */
import type { RuleCaseReport, RulesReport } from '../oracle/report';

import { describe, expect, it } from 'vitest';

import { formatRules } from './format-rules';

function passed(subject: string, fixtures: number): RuleCaseReport {
  return { subject, kind: 'field', fixtures, problem: null, disagreements: [] };
}

const CLEAN: RulesReport = {
  cases: [passed('contacts.name', 12), passed('contacts.email', 9)],
  unusedTables: [],
};

describe('formatRules (SPEC 10.3)', () => {
  it('summarizes a report without disagreements in one line', () => {
    expect(formatRules(CLEAN)).toBe('2 cases, 21 fixtures: no disagreements');
  });

  it('counts in the singular', () => {
    expect(
      formatRules({ cases: [passed('contacts.name', 1)], unusedTables: [] }),
    ).toBe('1 case, 1 fixture: no disagreements');
  });

  it('lists each failing case with its disagreements, then the cases that could not run', () => {
    const report: RulesReport = {
      cases: [
        passed('contacts.name', 12),
        {
          subject: 'contacts CHECK contacts_code_check (validator code)',
          kind: 'validator',
          fixtures: 3,
          problem: null,
          disagreements: [
            {
              label: 'reject[0]',
              value: 'a_b',
              reason: 'the validator refuses it; the database accepts it',
            },
            {
              label: 'accept[1]',
              value: { team: null },
              reason:
                'the validator accepts it; the database refuses it (23514 contacts_code_check)',
            },
          ],
        },
        {
          subject: 'contacts.slots (codec slots)',
          kind: 'codec',
          fixtures: 2,
          problem: 'the replayed database has no column contacts.slots',
          disagreements: [],
        },
      ],
      unusedTables: [],
    };
    expect(formatRules(report))
      .toBe(`3 cases, 17 fixtures: 2 disagreements, 1 case could not run

contacts CHECK contacts_code_check (validator code)
  reject[0] "a_b": the validator refuses it; the database accepts it
  accept[1] {"team":null}: the validator accepts it; the database refuses it (23514 contacts_code_check)
contacts.slots (codec slots)
  could not run: the replayed database has no column contacts.slots`);
  });

  it('shows control characters escaped, a value JSON cannot write as itself in JavaScript notation, and a long value cut after 60 code points', () => {
    const long = '\u{1F600}'.repeat(70);
    const report: RulesReport = {
      cases: [
        {
          ...passed('contacts.name', 3),
          disagreements: [
            { label: 'nul', value: 'a\u0000b', reason: 'r' },
            { label: 'big', value: 2n ** 64n, reason: 'r' },
            { label: 'long', value: long, reason: 'r' },
            { label: 'none', value: undefined, reason: 'r' },
          ],
        },
      ],
      unusedTables: [],
    };
    expect(formatRules(report).split('\n').slice(3)).toEqual([
      '  nul "a\\u0000b": r',
      '  big 18446744073709551616n: r',
      `  long "${'\u{1F600}'.repeat(59)}… (70 characters): r`,
      '  none undefined: r',
    ]);
  });

  it('ends with a warning for each public table no declared resource reads', () => {
    expect(formatRules({ ...CLEAN, unusedTables: ['audit_log', 'notes'] }))
      .toBe(`2 cases, 21 fixtures: no disagreements

warning: out.public.tables lists audit_log, which no declared resource reads
warning: out.public.tables lists notes, which no declared resource reads`);
  });
});
