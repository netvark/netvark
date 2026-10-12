import { describe, expect, it } from 'vitest';

import {
  isCookieName,
  TIME_ZONE_COOKIE_MAX_AGE,
  timeZoneCookie,
  timeZoneFromCookie,
} from './cookie';

const NAME = 'TIME_ZONE';
const DAYS_400 = 400 * 24 * 60 * 60;

describe('timeZoneFromCookie (SPEC 4.3)', () => {
  it('reads the zone among other cookies, with or without spaces', () => {
    expect(timeZoneFromCookie('a=1; TIME_ZONE=Asia/Riyadh; b=2', NAME)).toBe(
      'Asia/Riyadh',
    );
    expect(timeZoneFromCookie('TIME_ZONE=Asia/Riyadh;b=2', NAME)).toBe(
      'Asia/Riyadh',
    );
    expect(timeZoneFromCookie(' flag ; TIME_ZONE = UTC ', NAME)).toBe('UTC');
  });

  it('reads the first pair named exactly the name', () => {
    expect(
      timeZoneFromCookie('TIME_ZONE=Asia/Riyadh; TIME_ZONE=UTC', NAME),
    ).toBe('Asia/Riyadh');
    expect(
      timeZoneFromCookie('time_zone=UTC; XTIME_ZONE=UTC; TIME_ZONEX=UTC', NAME),
    ).toBeUndefined();
  });

  it('unquotes a quoted value and decodes a percent-encoded one', () => {
    expect(timeZoneFromCookie('TIME_ZONE="Asia/Riyadh"', NAME)).toBe(
      'Asia/Riyadh',
    );
    expect(timeZoneFromCookie('TIME_ZONE=America%2FNew_York', NAME)).toBe(
      'America/New_York',
    );
  });

  it('is undefined without the cookie or when its value is not a time zone', () => {
    for (const header of [
      null,
      undefined,
      '',
      'other=UTC',
      'TIME_ZONE',
      'TIME_ZONE=',
      'TIME_ZONE=Mars/Olympus',
      'TIME_ZONE=%2B03%3A00',
      'TIME_ZONE=%E0%A4%A',
      'TIME_ZONE=UTC=UTC',
    ]) {
      expect(timeZoneFromCookie(header, NAME)).toBeUndefined();
    }
  });
});

describe('timeZoneCookie (SPEC 4.3)', () => {
  it("writes Paraglide's locale cookie attributes by default", () => {
    expect(TIME_ZONE_COOKIE_MAX_AGE).toBe(DAYS_400);
    expect(timeZoneCookie(' Asia/Riyadh ', { name: NAME })).toBe(
      'TIME_ZONE=Asia/Riyadh; Path=/; Max-Age=34560000',
    );
  });

  it('adds Domain, SameSite, and Secure when given', () => {
    expect(
      timeZoneCookie('UTC', {
        name: NAME,
        path: '/app',
        maxAge: 3600,
        domain: 'example.com',
        sameSite: 'Lax',
        secure: true,
      }),
    ).toBe(
      'TIME_ZONE=UTC; Path=/app; Max-Age=3600; Domain=example.com; SameSite=Lax; Secure',
    );
    expect(timeZoneCookie('UTC', { name: NAME, secure: false })).not.toContain(
      'Secure',
    );
  });

  it('writes a cookie the reader reads back', () => {
    const [pair = ''] = timeZoneCookie('America/Argentina/Buenos_Aires', {
      name: NAME,
    }).split(';');
    expect(timeZoneFromCookie(pair, NAME)).toBe(
      'America/Argentina/Buenos_Aires',
    );
  });

  it('refuses a zone that is not one, without echoing it', () => {
    for (const zone of ['+03:00', 'Mars/Olympus', '']) {
      expect(() => timeZoneCookie(zone, { name: NAME })).toThrow(
        new TypeError('timeZoneCookie: zone is not a time zone'),
      );
    }
  });

  it('refuses a name that is not a token', () => {
    for (const name of ['', 'TIME ZONE', 'tz;x', 'tz=x', 'zoné', '"tz"']) {
      expect(() => timeZoneCookie('UTC', { name })).toThrow(
        new TypeError('timeZoneCookie: name is not a cookie name'),
      );
    }
    expect(isCookieName("!#$%&'*+-.^_`|~09AZaz")).toBe(true);
  });

  it('refuses a path or domain outside av-octet', () => {
    for (const value of ['/;x', '/\n', '/\u0000', '/é', '/\u007F']) {
      expect(() => timeZoneCookie('UTC', { name: NAME, path: value })).toThrow(
        'timeZoneCookie: path holds',
      );
      expect(() =>
        timeZoneCookie('UTC', { name: NAME, domain: value }),
      ).toThrow('timeZoneCookie: domain holds');
    }
  });

  it('refuses a maxAge that is not a positive integer', () => {
    for (const maxAge of [0, -1, 1.5, Number.NaN, Infinity]) {
      expect(() => timeZoneCookie('UTC', { name: NAME, maxAge })).toThrow(
        new RangeError('timeZoneCookie: maxAge is not a positive integer'),
      );
    }
  });

  it('refuses a sameSite that is not Strict, Lax, or None', () => {
    expect(() =>
      timeZoneCookie('UTC', { name: NAME, sameSite: 'lax' as never }),
    ).toThrow(
      new TypeError('timeZoneCookie: sameSite is not Strict, Lax, or None'),
    );
  });

  it('refuses a cookie a user agent would drop (RFC 6265bis-22, 5.7 steps 19 to 21)', () => {
    const dropped = [
      { name: NAME, sameSite: 'None' },
      { name: '__Secure-tz' },
      { name: '__host-tz', path: '/' },
      { name: '__Host-tz', secure: true, domain: 'example.com' },
      { name: '__Host-tz', secure: true, path: '/app' },
    ] as const;
    for (const options of dropped) {
      expect(() => timeZoneCookie('UTC', options)).toThrow(TypeError);
    }
    expect(
      timeZoneCookie('UTC', {
        name: '__Host-tz',
        secure: true,
        sameSite: 'None',
      }),
    ).toBe('__Host-tz=UTC; Path=/; Max-Age=34560000; SameSite=None; Secure');
  });
});
