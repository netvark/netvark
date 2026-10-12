/**
 * The published advisories that affect a floor (root ADR 0007), from
 * GitHub's advisory database. Each distinct peer and floor is one query per
 * advisory type, `affects=<peer>@<floor>`, which GitHub matches against the
 * advisories' vulnerable ranges; the pages follow the `Link` header's `next`
 * cursor. The types are the default `reviewed` and `malware`, which the
 * default leaves out and which marks a compromised release. Withdrawn
 * advisories do not count.
 * @ref https://docs.github.com/en/rest/security-advisories/global-advisories#list-global-security-advisories
 * @ref https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api
 * @packageDocumentation
 */
import type { PeerFloor } from './floors.ts';

import { satisfies } from 'semver';

/** An advisory that affects a floor, and the release that fixes it, if any. */
export interface Advisory {
  readonly id: string;
  readonly summary: string;
  readonly url: string;
  readonly patched: string | undefined;
}

/** One page of a listing: the parsed body and the next page's URL. */
interface AdvisoryPage {
  readonly body: unknown;
  readonly next: string | undefined;
}

export type FetchPage = (url: string) => Promise<AdvisoryPage>;

const API = 'https://api.github.com/advisories';
const TYPES = ['reviewed', 'malware'] as const;
const PER_PAGE = '100';
const API_VERSION = '2022-11-28';
const NEXT = /<(?<url>[^>]+)>;\s*rel="next"/u;

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function text(value: object, key: string): string | undefined {
  const field: unknown = Reflect.get(value, key);
  return typeof field === 'string' ? field : undefined;
}

/** The URL of the next page in a `Link` header, if there is one. */
export function nextLink(header: string | null): string | undefined {
  return header === null ? undefined : NEXT.exec(header)?.groups?.['url'];
}

/** The release that fixes `advisory` for `peer` at `floor`: the patched version of the range that holds it. */
function patchedFor(
  advisory: object,
  peer: string,
  floor: string,
): string | undefined {
  const vulnerabilities: unknown = Reflect.get(advisory, 'vulnerabilities');
  const entries: ReadonlyArray<unknown> = Array.isArray(vulnerabilities)
    ? vulnerabilities
    : [];
  for (const vulnerability of entries) {
    if (!isObject(vulnerability)) {
      continue;
    }
    const target: unknown = Reflect.get(vulnerability, 'package');
    const range = text(vulnerability, 'vulnerable_version_range');
    if (
      isObject(target) &&
      text(target, 'name') === peer &&
      range !== undefined &&
      satisfies(floor, range.replaceAll(',', ' '))
    ) {
      return text(vulnerability, 'first_patched_version');
    }
  }
  return undefined;
}

/** The advisories on one page of a listing for `peer` at `floor`, withdrawn ones left out. */
export function advisoriesOf(
  body: unknown,
  peer: string,
  floor: string,
): Array<Advisory> {
  if (!Array.isArray(body)) {
    throw new TypeError(
      "GitHub's advisory database answered something other than a list",
    );
  }
  return body.flatMap((advisory: unknown) => {
    if (!isObject(advisory) || text(advisory, 'withdrawn_at') !== undefined) {
      return [];
    }
    const id = text(advisory, 'ghsa_id');
    if (id === undefined) {
      throw new TypeError(
        "GitHub's advisory database answered an advisory without an id",
      );
    }
    return [
      {
        id,
        summary: text(advisory, 'summary') ?? '',
        url:
          text(advisory, 'html_url') ?? `https://github.com/advisories/${id}`,
        patched: patchedFor(advisory, peer, floor),
      },
    ];
  });
}

/** The advisories that affect each distinct `<peer>@<floor>`, keyed by it. */
export async function floorAdvisories(
  floors: ReadonlyArray<PeerFloor>,
  fetchPage: FetchPage,
): Promise<Map<string, Array<Advisory>>> {
  const found = new Map<string, Array<Advisory>>();
  for (const { peer, floor } of floors) {
    const target = `${peer}@${floor}`;
    if (found.has(target)) {
      continue;
    }
    const advisories: Array<Advisory> = [];
    for (const type of TYPES) {
      const query = new URLSearchParams({
        ecosystem: 'npm',
        type,
        affects: target,
        per_page: PER_PAGE,
      });
      for (
        let url: string | undefined = `${API}?${query.toString()}`;
        url !== undefined;
      ) {
        const page = await fetchPage(url);
        advisories.push(...advisoriesOf(page.body, peer, floor));
        url = page.next;
      }
    }
    found.set(target, advisories);
  }
  return found;
}

/**
 * Pages of GitHub's REST API through `fetchImpl`, with `token` when there is
 * one: an unauthenticated client gets a lower rate limit. A status other
 * than 2xx is an `Error` naming the status.
 * @ref https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
 */
export function githubPages(
  fetchImpl: typeof fetch,
  token: string | undefined,
): FetchPage {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': API_VERSION,
  };
  if (token !== undefined && token !== '') {
    headers['authorization'] = `Bearer ${token}`;
  }
  return async (url) => {
    const response = await fetchImpl(url, { headers });
    if (!response.ok) {
      throw new Error(`GitHub's advisory database answered ${response.status}`);
    }
    const body: unknown = await response.json();
    return { body, next: nextLink(response.headers.get('link')) };
  };
}
