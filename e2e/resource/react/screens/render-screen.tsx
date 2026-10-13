/**
 * Renders a screen of the contacts application under a `QueryClient`, as
 * the application's root provides one, for a person who types and clicks
 * through `userEvent`; what the person prefers and reads, whatever renders
 * the screen, is `support/screen-person.ts`.
 * @ref https://testing-library.com/docs/user-event/intro
 */
import type { QueryClient } from '@tanstack/react-query';
import type { RenderResult } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
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
