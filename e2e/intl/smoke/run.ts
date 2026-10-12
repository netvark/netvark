/**
 * In-process entry for Bun and Deno: the runtime under test loads the
 * package from `node_modules` the way Node does (Deno 2 does so because
 * `package.json` puts it in manual `node_modules` mode) and runs the
 * checks with its own `Intl`.
 * @ref https://bun.com/docs/runtime/modules
 * @ref https://docs.deno.com/runtime/fundamentals/node/#control-node_modules
 */
import { report, runChecks } from './checks.ts';
import { runtime } from './runtime.ts';

report(await runChecks(runtime()));
