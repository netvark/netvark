/**
 * Runtime-neutral assertion helpers for the smoke checks: the response and
 * dispatch types every runtime shares, and the checks over a Problem Details
 * response that every scenario repeats. This module imports nothing, for the
 * same reason as `checks.ts`.
 */

export interface ResponseLike {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export interface DispatchInit {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export type Dispatch = (
  path: string,
  init?: DispatchInit,
) => Promise<ResponseLike>;

export type Json = Record<string, unknown>;

export const PROBLEM_JSON = 'application/problem+json';

class CheckFailure extends Error {
  override readonly name: string = 'CheckFailure';
}

export function check(condition: boolean, message: string): void {
  if (!condition) {
    throw new CheckFailure(message);
  }
}

export function equal(actual: unknown, expected: unknown, what: string): void {
  check(
    actual === expected,
    `${what}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
  );
}

function isJson(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function object(value: unknown, what: string): Json {
  if (!isJson(value)) {
    throw new CheckFailure(`${what} is not a JSON object`);
  }
  return value;
}

export function list(value: unknown, what: string): Array<unknown> {
  if (!Array.isArray(value)) {
    throw new CheckFailure(`${what} is not an array`);
  }
  return value;
}

export async function json(res: ResponseLike): Promise<Json> {
  const parsed: unknown = JSON.parse(await res.text());
  return object(parsed, 'body');
}

export function member(value: unknown, key: string): unknown {
  return isJson(value) ? value[key] : undefined;
}

/** Fetches a Problem Details response and checks the parts every one shares. */
export async function problem(
  dispatch: Dispatch,
  path: string,
  status: number,
  init?: DispatchInit,
): Promise<{ res: ResponseLike; body: Json }> {
  const res = await dispatch(path, init);
  equal(res.status, status, `${path} status`);
  equal(res.headers.get('content-type'), PROBLEM_JSON, `${path} content-type`);
  equal(res.headers.get('cache-control'), 'no-store', `${path} Cache-Control`);
  const body = await json(res);
  equal(res.headers.get('x-error-id'), body['id'], `${path} X-Error-Id`);
  return { res, body };
}
