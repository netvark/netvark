import type { RunningServer } from './server.ts';

import { request as httpRequest } from 'node:http';

import { afterAll, beforeAll } from 'vitest';

import { createBlog } from './blog.ts';
import { startServer } from './server.ts';

export const JSON_API = 'application/vnd.api+json';

export interface Reply {
  readonly status: number;
  readonly headers: Headers;
  readonly body: unknown;
}

/**
 * Sends `target` as the request line's target, exactly as written: a client
 * that does not parse URLs can send a literal `#`, which `fetch` would cut
 * off, and Node's HTTP server keeps it in the request URL.
 * @ref https://nodejs.org/api/http.html#httprequestoptions-callback
 */
async function sendTarget(origin: string, target: string): Promise<Reply> {
  const { hostname, port } = new URL(origin);
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      { hostname, port, path: target, headers: { accept: JSON_API } },
      (incoming) => {
        const chunks: Array<Buffer> = [];
        incoming.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        incoming.on('error', reject);
        incoming.on('end', () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(incoming.headers)) {
            if (typeof value === 'string') {
              headers.set(name, value);
            }
          }
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: incoming.statusCode ?? 0,
            headers,
            body: text === '' ? undefined : (JSON.parse(text) as unknown),
          });
        });
      },
    );
    outgoing.on('error', reject);
    outgoing.end();
  });
}

/** Starts a fresh blog for the enclosing describe block. */
export function useBlog(): {
  readonly request: (path: string, init?: RequestInit) => Promise<Reply>;
  readonly requestTarget: (target: string) => Promise<Reply>;
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
    requestTarget: async (target) => {
      if (server === undefined) {
        throw new Error('server not started');
      }
      return sendTarget(server.url, target);
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
