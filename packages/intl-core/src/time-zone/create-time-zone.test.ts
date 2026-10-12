import { AsyncLocalStorage } from 'node:async_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createIntl } from '../intl/create-intl';
import { createTimeZone, DEFAULT_TIME_ZONE } from './create-time-zone';

const NAME = 'TIME_ZONE';

function request(cookie?: string): Request {
  return new Request(
    'https://app.example/',
    cookie === undefined ? {} : { headers: { cookie } },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createTimeZone options (SPEC 4.4, 5)', () => {
  it.each([
    ['options that are not an object', undefined, 'options is not an object'],
    [
      'a cookie name that is not a token',
      { cookieName: 'TIME ZONE' },
      'cookieName is not a cookie name',
    ],
    [
      'a fallback offset',
      { cookieName: NAME, fallback: '+03:00' },
      'fallback is not a time zone',
    ],
    [
      'an unknown fallback',
      { cookieName: NAME, fallback: 'Mars/Olympus' },
      'fallback is not a time zone',
    ],
    [
      'a scope without run',
      { cookieName: NAME, scope: { getStore: () => 'UTC' } },
      'scope lacks getStore or run',
    ],
  ])('refuses %s with a TypeError', (_, options, message) => {
    expect(() => createTimeZone(options as never)).toThrow(
      new TypeError(`createTimeZone: ${message}`),
    );
  });

  it('falls back to UTC by default, and to a given zone trimmed', () => {
    expect(DEFAULT_TIME_ZONE).toBe('UTC');
    expect(createTimeZone({ cookieName: NAME }).fromRequest(request())).toBe(
      'UTC',
    );
    expect(
      createTimeZone({
        cookieName: NAME,
        fallback: ' Asia/Riyadh ',
      }).fromRequest(request()),
    ).toBe('Asia/Riyadh');
  });
});

describe('a resolver on a server (SPEC 4.4)', () => {
  it('reads the zone of a request, and the fallback without a usable cookie', () => {
    const timeZone = createTimeZone({ cookieName: NAME });
    expect(timeZone.fromRequest(request('a=1; TIME_ZONE=Asia/Riyadh'))).toBe(
      'Asia/Riyadh',
    );
    expect(timeZone.fromRequest(request('TIME_ZONE=+03:00'))).toBe('UTC');
    expect(timeZone.fromRequest(request())).toBe('UTC');
  });

  it('answers the active request inside run and the fallback outside it', () => {
    const timeZone = createTimeZone({
      cookieName: NAME,
      scope: new AsyncLocalStorage<string>(),
    });
    expect(
      timeZone.run(request('TIME_ZONE=Asia/Riyadh'), () => timeZone.get()),
    ).toBe('Asia/Riyadh');
    expect(timeZone.get()).toBe('UTC');
  });

  it('keeps each concurrent request in its own zone across awaits', async () => {
    const timeZone = createTimeZone({ cookieName: NAME });
    timeZone.useScope(new AsyncLocalStorage<string>());
    const render = async (cookie: string, delayMs: number) =>
      timeZone.run(request(cookie), async () => {
        const before = timeZone.get();
        await sleep(delayMs);
        return [before, timeZone.get()];
      });
    await expect(
      Promise.all([
        render('TIME_ZONE=Asia/Riyadh', 20),
        render('TIME_ZONE=America/Los_Angeles', 5),
      ]),
    ).resolves.toEqual([
      ['Asia/Riyadh', 'Asia/Riyadh'],
      ['America/Los_Angeles', 'America/Los_Angeles'],
    ]);
  });

  it('refuses run without a scope, and a scope useScope cannot use', () => {
    const timeZone = createTimeZone({ cookieName: NAME });
    expect(() => timeZone.run(request(), () => 1)).toThrow(
      new TypeError(
        'TimeZoneResolver.run: the resolver has no scope; call useScope first',
      ),
    );
    expect(() => {
      timeZone.useScope({} as never);
    }).toThrow(
      new TypeError('TimeZoneResolver.useScope: scope lacks getStore or run'),
    );
  });

  it('replaces the scope with useScope', () => {
    const first = new AsyncLocalStorage<string>();
    const second = new AsyncLocalStorage<string>();
    const timeZone = createTimeZone({ cookieName: NAME, scope: first });
    timeZone.useScope(second);
    second.run('Asia/Riyadh', () => {
      expect(timeZone.get()).toBe('Asia/Riyadh');
    });
    first.run('America/Los_Angeles', () => {
      expect(timeZone.get()).toBe('UTC');
    });
  });
});

describe('a resolver in a browser (SPEC 4.4, the pin)', () => {
  it("reads the document's cookie when it is created and keeps that zone", () => {
    const document = { cookie: 'TIME_ZONE=Asia/Riyadh' };
    vi.stubGlobal('document', document);
    const timeZone = createTimeZone({ cookieName: NAME });
    document.cookie = 'TIME_ZONE=America/Los_Angeles';
    expect(timeZone.get()).toBe('Asia/Riyadh');
    expect(createTimeZone({ cookieName: NAME }).get()).toBe(
      'America/Los_Angeles',
    );
  });

  it('keeps the fallback when the cookie is written after it is created', () => {
    const document = { cookie: '' };
    vi.stubGlobal('document', document);
    const timeZone = createTimeZone({
      cookieName: NAME,
      fallback: 'Asia/Riyadh',
    });
    document.cookie = 'TIME_ZONE=America/Los_Angeles';
    expect(timeZone.get()).toBe('Asia/Riyadh');
  });

  it('uses the fallback in a document whose cookie it cannot read', () => {
    // A sandboxed iframe has an opaque origin, and its cookie getter throws.
    vi.stubGlobal('document', {
      get cookie(): string {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    expect(createTimeZone({ cookieName: NAME }).get()).toBe('UTC');
    vi.stubGlobal('document', { cookie: undefined });
    expect(
      createTimeZone({ cookieName: NAME, fallback: 'Asia/Riyadh' }).get(),
    ).toBe('Asia/Riyadh');
  });

  it('answers an active request scope before the document', () => {
    vi.stubGlobal('document', { cookie: 'TIME_ZONE=Asia/Riyadh' });
    const scope = new AsyncLocalStorage<string>();
    const timeZone = createTimeZone({ cookieName: NAME, scope });
    expect(scope.run('America/Los_Angeles', () => timeZone.get())).toBe(
      'America/Los_Angeles',
    );
  });
});

describe('the resolver with createIntl', () => {
  it('is frozen, and its get serves as the formatters time zone getter', () => {
    const timeZone = createTimeZone({
      cookieName: NAME,
      scope: new AsyncLocalStorage<string>(),
    });
    expect(Object.isFrozen(timeZone)).toBe(true);
    const intl = createIntl({ locale: () => 'en', timeZone: timeZone.get });
    const instant = Date.UTC(2026, 9, 12, 21, 30);
    const day = (): string => intl.date(instant, { day: 'numeric' });
    expect(timeZone.run(request('TIME_ZONE=Asia/Riyadh'), day)).toBe('13');
    expect(day()).toBe('12');
  });
});
