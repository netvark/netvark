import type { RenderResult } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';

/**
 * Renders a screen of the screen tests (resource SPEC 20.8) under the
 * API's `QueryClient`, as an application's root provides it, with a user
 * that types and clicks as a person does, and reads a control's error as
 * a screen reader does, through `aria-describedby`. Not published with the
 * package.
 * @ref https://testing-library.com/docs/user-event/intro
 * @packageDocumentation
 */
import type { QueryServer } from '../query-server';

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

/** The rendered screen and the person using it. */
export interface RenderedScreen extends RenderResult {
  readonly user: UserEvent;
}

/** `screen` rendered under `server`'s `QueryClient`. */
export function renderScreen(
  server: QueryServer,
  children: ReactNode,
): RenderedScreen {
  const user = userEvent.setup();
  const rendered = render(
    <QueryClientProvider client={server.queryClient}>
      {children}
    </QueryClientProvider>,
  );
  return { ...rendered, user };
}

/** The text of the error the control labeled `label` describes itself by; `undefined` without one. */
export function errorOf(label: string): string | undefined {
  const id = screen.getByLabelText(label).getAttribute('aria-describedby');
  return id === null
    ? undefined
    : (document.querySelector(`[id="${id}"]`)?.textContent ?? undefined);
}
