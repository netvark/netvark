/**
 * Runs code inside Paraglide's request context, as a server-rendered
 * page's code runs: `paraglideMiddleware` resolves the locale from
 * `Accept-Language` and holds it in `AsyncLocalStorage` while the handler
 * runs, so a message function called there reads that locale (resource
 * ADR 0014).
 * @ref https://paraglidejs.com/server-side-rendering
 * @packageDocumentation
 */
import { paraglideMiddleware } from '../localization/paraglide/server.js';

const NO_CONTENT = 204;

/** What `run` returns when it runs in the locale a request in `language` resolves to. */
export async function inLocale<TResult>(
  language: string,
  run: () => TResult,
): Promise<TResult> {
  const request = new Request('http://localhost/', {
    headers: { 'Accept-Language': language },
  });
  let ran: { readonly value: TResult } | undefined;
  await paraglideMiddleware(request, () => {
    ran = { value: run() };
    return new Response(null, { status: NO_CONTENT });
  });
  if (ran === undefined) {
    throw new Error('paraglideMiddleware did not run the handler');
  }
  return ran.value;
}
