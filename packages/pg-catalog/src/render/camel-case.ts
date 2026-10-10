/**
 * Kysely's CamelCasePlugin conversions, ported line by line from its
 * mappers (identical in Kysely 0.28 and 0.29): the plugin renames result
 * keys from snake_case to camelCase and turns every identifier of a query
 * back into snake_case. A camelCase key therefore reaches its table or
 * column only when that round trip gives the database name back.
 * @ref https://github.com/kysely-org/kysely/blob/v0.28.17/src/plugin/camel-case/camel-case.ts
 * @ref https://kysely.dev/docs/plugins#camel-case-plugin
 * @packageDocumentation
 */
import type { CamelCaseOptions } from '../config';

import { PgCatalogError } from '../errors';

const UNDERSCORE = '_';

function isDigit(character: string): boolean {
  return character >= '0' && character <= '9';
}

/** Whether the character at `index` is upper case and has a lower-case form, read as Kysely reads it. */
function isUpper(
  text: string,
  upper: string,
  lower: string,
  index: number,
): boolean {
  const character = upper.charAt(index);
  return text.charAt(index) === character && character !== lower.charAt(index);
}

/** CamelCasePlugin's `snakeCase`: what a query identifier becomes. */
export function toSnakeCase(
  text: string,
  options: CamelCaseOptions = {},
): string {
  if (text.length === 0) {
    return text;
  }
  const upper = text.toUpperCase();
  const lower = text.toLowerCase();
  let out = lower.charAt(0);
  for (let index = 1; index < text.length; index += 1) {
    const character = text.charAt(index);
    const digitStart =
      isDigit(character) &&
      !isDigit(text.charAt(index - 1)) &&
      !out.endsWith(UNDERSCORE);
    if (options.underscoreBeforeDigits === true && digitStart) {
      out += `${UNDERSCORE}${character}`;
    } else if (isUpper(text, upper, lower, index)) {
      const afterUpper = isUpper(text, upper, lower, index - 1);
      const separate =
        options.underscoreBetweenUppercaseLetters === true || !afterUpper;
      out += `${separate ? UNDERSCORE : ''}${lower.charAt(index)}`;
    } else {
      out += character;
    }
  }
  return options.upperCase === true ? out.toUpperCase() : out;
}

/** Kysely tests UTF-16 units, skipping the first, for upper-case snake_case. */
function isUpperSnakeCase(text: string): boolean {
  for (let index = 1; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (character !== UNDERSCORE && character !== character.toUpperCase()) {
      return false;
    }
  }
  return true;
}

/** CamelCasePlugin's `camelCase`: what a result key becomes. */
export function toCamelCase(
  text: string,
  options: CamelCaseOptions = {},
): string {
  if (text.length === 0) {
    return text;
  }
  const source =
    options.upperCase === true && isUpperSnakeCase(text)
      ? text.toLowerCase()
      : text;
  let out = source.charAt(0);
  for (let index = 1; index < source.length; index += 1) {
    const character = source.charAt(index);
    if (character !== UNDERSCORE) {
      out +=
        source.charAt(index - 1) === UNDERSCORE
          ? character.toUpperCase()
          : character;
    }
  }
  return out;
}

/**
 * The keys of the Kysely types: database names as they are, or with
 * `camelCase` the names CamelCasePlugin gives them. A name the plugin would
 * not turn back into itself is collected, and `assertMapped` reports every
 * one in a single `camel_case_mismatch`.
 */
export class KeyNames {
  private readonly options: CamelCaseOptions | null;
  private readonly mismatches: Array<string> = [];

  public constructor(camelCase: boolean | CamelCaseOptions | undefined) {
    this.options =
      camelCase === undefined || camelCase === false
        ? null
        : camelCase === true
          ? {}
          : camelCase;
  }

  /** The key of a table or column; `owner` describes it in the error. */
  public key(name: string, owner: string): string {
    if (this.options === null) {
      return name;
    }
    const key = toCamelCase(name, this.options);
    const back = toSnakeCase(key, this.options);
    if (back !== name) {
      this.mismatches.push(
        `${owner} becomes ${key} in camelCase, which CamelCasePlugin turns back into ${back}`,
      );
    }
    return key;
  }

  /** Throws one `camel_case_mismatch` listing every name that failed, in the order seen. */
  public assertMapped(): void {
    if (this.mismatches.length > 0) {
      throw new PgCatalogError(
        'camel_case_mismatch',
        this.mismatches.join('; '),
      );
    }
  }
}
