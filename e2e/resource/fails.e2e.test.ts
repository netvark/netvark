/**
 * Declarations that must not compile (resource SPEC 14, 15.4). `tsc`, run
 * as a consumer runs it against the built declarations, reports each
 * mistake in `fails/` at the line under its `// error:` marker, with the
 * SPEC's message, and nothing else: an error without a marker, a marker
 * without its error, and a message that lost its text all fail here.
 */
import type { Diagnostic, Marker } from './support/diagnostics';

import { beforeAll, describe, expect, it } from 'vitest';

import { parseDiagnostics, readMarkers } from './support/diagnostics';
import { FAILS_DIR, PACKAGE_DIR } from './support/paths';
import { binPath, runBin } from './support/run-bin';

let diagnostics: ReadonlyArray<Diagnostic>;
let markers: ReadonlyArray<Marker>;
let exitCode: number | null;

beforeAll(async () => {
  const tsc = await binPath('typescript', 'tsc');
  const run = await runBin(
    tsc,
    ['--noEmit', '--pretty', 'false', '-p', 'fails/tsconfig.json'],
    PACKAGE_DIR,
  );
  exitCode = run.code;
  diagnostics = parseDiagnostics(run.stdout);
  markers = await readMarkers(FAILS_DIR, 'fails/');
});

const FILES = [
  'definer.ts',
  'errors.ts',
  'fields.ts',
  'filters.ts',
  'names.ts',
  'not-enforced.ts',
  'options.ts',
  'relationships.ts',
  'rules.ts',
  'tables.ts',
  'validators.ts',
];

describe('fails/: declarations TypeScript refuses', () => {
  it('fails tsc, and every fails/ file has markers', () => {
    expect(exitCode).not.toBe(0);
    expect([...new Set(markers.map((marker) => marker.file))]).toEqual(
      FILES.map((file) => `fails/${file}`),
    );
  });

  it.each(FILES)(
    '%s: one error under each marker, carrying its text, and no other',
    (file) => {
      const path = `fails/${file}`;
      const expected = markers.filter((marker) => marker.file === path);
      const actual = diagnostics.filter(
        (diagnostic) => diagnostic.file === path,
      );
      expect(actual.map((diagnostic) => diagnostic.line)).toEqual(
        expected.map((marker) => marker.line),
      );
      for (const [index, marker] of expected.entries()) {
        expect(actual[index]?.text, `${path}:${String(marker.line)}`).toContain(
          marker.expected,
        );
      }
    },
  );

  it('reports no error outside fails/', () => {
    expect(
      diagnostics.filter((diagnostic) => !diagnostic.file.startsWith('fails/')),
    ).toEqual([]);
  });
});
