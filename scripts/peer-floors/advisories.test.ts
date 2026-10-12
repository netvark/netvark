import type { PeerFloor } from './floors.ts';

import { describe, expect, it } from 'vitest';

import {
  advisoriesOf,
  floorAdvisories,
  githubPages,
  nextLink,
} from './advisories.ts';

/** An advisory as GitHub's REST API lists it, the fields the audit reads. */
function advisory(
  id: string,
  vulnerabilities: Array<{
    name: string;
    range: string | null;
    patched: string | null;
  }>,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ghsa_id: id,
    summary: `summary of ${id}`,
    html_url: `https://github.com/advisories/${id}`,
    withdrawn_at: null,
    vulnerabilities: vulnerabilities.map(({ name, range, patched }) => ({
      package: { ecosystem: 'npm', name },
      vulnerable_version_range: range,
      first_patched_version: patched,
    })),
    ...fields,
  };
}

const DRIZZLE = advisory('GHSA-gpj5-g38j-94v9', [
  { name: 'drizzle-orm', range: '< 0.45.2', patched: '0.45.2' },
  {
    name: 'drizzle-orm',
    range: '>= 1.0.0-beta.2, < 1.0.0-beta.20',
    patched: '1.0.0-beta.20',
  },
]);

function floor(peer: string, version: string): PeerFloor {
  return { package: '@x/a', peer, range: `>=${version}`, floor: version };
}

/** A `fetch` that answers `response` and records each request's URL and headers. */
function recording(response: Response): {
  readonly fetchImpl: typeof fetch;
  readonly requests: Array<{ url: string; headers: Record<string, string> }>;
} {
  const requests: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetchImpl = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    await Promise.resolve();
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    requests.push({
      url,
      headers: { ...(init?.headers as Record<string, string>) },
    });
    return response;
  };
  return { fetchImpl, requests };
}

describe('nextLink', () => {
  it('reads the next cursor of a Link header', () => {
    expect(
      nextLink(
        '<https://api.github.com/advisories?before=a>; rel="prev", <https://api.github.com/advisories?after=b>; rel="next"',
      ),
    ).toBe('https://api.github.com/advisories?after=b');
    expect(
      nextLink('<https://api.github.com/advisories?before=a>; rel="prev"'),
    ).toBeUndefined();
    expect(nextLink(null)).toBeUndefined();
  });
});

describe('advisoriesOf', () => {
  it('names the fix of the vulnerable range that holds the floor', () => {
    expect(advisoriesOf([DRIZZLE], 'drizzle-orm', '0.45.1')).toEqual([
      {
        id: 'GHSA-gpj5-g38j-94v9',
        summary: 'summary of GHSA-gpj5-g38j-94v9',
        url: 'https://github.com/advisories/GHSA-gpj5-g38j-94v9',
        patched: '0.45.2',
      },
    ]);
  });

  it('reads a malware advisory on one release, which has no fix', () => {
    const malware = advisory('GHSA-2v46-p5h4-248w', [
      { name: 'chalk', range: '= 5.6.1', patched: null },
    ]);
    expect(advisoriesOf([malware], 'chalk', '5.6.1')).toMatchObject([
      { id: 'GHSA-2v46-p5h4-248w', patched: undefined },
    ]);
  });

  it('leaves out withdrawn advisories, and reads no fix from another package', () => {
    const withdrawn = advisory('GHSA-6623-4q32-82v8', [], {
      withdrawn_at: '2026-09-20T00:00:00Z',
    });
    const other = advisory(
      'GHSA-other',
      [{ name: 'hono-other', range: '< 5.0.0', patched: '5.0.0' }],
      {
        summary: undefined,
        html_url: undefined,
      },
    );
    expect(advisoriesOf([withdrawn, other], 'hono', '4.13.6')).toEqual([
      {
        id: 'GHSA-other',
        summary: '',
        url: 'https://github.com/advisories/GHSA-other',
        patched: undefined,
      },
    ]);
  });

  it('reads no fix from an advisory whose vulnerabilities are missing or malformed', () => {
    const missing = advisory('GHSA-missing', [], {
      vulnerabilities: undefined,
    });
    const malformed = advisory('GHSA-malformed', [], {
      vulnerabilities: [
        null,
        { package: 'hono', vulnerable_version_range: '< 5.0.0' },
      ],
    });
    expect(
      advisoriesOf([missing, malformed], 'hono', '4.13.6').map(
        ({ patched }) => patched,
      ),
    ).toEqual([undefined, undefined]);
  });

  it('refuses a page that is not a list, or an advisory without an id', () => {
    expect(() =>
      advisoriesOf({ message: 'Not Found' }, 'hono', '4.13.7'),
    ).toThrow(TypeError);
    expect(() => advisoriesOf([{ summary: 'x' }], 'hono', '4.13.7')).toThrow(
      new TypeError(
        "GitHub's advisory database answered an advisory without an id",
      ),
    );
  });
});

describe('floorAdvisories', () => {
  it('queries each distinct floor once per type and follows the next pages', async () => {
    const urls: Array<string> = [];
    const pages = new Map<string, { body: unknown; next: string | undefined }>([
      [
        'https://api.github.com/advisories?after=2',
        { body: [DRIZZLE], next: undefined },
      ],
    ]);
    const found = await floorAdvisories(
      [
        floor('drizzle-orm', '0.45.1'),
        floor('drizzle-orm', '0.45.1'),
        floor('hono', '4.13.7'),
      ],
      async (url) => {
        await Promise.resolve();
        urls.push(url);
        const first =
          url.includes('type=reviewed') && url.includes('drizzle-orm');
        return (
          pages.get(url) ?? {
            body: [],
            next: first
              ? 'https://api.github.com/advisories?after=2'
              : undefined,
          }
        );
      },
    );
    expect(urls).toEqual([
      'https://api.github.com/advisories?ecosystem=npm&type=reviewed&affects=drizzle-orm%400.45.1&per_page=100',
      'https://api.github.com/advisories?after=2',
      'https://api.github.com/advisories?ecosystem=npm&type=malware&affects=drizzle-orm%400.45.1&per_page=100',
      'https://api.github.com/advisories?ecosystem=npm&type=reviewed&affects=hono%404.13.7&per_page=100',
      'https://api.github.com/advisories?ecosystem=npm&type=malware&affects=hono%404.13.7&per_page=100',
    ]);
    expect([...found.keys()]).toEqual(['drizzle-orm@0.45.1', 'hono@4.13.7']);
    expect(found.get('drizzle-orm@0.45.1')?.map(({ id }) => id)).toEqual([
      'GHSA-gpj5-g38j-94v9',
    ]);
    expect(found.get('hono@4.13.7')).toEqual([]);
  });
});

describe('githubPages', () => {
  it('asks for the REST API version with the token, and reads the body and the next page', async () => {
    const { fetchImpl, requests } = recording(
      new Response(JSON.stringify([]), {
        headers: {
          link: '<https://api.github.com/advisories?after=c>; rel="next"',
        },
      }),
    );
    await expect(
      githubPages(fetchImpl, 'secret')('https://api.github.com/advisories'),
    ).resolves.toEqual({
      body: [],
      next: 'https://api.github.com/advisories?after=c',
    });
    expect(requests).toEqual([
      {
        url: 'https://api.github.com/advisories',
        headers: {
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          authorization: 'Bearer secret',
        },
      },
    ]);
  });

  it('sends no authorization without a token', async () => {
    for (const token of [undefined, '']) {
      const { fetchImpl, requests } = recording(new Response('[]'));
      await githubPages(fetchImpl, token)('https://api.github.com/advisories');
      expect(requests[0]?.headers).not.toHaveProperty('authorization');
    }
  });

  it('fails on a status other than 2xx, naming the status alone', async () => {
    const { fetchImpl } = recording(
      new Response('{"message":"rate limited"}', { status: 403 }),
    );
    await expect(
      githubPages(fetchImpl, 'secret')('https://api.github.com/advisories'),
    ).rejects.toThrow(new Error("GitHub's advisory database answered 403"));
  });
});
