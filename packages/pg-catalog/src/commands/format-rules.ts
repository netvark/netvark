/**
 * `formatRules(report)` (SPEC 10.3): a `checkRules` report as text for
 * people. Like `formatDiff`'s, the text may change between minor versions.
 * @packageDocumentation
 */
import type { RuleCaseReport, RulesReport } from '../oracle/report';

import { plural, showShort } from './show-value';

function caseLines(report: RuleCaseReport): ReadonlyArray<string> {
  if (report.problem !== null) {
    return [report.subject, `  could not run: ${report.problem}`];
  }
  return [
    report.subject,
    ...report.disagreements.map(
      ({ label, value, reason }) => `  ${label} ${showShort(value)}: ${reason}`,
    ),
  ];
}

function summary(report: RulesReport): string {
  const fixtures = report.cases.reduce((sum, each) => sum + each.fixtures, 0);
  const tried = `${plural(report.cases.length, 'case')}, ${plural(fixtures, 'fixture')}`;
  const disagreements = report.cases.reduce(
    (sum, each) => sum + each.disagreements.length,
    0,
  );
  const unrun = report.cases.filter((each) => each.problem !== null).length;
  const found = [
    ...(disagreements === 0 ? [] : [plural(disagreements, 'disagreement')]),
    ...(unrun === 0 ? [] : [`${plural(unrun, 'case')} could not run`]),
  ];
  return `${tried}: ${found.length === 0 ? 'no disagreements' : found.join(', ')}`;
}

/**
 * The summary line, `<n> cases, <m> fixtures: no disagreements` or with
 * the disagreements and the cases that could not run counted; then, after
 * a blank line, each such case's subject followed by one line per
 * disagreement, two spaces in: the fixture's label, its value (JSON where
 * JSON writes it as itself, cut after 60 characters), and how they
 * disagree; then one warning line per unused public table.
 */
export function formatRules(report: RulesReport): string {
  const failing = report.cases.filter(
    (each) => each.problem !== null || each.disagreements.length > 0,
  );
  const warnings = report.unusedTables.map(
    (table) =>
      `warning: out.public.tables lists ${table}, which no declared resource reads`,
  );
  const sections = [
    [summary(report)],
    ...(failing.length === 0
      ? []
      : [failing.flatMap((each) => caseLines(each))]),
    ...(warnings.length === 0 ? [] : [warnings]),
  ];
  return sections.map((lines) => lines.join('\n')).join('\n\n');
}
