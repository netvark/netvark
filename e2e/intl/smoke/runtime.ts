/**
 * The runtime a smoke entry runs on, read from its globals without a type
 * assertion: Bun's `Bun.version`, Deno's `Deno.version.deno`, and Node's
 * `process.versions.node`, which Bun and Deno define as well.
 * @ref https://bun.com/docs/runtime/bun-apis
 * @ref https://docs.deno.com/api/deno/~/Deno.version
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Deno's version, as `[major, minor, patch]`, or `undefined` on another runtime. */
export function denoVersion(): ReadonlyArray<number> | undefined {
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
