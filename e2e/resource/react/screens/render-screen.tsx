/**
 * Renders a screen of the contacts application under a `QueryClient`, as
 * the application's root provides one, for a person who types and clicks
 * through `userEvent` and reads a control's error as a screen reader
 * does, through `aria-describedby`. `preferLanguages` sets what the
 * browser says the person reads: Paraglide's `preferredLanguage`
 * strategy picks the locale from `navigator.languages`, so the screens'
 * texts, and the `Accept-Language` a transport sends with `getLocale()`,
 * follow it.
 * @ref https://paraglidejs.com/strategy#preferredlanguage
 * @ref https://testing-library.com/docs/user-event/intro
 */
import type { QueryClient } from '@tanstack/react-query';
import type { RenderResult } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

/** The rendered screen and the person using it. */
export interface RenderedScreen extends RenderResult {
  readonly user: UserEvent;
}

/** `children` rendered under `queryClient`. */
export function renderScreen(
  queryClient: QueryClient,
  children: ReactNode,
): RenderedScreen {
  const user = userEvent.setup();
  const rendered = render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  );
  return { ...rendered, user };
}

/** Has jsdom's browser report `languages` as the person's, most preferred first. */
export function preferLanguages(languages: ReadonlyArray<string>): void {
  Object.defineProperty(navigator, 'languages', {
    configurable: true,
    value: Object.freeze([...languages]),
  });
}

/** The text of the error the control labeled `label` describes itself by; `undefined` without one. */
export function errorOf(label: string): string | undefined {
  const id = screen.getByLabelText(label).getAttribute('aria-describedby');
  return id === null
    ? undefined
    : (document.querySelector(`[id="${id}"]`)?.textContent ?? undefined);
}
