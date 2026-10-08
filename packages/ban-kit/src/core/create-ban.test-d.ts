import type { BanError } from './ban-error';
import type { Ban, EmptyCatalog, ErrorRequest, Factory } from './types';

import { describe, expectTypeOf, it } from 'vitest';

import { createBan } from './create-ban';

interface RequestContext {
  readonly user: string;
}
declare const request: ErrorRequest;

describe('createBan types', () => {
  it('returns built-in factories plus custom ones', () => {
    const ban = createBan({ errors: { ORDER_CONFLICT: { status: 409 } } });
    expectTypeOf(ban.notFound).toEqualTypeOf<Factory>();
    expectTypeOf(ban.ORDER_CONFLICT).toEqualTypeOf<Factory>();
    expectTypeOf(ban.ORDER_CONFLICT()).toEqualTypeOf<BanError>();
    expectTypeOf(createBan()).toEqualTypeOf<Ban<EmptyCatalog>>();
  });

  it('accepts only known keys in error() and validationKey', () => {
    const ban = createBan({ errors: { ORDER_CONFLICT: { status: 409 } } });
    ban.error('ORDER_CONFLICT');
    ban.error('NOT_FOUND');
    // @ts-expect-error unknown key is rejected
    ban.error('NOPE');
    createBan({ errors: { A: { status: 400 } }, validationKey: 'A' });
    // @ts-expect-error unknown validation key is rejected
    createBan({ validationKey: 'NOPE' });
  });

  it('fixes code and title through the catalog (ADR 0011)', () => {
    const ban = createBan();
    // @ts-expect-error code is set by the catalog entry, not per call
    ban.notFound({ code: 'ORDER_MISSING' });
    // @ts-expect-error title is set by the catalog entry, not per call
    ban.error('NOT_FOUND', { title: 'Nope' });
    // custom() has no catalog entry and no schema, so both are free.
    ban.custom({ status: 410, code: 'REMOVED', title: 'Removed' });
  });

  it('rejects reserved keys', () => {
    // @ts-expect-error handler is an instance member
    createBan({ errors: { handler: { status: 400 } } });
    // @ts-expect-error notFound is a built-in factory name
    createBan({ errors: { notFound: { status: 404 } } });
  });

  it('types the handler context and lets a void context be omitted', () => {
    const ban = createBan();
    const typed = ban.handler<RequestContext>({
      requestId: (ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<RequestContext>();
        return ctx.user;
      },
      onReport: (_report, ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<RequestContext>();
      },
    });
    expectTypeOf(typed).parameter(2).toEqualTypeOf<RequestContext>();
    expectTypeOf(typed).returns.resolves.toEqualTypeOf<Response>();
    const bare = ban.handler();
    void bare(new Error('x'), request);
    // @ts-expect-error the context is required once declared
    void typed(new Error('x'), request);
  });

  it('types adopt with the instance it belongs to', () => {
    createBan({
      errors: { TEAPOT: { status: 418 } },
      adopt: (value, ban) => (value === 'teapot' ? ban.TEAPOT() : undefined),
    });
    // @ts-expect-error adopt returns a BanError or undefined
    createBan({ adopt: () => ({ status: 400 }) });
  });

  it('accepts error statuses only in custom() and fromStatus()', () => {
    const ban = createBan();
    ban.custom({ status: 418 });
    ban.fromStatus(503);
    // @ts-expect-error 200 is not an error status
    ban.custom({ status: 200 });
    // @ts-expect-error 302 is not an error status
    ban.fromStatus(302);
  });
});
