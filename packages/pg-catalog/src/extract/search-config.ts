/**
 * The text search configuration of a generated `tsvector` column (SPEC
 * 7.3). A generation expression must be immutable, so it calls the
 * two-argument `to_tsvector(regconfig, text)`; the configuration is the
 * constant every such call names.
 * @ref https://www.postgresql.org/docs/18/textsearch-tables.html
 * @packageDocumentation
 */
import type { Token } from '../sql/tokenize';

import { tokenize } from '../sql/tokenize';

/** The configuration named by `'<name>'::regconfig,` at `index`, or `null` for any other first argument. */
function configAt(tokens: ReadonlyArray<Token>, index: number): string | null {
  const [name, cast, type, comma] = tokens.slice(index, index + 4);
  const named =
    name?.kind === 'string' &&
    cast?.text === '::' &&
    type?.kind === 'word' &&
    type.text === 'regconfig' &&
    comma?.text === ',';
  return named ? name.text : null;
}

/** Whether the token at `index` calls `to_tsvector`, unqualified or as `pg_catalog.to_tsvector`. */
function callsToTsvector(tokens: ReadonlyArray<Token>, index: number): boolean {
  const token = tokens[index];
  if (
    token?.kind !== 'word' ||
    token.text !== 'to_tsvector' ||
    tokens[index + 1]?.text !== '('
  ) {
    return false;
  }
  return (
    tokens[index - 1]?.text !== '.' || tokens[index - 2]?.text === 'pg_catalog'
  );
}

/**
 * The configuration named by every `to_tsvector('<name>'::regconfig, ...)`
 * call in `expression`, read with the tokenizer so string contents never
 * match. `null` when there is no call, when a call has another first
 * argument, or when calls name different configurations.
 */
export function searchConfig(expression: string): string | null {
  const tokens = tokenize(expression);
  if (tokens === null) {
    return null;
  }
  const names = new Set<string>();
  for (let index = 0; index < tokens.length; index += 1) {
    if (callsToTsvector(tokens, index)) {
      const name = configAt(tokens, index + 2);
      if (name === null) {
        return null;
      }
      names.add(name);
    }
  }
  const [only] = names;
  return names.size === 1 && only !== undefined ? only : null;
}
