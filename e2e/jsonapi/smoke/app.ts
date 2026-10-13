/**
 * The Hono app every runtime smoke test drives (SPEC 13.2, 14.2): the same
 * blog API as the e2e suite, built from the published packages only, and
 * `GET /client-checks` and `GET /query-checks`, which run the client's and
 * the TanStack Query binding's checks against a blog of their own inside the
 * runtime that hosts this app. Web standards only: the same module runs on
 * Bun, Deno, and workerd.
 */
import { createBlog } from '../support/blog.ts';
import { runClientChecks } from './client-checks.ts';
import { runQueryChecks } from './query-checks.ts';

export const { app } = createBlog();

app.get('/client-checks', async (c) => c.json(await runClientChecks()));
app.get('/query-checks', async (c) => c.json(await runQueryChecks()));
