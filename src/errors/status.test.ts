import { describe, expect, it } from 'vitest';

import { isErrorStatusCode, reasonPhrase } from './status';

describe('isErrorStatusCode', () => {
  it('accepts registered 4xx and 5xx codes and nothing else', () => {
    expect(isErrorStatusCode(400)).toBe(true);
    expect(isErrorStatusCode(451)).toBe(true);
    expect(isErrorStatusCode(511)).toBe(true);
    expect(isErrorStatusCode(200)).toBe(false);
    expect(isErrorStatusCode(399)).toBe(false);
    expect(isErrorStatusCode(419)).toBe(false);
    expect(isErrorStatusCode(499)).toBe(false);
    expect(isErrorStatusCode(509)).toBe(false);
    expect(isErrorStatusCode(404.5)).toBe(false);
    expect(isErrorStatusCode(Number.NaN)).toBe(false);
  });

  it('is not fooled by Object.prototype members', () => {
    expect(isErrorStatusCode(Number('constructor'))).toBe(false);
  });
});

describe('reasonPhrase', () => {
  it('uses the RFC 9110 phrases, including the renamed 413 and 422', () => {
    expect(reasonPhrase(413)).toBe('Content Too Large');
    expect(reasonPhrase(422)).toBe('Unprocessable Content');
    expect(reasonPhrase(503)).toBe('Service Unavailable');
  });
});
