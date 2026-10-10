/**
 * The Hono app every runtime smoke test drives (SPEC 13.2): the same blog
 * API as the e2e suite, built from the published package only. Web
 * standards only: the same module runs on Bun, Deno, and workerd.
 */
import { createBlog } from '../support/blog.ts';

export const { app } = createBlog();
