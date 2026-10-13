/**
 * The runtime a smoke entry runs on, read from its globals without a type
 * assertion: Bun's `Bun.version`, Deno's `Deno.version.deno`, and Node's
 * `process.versions.node`, which Bun and Deno define as well. On Deno before
 * 2.6.10 a compile never lets the process exit (SPEC 8), so the entries that
 * compile refuse to start there.
 * @ref https://bun.com/docs/runtime/bun-apis
 * @ref https://docs.deno.com/api/deno/~/Deno.version
 * @ref https://github.com/denoland/deno/pull/32161
 */

const DENO_FLOOR = [2, 6, 10];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Deno's version, as `[major, minor, patch]`, or `undefined` on another runtime. */
function denoVersion(): ReadonlyArray<number> | undefined {
  const deno: unknown = Reflect.get(globalThis, 'Deno');
  const version = isRecord(deno) ? deno['version'] : undefined;
  return isRecord(version) && typeof version['deno'] === 'string'
    ? version['deno'].split('.').map(Number)
    : undefined;
}

/** The runtime's name and version, such as `Bun 1.4.2`; Bun and Deno before Node. */
export function runtime(): string {
  const bun: unknown = Reflect.get(globalThis, 'Bun');
  if (isRecord(bun) && typeof bun['version'] === 'string') {
    return `Bun ${bun['version']}`;
  }
  const deno = denoVersion();
  if (deno !== undefined) {
    return `Deno ${deno.join('.')}`;
  }
  const node: unknown = Reflect.get(globalThis, 'process');
  const versions = isRecord(node) ? node['versions'] : undefined;
  if (isRecord(versions) && typeof versions['node'] === 'string') {
    return `Node ${versions['node']}`;
  }
  return 'unknown runtime';
}

function belowFloor(version: ReadonlyArray<number>): boolean {
  for (const [index, floor] of DENO_FLOOR.entries()) {
    const part = version[index] ?? 0;
    if (part !== floor) {
      return part < floor;
    }
  }
  return false;
}

/** Throws on Deno before 2.6.10, where the smoke `task` would never exit. */
export function requireDenoFloor(task: string): void {
  const deno = denoVersion();
  if (deno !== undefined && belowFloor(deno)) {
    throw new Error(
      `the smoke ${task} needs Deno ${DENO_FLOOR.join('.')} or later, not ${deno.join('.')}`,
    );
  }
}
