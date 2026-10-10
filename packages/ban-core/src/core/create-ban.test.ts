import { describe, expect, it } from 'vitest';

import { plain } from '../formats/plain';
import { FACTORY_NAMES } from './catalog';
import { createBan } from './create-ban';

describe('createBan', () => {
  it('exposes a factory for every built-in name', () => {
    const ban = createBan();
    for (const name of Object.keys(FACTORY_NAMES) as Array<
      keyof typeof FACTORY_NAMES
    >) {
      expect(typeof ban[name]).toBe('function');
      expect(ban[name]().code).toBe(FACTORY_NAMES[name]);
    }
  });

  it('adds custom factories and catalog entries', () => {
    const ban = createBan({
      errors: { ORDER_CONFLICT: { status: 409, title: 'Order Conflict' } },
    });
    const error = ban.ORDER_CONFLICT('Already shipped');
    expect(error.status).toBe(409);
    expect(error.code).toBe('ORDER_CONFLICT');
    expect(error.title).toBe('Order Conflict');
    expect(ban.catalog.ORDER_CONFLICT.description).toBe('Order Conflict');
    expect(ban.error('ORDER_CONFLICT').code).toBe('ORDER_CONFLICT');
  });

  it('lets a custom entry replace a built-in and keeps the camelCase factory', () => {
    const ban = createBan({
      errors: { NOT_FOUND: { status: 404, title: 'Nope', code: 'nope' } },
    });
    expect(ban.notFound().title).toBe('Nope');
    expect(ban.notFound().code).toBe('nope');
    expect(ban.from(new Error('x')).status).toBe(500);
  });

  it('throws TypeError for reserved keys at runtime', () => {
    expect(() =>
      createBan({ errors: { handler: { status: 400 } } as never }),
    ).toThrow(TypeError);
    expect(() =>
      createBan({ errors: { notFound: { status: 404 } } as never }),
    ).toThrow(TypeError);
  });

  it('honors validationKey and rejects unknown ones', () => {
    const ban = createBan({ validationKey: 'BAD_REQUEST' });
    expect(ban.validation([], { location: 'body' }).status).toBe(400);
    expect(() => createBan({ validationKey: 'NOPE' as never })).toThrow(
      RangeError,
    );
  });

  it('uses the given format and id generator', () => {
    let n = 0;
    const ban = createBan({
      format: plain(),
      id: () => {
        n += 1;
        return `id-${n}`;
      },
    });
    expect(ban.format.name).toBe('plain');
    expect(ban.notFound().id).toBe('id-1');
    expect(ban.custom({ status: 418 }).id).toBe('id-2');
  });

  it('error() throws RangeError for unknown keys', () => {
    expect(() => createBan().error('NOPE' as never)).toThrow(RangeError);
  });

  it('custom() fills title from the reason phrase and code with CUSTOM', () => {
    const ban = createBan();
    const known = ban.custom({ status: 410, detail: 'd' });
    expect(known.title).toBe('Gone');
    expect(known.code).toBe('CUSTOM');
    expect(known.definition).toBeUndefined();
    const unknown = ban.custom({ status: 499 as never, code: 'X' });
    expect(unknown.title).toBe('Error');
    expect(unknown.code).toBe('X');
  });

  it('fromStatus() picks the primary entry, a custom entry, or CUSTOM', () => {
    const ban = createBan({
      errors: {
        CLIENT_CLOSED: { status: 499 as never, title: 'Client Closed' },
      },
    });
    const conflict = ban.fromStatus(409, {
      detail: 'taken',
      headers: { 'X-A': '1' },
    });
    expect(conflict.code).toBe('CONFLICT');
    expect(conflict.detail).toBe('taken');
    expect(conflict.headers.get('x-a')).toBe('1');
    expect(ban.fromStatus(400).code).toBe('BAD_REQUEST');
    expect(ban.fromStatus(422).code).toBe('UNPROCESSABLE_CONTENT');
    expect(ban.fromStatus(499 as never).code).toBe('CLIENT_CLOSED');
    const custom = ban.fromStatus(477 as never, { detail: 'd' });
    expect(custom.code).toBe('CUSTOM');
    expect(custom.title).toBe('Error');
    expect(custom.status).toBe(477);
    expect(custom.detail).toBe('d');
  });

  it('render() produces the format body with the content type', () => {
    const ban = createBan();
    const rendered = ban.render(ban.notFound('x'), { instance: '/a' });
    expect(rendered.status).toBe(404);
    expect(rendered.headers.get('content-type')).toBe(
      'application/problem+json',
    );
    expect(rendered.body).toMatchObject({
      status: 404,
      detail: 'x',
      instance: '/a',
    });
  });
});
