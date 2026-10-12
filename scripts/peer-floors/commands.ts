/**
 * The two pnpm commands a floor job is made of, read from one line of a
 * step's `run`: `pnpm --filter <package>... add --save-dev <peer>@<version>...`
 * puts the filtered packages on a version of each peer, and
 * `pnpm --filter <package>... run <script>` (or `test`) runs a script of
 * each. A line that is neither, or that filters nothing, is no floor step.
 * @ref https://pnpm.io/filtering
 * @ref https://pnpm.io/cli/add
 * @ref https://pnpm.io/cli/run
 * @packageDocumentation
 */

/** A package and the version an `add` installs; `*` when the spec names none. */
export interface PeerSpec {
  readonly name: string;
  readonly version: string;
}

export type PnpmCommand =
  | {
      readonly kind: 'add';
      readonly filters: ReadonlyArray<string>;
      readonly specs: ReadonlyArray<PeerSpec>;
    }
  | {
      readonly kind: 'run';
      readonly filters: ReadonlyArray<string>;
      readonly script: string;
    };

const FILTER_PREFIX = '--filter=';
const QUOTES = /^["']|["']$/gu;

/** `name@version`; a scoped name keeps its leading `@`. */
export function peerSpec(text: string): PeerSpec {
  const at = text.lastIndexOf('@');
  return at > 0
    ? { name: text.slice(0, at), version: text.slice(at + 1) }
    : { name: text, version: '*' };
}

function splitFilters(tokens: ReadonlyArray<string>): {
  readonly filters: Array<string>;
  readonly words: Array<string>;
} {
  const filters: Array<string> = [];
  const words: Array<string> = [];
  const queue = [...tokens];
  for (let token = queue.shift(); token !== undefined; token = queue.shift()) {
    if (token === '--filter' || token === '-F') {
      filters.push((queue.shift() ?? '').replace(QUOTES, ''));
    } else if (token.startsWith(FILTER_PREFIX)) {
      filters.push(token.slice(FILTER_PREFIX.length).replace(QUOTES, ''));
    } else if (!token.startsWith('-')) {
      words.push(token);
    }
  }
  return { filters, words };
}

/** The floor step `line` runs, if it is one. */
export function parseCommand(line: string): PnpmCommand | undefined {
  const [program, ...tokens] = line.trim().split(/\s+/u);
  if (program !== 'pnpm') {
    return undefined;
  }
  const { filters, words } = splitFilters(tokens);
  const [command, ...args] = words;
  if (filters.length === 0) {
    return undefined;
  }
  if (command === 'add' && args.length > 0) {
    return { kind: 'add', filters, specs: args.map((arg) => peerSpec(arg)) };
  }
  if (command === 'run' && args[0] !== undefined) {
    return { kind: 'run', filters, script: args[0] };
  }
  return command === 'test'
    ? { kind: 'run', filters, script: 'test' }
    : undefined;
}
