/**
 * `tsc --pretty false` output as data, and the `// error:` markers of the
 * `fails/` files: a marker names a text the diagnostic on the next line
 * must contain.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface Diagnostic {
  /** The file as tsc prints it, relative to the project directory. */
  readonly file: string;
  readonly line: number;
  /**
   * The message with its elaboration lines, joined by newlines, and with
   * the backslash TypeScript prints before a quote inside a string literal
   * type removed, so a message reads as the SPEC writes it.
   */
  readonly text: string;
}

export interface Marker {
  readonly file: string;
  readonly line: number;
  readonly expected: string;
}

const HEADER =
  /^(?<file>[^()\s][^()]*)\((?<line>\d+),\d+\): error TS\d+: (?<message>.*)$/u;
const MARKER = /^\s*\/\/ error: (?<expected>.+)$/u;

/** Splits tsc's output into diagnostics; an indented line continues the one above it. */
export function parseDiagnostics(output: string): ReadonlyArray<Diagnostic> {
  const diagnostics: Array<{
    file: string;
    line: number;
    lines: Array<string>;
  }> = [];
  for (const line of output.split('\n')) {
    const header = HEADER.exec(line)?.groups;
    if (header?.['file'] !== undefined) {
      diagnostics.push({
        file: header['file'],
        line: Number(header['line']),
        lines: [header['message'] ?? ''],
      });
    } else if (/^\s/u.test(line)) {
      diagnostics.at(-1)?.lines.push(line.trim());
    }
  }
  return diagnostics.map(({ file, line, lines }) => ({
    file,
    line,
    text: lines.join('\n').replaceAll('\\"', '"'),
  }));
}

/** The markers of every `.ts` file in `dir`, with `file` as `<prefix><name>`. */
export async function readMarkers(
  dir: string,
  prefix: string,
): Promise<ReadonlyArray<Marker>> {
  const markers: Array<Marker> = [];
  for (const name of (await readdir(dir))
    .filter((entry) => entry.endsWith('.ts'))
    .toSorted()) {
    const lines = (await readFile(join(dir, name), 'utf8')).split('\n');
    for (const [index, line] of lines.entries()) {
      const expected = MARKER.exec(line)?.groups?.['expected'];
      if (expected !== undefined) {
        // The marker is on line index + 1; its diagnostic on the next.
        markers.push({ file: `${prefix}${name}`, line: index + 2, expected });
      }
    }
  }
  return markers;
}
