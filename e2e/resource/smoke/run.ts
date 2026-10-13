/**
 * In-process entry for Bun and Deno: the runtime under test loads the
 * package from `node_modules` the way Node does (Deno 2 does so because
 * `package.json` puts it in manual `node_modules` mode) and runs the
 * neutral, the server, the openapi, the route, and the React model checks.
 * @ref https://bun.com/docs/runtime/modules
 * @ref https://docs.deno.com/runtime/fundamentals/node/#control-node_modules
 */
import { neutralChecks } from './checks.ts';
import { openapiChecks } from './openapi-checks.ts';
import { report, runChecks } from './report.ts';
import { routeChecks } from './route-checks.ts';
import { serverChecks } from './server-checks.ts';
import { uiChecks } from './ui-checks.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Reads a runtime's global, if present, without a type assertion. */
function global(name: string): unknown {
  return Reflect.get(globalThis, name);
}

function runtime(): string {
  const bun = global('Bun');
  if (isRecord(bun) && typeof bun['version'] === 'string') {
    return `Bun ${bun['version']}`;
  }
  const deno = global('Deno');
  const version = isRecord(deno) ? deno['version'] : undefined;
  if (isRecord(version) && typeof version['deno'] === 'string') {
    return `Deno ${version['deno']}`;
  }
  return 'unknown runtime';
}

report(
  await runChecks(runtime(), {
    ...neutralChecks,
    ...serverChecks,
    ...openapiChecks,
    ...routeChecks,
    ...uiChecks,
  }),
);
