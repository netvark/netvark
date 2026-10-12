/**
 * Bundles written as data, as the inlang SDK's `selectBundleNested()`
 * returns them, for the tests of the pattern rewrite, the bundle checks,
 * and the formatting findings.
 * @ref https://github.com/opral/inlang/blob/main/packages/sdk/src/json-schema/pattern.ts
 */

/** A pattern part or a declaration written as data. */
export interface Part {
  readonly type: string;
  readonly [field: string]: unknown;
}

/** A text part. */
export function text(value: string): { type: 'text'; value: string } {
  return { type: 'text', value };
}

/** An expression reading `name`, with the function `annotation` when given. */
export function variable(name: string, annotation?: string): Part {
  return {
    type: 'expression',
    arg: { type: 'variable-reference', name },
    ...(annotation === undefined
      ? {}
      : {
          annotation: {
            type: 'function-reference',
            name: annotation,
            options: [],
          },
        }),
  };
}

/** A local declaration of `name` as `source` annotated with `annotation`. */
export function local(name: string, source: string, annotation: string): Part {
  return {
    type: 'local-variable',
    name,
    value: variable(source, annotation),
  };
}

/** A bundle as SDK 4's `selectBundleNested()` returns it: one message per locale, one variant each. */
export function bundle(
  locales: ReadonlyArray<string>,
  pattern: ReadonlyArray<unknown> = [text('Shared by '), variable('name')],
  declarations: ReadonlyArray<unknown> = [
    { type: 'input-variable', name: 'name' },
  ],
  id = 'shared_by',
): any {
  return structuredClone({
    id,
    declarations,
    lixcol_entity_id: id,
    messages: locales.map((locale) => ({
      id: `message-${locale}`,
      bundle_id: id,
      locale,
      selectors: [],
      variants: [
        {
          id: `variant-${locale}`,
          message_id: `message-${locale}`,
          matches: [],
          pattern,
        },
      ],
    })),
  });
}

/** A bundle of one message whose one variant has `pattern`. */
export function withPattern(pattern: unknown): Record<string, unknown> {
  return {
    id: 'b',
    declarations: [],
    messages: [{ locale: 'en', variants: [{ pattern }] }],
  };
}
