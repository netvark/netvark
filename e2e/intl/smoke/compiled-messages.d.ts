/**
 * The type of `#compiled-messages`, the fixture `compile.ts` writes into
 * `.tmp/smoke/` (package.json `imports`, `types` condition), so the smoke
 * type-checks before a compile has run.
 * @ref https://www.typescriptlang.org/docs/handbook/modules/reference.html#packagejson-imports-and-self-name-imports
 */
type Message = (
  inputs: Readonly<Record<string, unknown>>,
  options: { readonly locale: 'en' | 'ar' },
) => string;

/** The messages of `support/catalogs.ts`, as Paraglide exports them. */
export declare const m: {
  readonly shared_by: Message;
  readonly due: Message;
  readonly items: Message;
};
