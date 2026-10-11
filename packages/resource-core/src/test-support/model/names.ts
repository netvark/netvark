/**
 * Public names of generated columns (SPEC 4.1): a field's column in camel
 * case, a relationship's without its `_id` suffix. Generated names put only
 * lower-case letters after `_`, where camel casing is unambiguous.
 * Not published with the package.
 * @packageDocumentation
 */

/** `ca_text_list` as `caTextList`. */
export function camelCase(name: string): string {
  const [first = '', ...rest] = name.split('_');
  return [
    first,
    ...rest.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`),
  ].join('');
}

/** The public name of a relationship over `column`: `fa_alpha_id` as `faAlpha`. */
export function relationshipName(column: string): string {
  return camelCase(column.replace(/_id$/u, ''));
}
