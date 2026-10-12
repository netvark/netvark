/**
 * In-process entry for Bun and Deno: the runtime under test hosts the app and
 * `app.request()` drives it, so every subpath is loaded and executed by that
 * runtime, the client's included through `/client-checks`. Each resolves
 * `@netvark/hono-jsonapi`, `@netvark/jsonapi-core`, and
 * `@netvark/jsonapi-client` through `node_modules` the way Node does; Deno 2
 * does so because `package.json` puts it in manual `node_modules` mode.
 * @ref https://bun.com/docs/runtime/modules
 * @ref https://docs.deno.com/runtime/fundamentals/node/#control-node_modules
 */
import type { Dispatch } from './checks.ts';

import { app } from './app.ts';
import { clientChecks, report, runChecks } from './checks.ts';

const dispatch: Dispatch = async (path, init) => app.request(path, init);
report(await runChecks(dispatch));
report(await clientChecks(dispatch), '@netvark/jsonapi-client');
