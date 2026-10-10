import type { RunningServer } from './server.ts';

import { afterAll, beforeAll } from 'vitest';

import { createBlog } from './blog.ts';
import { startServer } from './server.ts';

export const JSON_API = 'application/vnd.api+json';

export interface Reply {
  readonly status: number;
  readonly headers: Headers;
  readonly body: unknown;
}

/** Starts a fresh blog for the enclosing describe block. */
export function useBlog(): {
  readonly request: (path: string, init?: RequestInit) => Promise<Reply>;
  readonly store: () => ReturnType<typeof createBlog>['store'];
} {
  let server: RunningServer | undefined;
  let blog: ReturnType<typeof createBlog> | undefined;
  beforeAll(async () => {
    blog = createBlog();
    server = await startServer(blog.app);
  });
  afterAll(async () => {
    await server?.close();
  });
  return {
    request: async (path, init) => {
      if (server === undefined) {
        throw new Error('server not started');
      }
      const response = await server.fetch(path, init);
      const text = await response.text();
      return {
        status: response.status,
        headers: response.headers,
        body: text === '' ? undefined : (JSON.parse(text) as unknown),
      };
    },
    store: () => {
      if (blog === undefined) {
        throw new Error('server not started');
      }
      return blog.store;
    },
  };
}

/** A JSON:API request with a document body. */
export function document(
  method: string,
  body: unknown,
  headers: Record<string, string> = {},
): RequestInit {
  return {
    method,
    headers: { 'content-type': JSON_API, accept: JSON_API, ...headers },
    body: JSON.stringify(body),
  };
}
