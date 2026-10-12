/**
 * The screens' environment: jsdom's window and document, as Vitest's own
 * `jsdom` environment sets them up, with the test file's modules
 * processed by Vite's `ssr` environment instead of its `client` one. A
 * screen test runs the contacts application it calls, its database
 * included, in the same process, and those modules need what a server
 * has: `import.meta.url` as a file URL, and Node's built-in modules.
 * Packages from `node_modules` load natively either way, resolving their
 * own imports with Node's conditions, so the screens' libraries behave
 * as they do under `jsdom`. jsdom lays nothing out and reports a scroll
 * as not implemented, so scrolling the window, as TanStack Router does
 * after each navigation, does nothing here.
 * @ref https://vitest.dev/guide/environment#custom-environment
 * @ref https://github.com/jsdom/jsdom#unimplemented-parts-of-the-web-platform
 * @ref https://github.com/TanStack/router/blob/main/packages/react-router/tests/setupTests.tsx (window.scrollTo replaced the same way)
 */
import type { Environment } from 'vitest/runtime';

import { builtinEnvironments } from 'vitest/runtime';

const { jsdom } = builtinEnvironments;

const environment: Environment = {
  name: 'screen',
  viteEnvironment: 'ssr',
  setup: async (global, options) => {
    const window = await jsdom.setup(global, options);
    globalThis.scrollTo = () => {};
    return window;
  },
};

export default environment;
