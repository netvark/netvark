import { describe, expect, it, vi } from 'vitest';

import { detectTimeZone, toTimeZone } from './to-time-zone';

describe('toTimeZone (SPEC 4.1)', () => {
  it('accepts an IANA name the runtime knows, trimmed and as written', () => {
    expect(toTimeZone('Asia/Riyadh')).toBe('Asia/Riyadh');
    expect(toTimeZone('  America/Argentina/Buenos_Aires\t')).toBe(
      'America/Argentina/Buenos_Aires',
    );
    expect(toTimeZone('UTC')).toBe('UTC');
    expect(toTimeZone('Etc/GMT+5')).toBe('Etc/GMT+5');
  });

  it('keeps a name as written where the engine would canonicalize it', () => {
    expect(toTimeZone('Europe/Kyiv')).toBe('Europe/Kyiv');
    expect(toTimeZone('US/Pacific')).toBe('US/Pacific');
    expect(toTimeZone('asia/riyadh')).toBe('asia/riyadh');
  });

  it('refuses a UTC offset with either sign, U+2212 MINUS SIGN included', () => {
    for (const offset of ['+03:00', '-05:00', '\u221203:00', '+0300']) {
      expect(toTimeZone(offset)).toBeUndefined();
    }
  });

  it('refuses a name the runtime does not know', () => {
    for (const name of ['Mars/Olympus', 'Asia/Riyadh;', 'Asia/Riyadh UTC']) {
      expect(toTimeZone(name)).toBeUndefined();
    }
  });

  it('refuses a value that is not a non-empty string', () => {
    for (const value of [undefined, null, '', '   ', 3, {}, ['UTC']]) {
      expect(toTimeZone(value)).toBeUndefined();
    }
  });
});

describe('detectTimeZone (SPEC 4.2)', () => {
  it('is the zone the runtime reports', () => {
    expect(detectTimeZone()).toBe(
      new Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  });

  it('is undefined when the runtime reports an offset', () => {
    const DateTimeFormat = Intl.DateTimeFormat;
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementationOnce(
      class extends DateTimeFormat {
        public constructor() {
          super('en', { timeZone: '+03:00' });
        }
      },
    );
    expect(detectTimeZone()).toBeUndefined();
  });
});
