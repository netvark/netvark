/**
 * workerd entry: a module worker whose fetch handler runs the neutral, the
 * server, the openapi, the route, the model, and the form checks and
 * answers with the result as JSON.
 * @ref https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/
 */
import { neutralChecks } from './checks.ts';
import { formChecks } from './form-checks.ts';
import { openapiChecks } from './openapi-checks.ts';
import { runChecks } from './report.ts';
import { routeChecks } from './route-checks.ts';
import { serverChecks } from './server-checks.ts';
import { uiChecks } from './ui-checks.ts';

export default {
  async fetch(request: Request): Promise<Response> {
    const agent = request.headers.get('user-agent') ?? 'workerd';
    return Response.json(
      await runChecks(agent, {
        ...neutralChecks,
        ...serverChecks,
        ...openapiChecks,
        ...routeChecks,
        ...uiChecks,
        ...formChecks,
      }),
    );
  },
};
