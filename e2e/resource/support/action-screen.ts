/**
 * What the person reads on a screen of record and bulk actions (resource
 * SPEC 21), whatever framework renders it: each record's checkbox, labeled
 * by its name, in the first cell of its row and its menu in the last; the
 * bar of the selection's actions, a toolbar; what an action did, in a
 * status; and a record's refusal as a screen reader reads it, through the
 * `aria-describedby` of its checkbox. The React screen's rows show the name,
 * the email, and the status between the two, which `listed` reads.
 * @ref https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA21
 */
import { screen, waitFor, within } from '@testing-library/dom';
import { expect } from 'vitest';

/** The text before what a refusal adds under it. */
function valueOf(cell: HTMLElement | undefined): string {
  return cell?.firstChild?.textContent ?? '';
}

/** The contacts the table lists, in order, each as its name and status. */
export function listed(): Array<string> {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => {
      const [, name, , status] = within(row).getAllByRole('cell');
      return `${valueOf(name)}: ${valueOf(status)}`;
    });
}

/** Waits for the table to list `expected`. */
export async function shows(expected: ReadonlyArray<string>): Promise<void> {
  await waitFor(() => {
    expect(listed()).toEqual(expected);
  });
}

/** The checkbox that selects the contact named `name`. */
export function checkbox(name: string): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>('checkbox', {
    name: `${name} auswählen`,
  });
}

/** The row of the contact named `name`. */
function rowOf(name: string): HTMLElement {
  const row = checkbox(name).closest('tr');
  if (row === null) {
    throw new Error(`no row holds ${name}`);
  }
  return row;
}

/** The labels of the actions the menu in the row of `name` offers. */
export function menuOf(name: string): Array<string | null> {
  const menu = within(rowOf(name)).getAllByRole('cell').at(-1);
  if (menu === undefined) {
    throw new Error(`the row of ${name} has no cells`);
  }
  return within(menu)
    .queryAllByRole('button')
    .map(({ textContent }) => textContent);
}

/** The button of the menu in the row of `name` labeled `label`. */
export function rowButton(name: string, label: string): HTMLButtonElement {
  return within(rowOf(name)).getByRole<HTMLButtonElement>('button', {
    name: label,
  });
}

/** The bar's button labeled `label`. */
export function barButton(label: string): HTMLButtonElement {
  return within(
    screen.getByRole('toolbar', { name: 'Auswahl' }),
  ).getByRole<HTMLButtonElement>('button', { name: label });
}

/** The header of the column `cell` sits in; `''` outside a cell. */
function columnOf(cell: HTMLTableCellElement | null | undefined): string {
  return cell === null || cell === undefined
    ? ''
    : (screen.getAllByRole('columnheader')[cell.cellIndex]?.textContent ?? '');
}

/** The texts the checkbox of `name` is described by, by the header of the column each sits in. */
export function refusalOf(name: string): Record<string, string | null> {
  const ids = checkbox(name).getAttribute('aria-describedby')?.split(' ');
  return Object.fromEntries(
    (ids ?? []).map((id) => {
      const text = document.querySelector(`[id="${id}"]`);
      return [columnOf(text?.closest('td')), text?.textContent ?? null];
    }),
  );
}

/** Waits for the status to announce `text`. */
export async function announces(text: string): Promise<void> {
  await waitFor(() => {
    expect(screen.getByRole('status').textContent).toBe(text);
  });
}
