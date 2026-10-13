/**
 * Mounts a screen of the contacts application as the application's entry
 * mounts its root: a Vue app with Vue Query's plugin installed over the
 * test's `QueryClient`, in a container of jsdom's document, for a person
 * who types and clicks through `userEvent`. `cleanup` unmounts every app
 * mounted, as Testing Library's own `cleanup` unmounts what it rendered,
 * and throws when Vue warned meanwhile, so a screen Vue warns about, an
 * attribute its fragment root cannot inherit for one, fails its test.
 * @ref https://vuejs.org/api/application.html#createapp
 * @ref https://vuejs.org/api/application.html#app-config-warnhandler
 * @ref https://tanstack.com/query/v5/docs/framework/vue/guides/custom-client
 * @ref https://testing-library.com/docs/user-event/intro
 */
import type { QueryClient } from '@tanstack/vue-query';
import type { UserEvent } from '@testing-library/user-event';
import type { VNodeChild } from 'vue';

import { VueQueryPlugin } from '@tanstack/vue-query';
import { userEvent } from '@testing-library/user-event';
import { createApp } from 'vue';

const unmounts = new Set<() => void>();
const warnings: Array<string> = [];

/** What `render` returns, mounted under `queryClient`, and the person using it. */
export function mountScreen(
  queryClient: QueryClient,
  render: () => VNodeChild,
): UserEvent {
  const user = userEvent.setup();
  const container = document.createElement('div');
  document.body.append(container);
  const app = createApp({ name: 'Screen', render });
  app.config.warnHandler = (message, _instance, trace) => {
    warnings.push(`${message}\n${trace}`);
  };
  app.use(VueQueryPlugin, { queryClient });
  app.mount(container);
  unmounts.add(() => {
    app.unmount();
    container.remove();
  });
  return user;
}

/**
 * Unmounts every screen `mountScreen` mounted and removes its container;
 * throws with the warnings Vue gave since the last cleanup, if any.
 */
export function cleanup(): void {
  for (const unmount of unmounts) {
    unmount();
  }
  unmounts.clear();
  const given = warnings.splice(0);
  if (given.length > 0) {
    throw new Error(`Vue warned:\n${given.join('\n')}`);
  }
}
