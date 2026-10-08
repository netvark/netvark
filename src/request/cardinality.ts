/**
 * Cardinality narrowing for parsed linkage (SPEC 9.1). A parsed resource
 * object keys relationships by name, so each value is typed as any linkage;
 * the parser has already enforced the cardinality the definition declares,
 * so a handler may narrow by the cardinality it knows. A mismatch is a
 * programming error (the wrong relationship name), not request data, and
 * throws `TypeError`.
 * @ref https://jsonapi.org/format/1.1/#document-resource-object-linkage
 * @packageDocumentation
 */
import type {
  ResourceLinkage,
  ToManyLinkage,
  ToOneLinkage,
} from '../document/types';

function isMany(
  linkage: ResourceLinkage | undefined,
): linkage is ToManyLinkage {
  return Array.isArray(linkage);
}

/**
 * The identifier or `null` of a to-one relationship, or `undefined` when
 * the document did not carry the relationship.
 */
export function toOneLinkage(
  linkage: ResourceLinkage | undefined,
): ToOneLinkage | undefined {
  if (isMany(linkage)) {
    throw new TypeError(
      'toOneLinkage: the linkage is an array; the relationship is to-many',
    );
  }
  return linkage;
}

/**
 * The identifiers of a to-many relationship, or `undefined` when the
 * document did not carry the relationship.
 */
export function toManyLinkage(
  linkage: ResourceLinkage | undefined,
): ToManyLinkage | undefined {
  if (linkage === undefined || isMany(linkage)) {
    return linkage;
  }
  throw new TypeError(
    'toManyLinkage: the linkage is not an array; the relationship is to-one',
  );
}
