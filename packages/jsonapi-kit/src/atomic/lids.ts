/**
 * Local identities (SPEC 11.3): a `lid` names a resource an earlier `add`
 * created, unique per type within the document. `Lids` records the id each
 * one received and replaces references to it.
 * @ref https://jsonapi.org/ext/atomic/#operation-objects
 * @ref https://jsonapi.org/format/1.1/#document-resource-object-identification
 * @packageDocumentation
 */
import type {
  AnyResourceIdentifier,
  ResourceIdentifier,
  ResourceLinkage,
} from '../document/types';
import type { RequestLinkage } from '../request/identifiers';

import { JsonApiError } from '../errors/json-api-error';
import { compact } from '../internal/object';

function key(type: string, lid: string): string {
  return `${type}\u0000${lid}`;
}

function isMany(
  linkage: AnyResourceIdentifier | ReadonlyArray<AnyResourceIdentifier>,
): linkage is ReadonlyArray<AnyResourceIdentifier> {
  return Array.isArray(linkage);
}

export class Lids {
  private readonly ids = new Map<string, string>();

  /** Records the id a created resource received; a repeated `lid` is a 400. */
  public define(type: string, lid: string, id: string, pointer: string): void {
    if (this.ids.has(key(type, lid))) {
      throw JsonApiError.invalidDocument(
        pointer,
        `lid "${lid}" is already used for another "${type}" in this document`,
      );
    }
    this.ids.set(key(type, lid), id);
  }

  /** The id for a `lid`; a 400 when no earlier operation created it. */
  public resolve(type: string, lid: string, pointer: string): string {
    const id = this.ids.get(key(type, lid));
    if (id === undefined) {
      throw JsonApiError.invalidDocument(
        pointer,
        `lid "${lid}" does not refer to a "${type}" created by an earlier operation`,
      );
    }
    return id;
  }

  public identifier(
    identifier: AnyResourceIdentifier,
    pointer: string,
  ): ResourceIdentifier {
    if ('id' in identifier) {
      return identifier;
    }
    return compact({
      type: identifier.type,
      id: this.resolve(identifier.type, identifier.lid, `${pointer}/lid`),
      meta: identifier.meta,
    });
  }

  public identifiers(
    identifiers: ReadonlyArray<AnyResourceIdentifier>,
    pointer: string,
  ): ReadonlyArray<ResourceIdentifier> {
    return identifiers.map((identifier, index) =>
      this.identifier(identifier, `${pointer}/${String(index)}`),
    );
  }

  /** Request linkage with every `lid` identifier replaced by its id. */
  public linkage(linkage: RequestLinkage, pointer: string): ResourceLinkage {
    if (linkage === null) {
      return null;
    }
    if (isMany(linkage)) {
      return this.identifiers(linkage, pointer);
    }
    return this.identifier(linkage, pointer);
  }
}
