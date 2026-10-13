/**
 * The person a screen test acts for, whatever framework renders the
 * screen: the languages their browser prefers, and a control's error read
 * as a screen reader reads it, through `aria-describedby`. Paraglide's
 * `preferredLanguage` strategy picks the locale from `navigator.languages`,
 * so the screens' texts, and the `Accept-Language` a transport sends with
 * `getLocale()`, follow `preferLanguages`.
 * @ref https://paraglidejs.com/strategy#preferredlanguage
 * @ref https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA21
 */
import { screen } from '@testing-library/dom';

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
