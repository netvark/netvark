import { describe, expect, it } from 'vitest';

import { fetchDouble } from './fetch-double';

describe('fetchDouble', () => {
  it('refuses a request it has no response for, and a last request before any', async () => {
    const double = fetchDouble();

    expect(() => double.last()).toThrow('no request was sent');
    await expect(
      double.fetch(new Request('https://api.example.test/')),
    ).rejects.toThrow('no response for request 1');
  });

  it('builds a response from the request when given a function', async () => {
    const double = fetchDouble((request) => new Response(request.method));

    const response = await double.fetch(
      new Request('https://api.example.test/', { method: 'PATCH' }),
    );

    expect(await response.text()).toBe('PATCH');
  });
});
