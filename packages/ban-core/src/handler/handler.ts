import type { BanError } from '../core/ban-error';
import type { BanCore } from '../core/internal';
import type {
  Ban,
  BanHandler,
  Catalog,
  ErrorMapper,
  ErrorReport,
  ErrorRequest,
  HandlerOptions,
} from '../core/types';
import type { RenderOptions } from '../formats/context';

import { BanError as BanErrorClass } from '../core/ban-error';
import {
  DEFAULT_ERROR_ID_HEADER,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_REQUEST_ID_HEADER,
  UNEXPECTED_DETAIL,
} from '../internal/constants';
import { safeStringify } from '../internal/json';
import { capBody } from './body-cap';
import {
  assertHeaderName,
  assertHeadersInit,
  lastResortHeaders,
  mergeHeaders,
} from './headers';
import { buildReport } from './report';
import { readRequestId } from './request-id';
import { resolveThrown } from './resolve';
import { parseTraceparent } from './traceparent';

const SERVER_ERROR = 500;

interface Trace {
  readonly traceId: string | undefined;
  readonly spanId: string | undefined;
}

function readTrace<TContext>(
  request: ErrorRequest,
  ctx: TContext,
  override: ((ctx: TContext) => string | undefined) | undefined,
): Trace {
  if (override !== undefined) {
    return { traceId: override(ctx), spanId: undefined };
  }
  const parsed = parseTraceparent(request.header('traceparent'));
  return { traceId: parsed?.traceId, spanId: parsed?.parentId };
}

/**
 * Calls `onReport` once and swallows anything it throws: a broken sink must
 * not turn a resolved 404 into a 500, and there is nothing left to report to.
 */
async function report<TContext>(
  onReport: HandlerOptions<TContext>['onReport'],
  input: ErrorReport,
  ctx: TContext,
): Promise<void> {
  if (onReport === undefined) {
    return;
  }
  try {
    await onReport(input, ctx);
  } catch {
    // Intentionally ignored; see the doc comment.
  }
}

/**
 * Last resort when rendering, mapping, or the format itself failed
 * (SPEC 6.4). Tries the format once more with a bare 500, then a hand-built
 * JSON body.
 */
async function fallback<TContext, TErrors extends Catalog>(
  failure: unknown,
  thrown: unknown,
  request: ErrorRequest,
  ctx: TContext,
  core: BanCore,
  options: HandlerOptions<TContext, TErrors>,
): Promise<Response> {
  let error: BanError;
  let response: Response;
  try {
    error = core.unexpected(thrown);
    const rendered = core.render(error);
    response = new Response(safeStringify(rendered.body), {
      status: SERVER_ERROR,
      headers: mergeHeaders(
        options.headers,
        rendered.headers,
        options.errorIdHeader ?? DEFAULT_ERROR_ID_HEADER,
        error.id,
      ),
    });
  } catch {
    error = new BanErrorClass({
      status: SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      title: 'Internal Server Error',
      detail: UNEXPECTED_DETAIL,
      cause: thrown,
    });
    // The header merge still applies so the id reaches the header (SPEC 10.2).
    response = new Response(
      safeStringify({
        status: SERVER_ERROR,
        title: error.title,
        detail: error.detail,
        id: error.id,
      }),
      {
        status: SERVER_ERROR,
        headers: lastResortHeaders(
          options.headers,
          options.errorIdHeader ?? DEFAULT_ERROR_ID_HEADER,
          error.id,
        ),
      },
    );
  }
  await report(
    options.onReport,
    buildReport({
      error,
      thrown,
      handled: false,
      handlerFailure: failure,
      requestId: undefined,
      traceId: undefined,
      spanId: undefined,
      method: request.method,
      path: request.path,
    }),
    ctx,
  );
  return response;
}

/**
 * Builds `ban.handler()` (SPEC 6). Throws `TypeError` for a header option
 * `Headers` would reject; the returned handler resolves to a `Response` for
 * every input and never rejects (ADR 0002).
 */
export function createHandler<TErrors extends Catalog>(
  core: BanCore,
  ban: Ban<TErrors>,
  instanceMap: ErrorMapper<TErrors> | undefined,
): <TContext = void>(
  options?: HandlerOptions<TContext, TErrors>,
) => BanHandler<TContext> {
  return <TContext = void>(
    options: HandlerOptions<TContext, TErrors> = {},
  ): BanHandler<TContext> => {
    const map = options.map ?? instanceMap;
    const includeStack = options.includeStack ?? false;
    const requestIdHeader =
      options.requestIdHeader ?? DEFAULT_REQUEST_ID_HEADER;
    const errorIdHeader = options.errorIdHeader ?? DEFAULT_ERROR_ID_HEADER;
    const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    assertHeaderName('requestIdHeader', requestIdHeader);
    assertHeaderName('errorIdHeader', errorIdHeader);
    assertHeadersInit(options.headers);

    return async (
      thrown: unknown,
      request: ErrorRequest,
      ctx: TContext,
    ): Promise<Response> => {
      try {
        const requestId =
          options.requestId === undefined
            ? readRequestId(
                requestIdHeader === false
                  ? undefined
                  : request.header(requestIdHeader),
              )
            : options.requestId(ctx);
        const trace = readTrace(request, ctx, options.traceId);
        const { error, handled } = resolveThrown(thrown, ban, core, map);
        const renderOptions: RenderOptions = {
          requestId,
          traceId: trace.traceId,
          instance: request.path,
          method: request.method,
          includeStack,
        };
        const rendered = core.render(error, renderOptions);
        const transform = (body: unknown): unknown =>
          options.transform === undefined
            ? body
            : options.transform(body, error, ctx);
        const text = capBody(
          transform(rendered.body),
          error,
          renderOptions,
          core.render,
          maxBodyBytes,
          transform,
        );
        const headers = mergeHeaders(
          options.headers,
          rendered.headers,
          errorIdHeader,
          error.id,
        );
        await report(
          options.onReport,
          buildReport({
            error,
            thrown,
            handled,
            handlerFailure: undefined,
            requestId,
            traceId: trace.traceId,
            spanId: trace.spanId,
            method: request.method,
            path: request.path,
          }),
          ctx,
        );
        return new Response(text, { status: error.status, headers });
      } catch (failure) {
        return fallback(failure, thrown, request, ctx, core, options);
      }
    };
  };
}
