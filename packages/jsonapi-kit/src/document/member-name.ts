/**
 * Member name rules (SPEC 2.1). Implementation-defined names (attributes,
 * relationships, resource types, custom query parameter base names) must
 * match the allowed-character grammar; extension members are `namespace:name`.
 * @ref https://jsonapi.org/format/1.1/#document-member-names
 * @ref https://jsonapi.org/format/1.1/#document-member-names-at-members
 * @ref https://jsonapi.org/format/1.1/#extension-members
 * @packageDocumentation
 */
import {
  EXTENSION_NAMESPACE_PATTERN,
  MEMBER_NAME_PATTERN,
  PROTO_KEYS,
} from '../internal/constants';

/** An implementation-defined member name. */
export function isMemberName(name: string): boolean {
  return MEMBER_NAME_PATTERN.test(name);
}

/** An @-Member: `@` followed by any characters; ignored by every processing rule. */
export function isAtMember(name: string): boolean {
  return name.startsWith('@');
}

/** `namespace:name` where the namespace is `[A-Za-z0-9]+` and the rest a member name. */
export function isExtensionMemberName(name: string): boolean {
  const colon = name.indexOf(':');
  if (colon <= 0) {
    return false;
  }
  return (
    EXTENSION_NAMESPACE_PATTERN.test(name.slice(0, colon)) &&
    isMemberName(name.slice(colon + 1))
  );
}

/** The namespace of an extension member name, or `undefined` for other names. */
export function extensionNamespace(name: string): string | undefined {
  return isExtensionMemberName(name)
    ? name.slice(0, name.indexOf(':'))
    : undefined;
}

/**
 * A relationship path as `include` and dotted sort or filter names use it:
 * member names separated by U+002E FULL STOP.
 * @ref https://jsonapi.org/format/1.1/#fetching-includes
 */
export function isMemberPath(path: string): boolean {
  return path.split('.').every((segment) => isMemberName(segment));
}

/**
 * Definition-time check that throws a `TypeError` naming the offending option.
 * Prototype keys are rejected even though `constructor` and `prototype` are
 * grammatically valid member names: a field by that name would be read
 * through `Object.prototype` by any consumer that does not use `Object.hasOwn`.
 */
export function assertMemberName(what: string, name: string): void {
  if (PROTO_KEYS.has(name)) {
    throw new TypeError(`${what} "${name}" is reserved`);
  }
  if (!isMemberName(name)) {
    throw new TypeError(
      `${what} "${name}" is not a valid JSON:API member name (https://jsonapi.org/format/1.1/#document-member-names)`,
    );
  }
}
