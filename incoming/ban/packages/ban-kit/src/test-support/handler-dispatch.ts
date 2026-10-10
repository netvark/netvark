import type {
  Ban,
  Catalog,
  ErrorReport,
  ErrorRequest,
  HandlerOptions,
} from '../core/types';

export interface Outcome {
  readonly status: number;
  readonly headers: Headers;
  readonly body: Record<string, unknown>;
  readonly text: string;
  readonly report: ErrorReport;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** An `ErrorRequest` for tests: `GET /` plus the given headers. */
export function fakeRequest(
  headers: Readonly<Record<string, string>> = {},
  method = 'GET',
  path = '/',
): ErrorRequest {
  const lookup = new Headers(headers);
  return {
    method,
    path,
    header: (name) => lookup.get(name) ?? undefined,
  };
}

/** Hands `thrown` to a fresh handler and returns what came back. */
export async function dispatch<TErrors extends Catalog>(
  ban: Ban<TErrors>,
  thrown: unknown,
  options: HandlerOptions<void, TErrors> = {},
  request: ErrorRequest = fakeRequest(),
): Promise<Outcome> {
  const reports: Array<ErrorReport> = [];
  const handle = ban.handler({
    ...options,
    onReport: async (report, ctx) => {
      reports.push(report);
      await options.onReport?.(report, ctx);
    },
  });
  const res = await handle(thrown, request);
  const text = await res.text();
  const body: unknown = JSON.parse(text);
  if (!isRecord(body) || reports[0] === undefined) {
    throw new Error('unexpected response');
  }
  return {
    status: res.status,
    headers: res.headers,
    body,
    text,
    report: reports[0],
  };
}
