/**
 * Query parameter family names (SPEC 6.2): `base`, `base[]`, `base[member]`,
 * `base[a.b]`, nested. Brackets arrive decoded (`%5B` and `%5D` are decoded
 * by every URL parser) or bare, which servers SHOULD accept as equivalent.
 * @ref https://jsonapi.org/format/1.1/#query-parameters-families
 * @ref https://jsonapi.org/format/1.1/#appendix-query-details-square-brackets
 * @packageDocumentation
 */
import {
  isExtensionMemberName,
  isMemberName,
  isMemberPath,
} from '../document/member-name';

export interface ParameterName {
  /** The family's base name. */
  readonly base: string;
  /** Bracketed members in order; an empty bracket pair is `''`. */
  readonly members: ReadonlyArray<string>;
}

/** `[...]` groups covering the whole remainder, no nesting inside a group. */
const BRACKET_GROUPS = /^(?:\[[^[\]]*\])+$/u;
const GROUP = /\[([^[\]]*)\]/gu;

/**
 * Splits a parameter name into its base and members, or returns `undefined`
 * when the name is not a well-formed family member: a base that is neither
 * a member name nor an extension name, unbalanced or nested brackets, or a
 * bracket member that is neither empty, a member name, nor a member path.
 */
export function parseParameterName(name: string): ParameterName | undefined {
  const bracket = name.indexOf('[');
  const base = bracket === -1 ? name : name.slice(0, bracket);
  if (!isMemberName(base) && !isExtensionMemberName(base)) {
    return undefined;
  }
  if (bracket === -1) {
    return { base, members: [] };
  }
  const rest = name.slice(bracket);
  if (!BRACKET_GROUPS.test(rest)) {
    return undefined;
  }
  const members: Array<string> = [];
  for (const match of rest.matchAll(GROUP)) {
    const member = match[1] ?? '';
    if (member !== '' && !isMemberPath(member)) {
      return undefined;
    }
    members.push(member);
  }
  return { base, members };
}

/** The inverse: `base[a][b]`. */
export function formatParameterName(
  base: string,
  members: ReadonlyArray<string>,
): string {
  return base + members.map((member) => `[${member}]`).join('');
}
