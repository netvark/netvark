import { describe, expect, it } from 'vitest';

import { fromRequest } from './request';

describe('fromRequest', () => {
  it('reads the method, the path without the query, and headers case-insensitively', () => {
    const request = fromRequest(
      new Request('https://api.example.com/orders/42?expand=items', {
        method: 'POST',
        headers: { 'X-Request-Id': 'req-1' },
      }),
    );
    expect(request.method).toBe('POST');
    expect(request.path).toBe('/orders/42');
    expect(request.header('x-request-id')).toBe('req-1');
    expect(request.header('X-REQUEST-ID')).toBe('req-1');
    expect(request.header('traceparent')).toBeUndefined();
  });
});
