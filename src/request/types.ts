/**
 * Options shared by the request resource parsers (SPEC 9.2), and the shape
 * of a request document as a client sends it, for typed clients.
 * @packageDocumentation
 */
import type { Attributes, Meta, ResourceLinkage } from '../document/types';

export type Operation = 'create' | 'update';

/** A resource object in a request: `id` optional on create, `lid` allowed. */
export interface RequestResourceObject {
  readonly type: string;
  readonly id?: string;
  readonly lid?: string;
  readonly attributes?: Attributes;
  readonly relationships?: Readonly<
    Record<string, { readonly data: ResourceLinkage }>
  >;
  readonly meta?: Meta;
}

/** A request document: `data` is a resource object or, for relationships, linkage. */
export interface RequestDocument {
  readonly data: RequestResourceObject | ResourceLinkage;
  readonly meta?: Meta;
}

export interface ParseResourceOptions {
  readonly operation: Operation;
  /** On update, the id the URL names; the document's `id` must match (409). */
  readonly id?: string | undefined;
  /** Accept `lid` on the resource and in linkage. Default false. */
  readonly lids?: boolean | undefined;
  /** Pointer of the resource object in the document. Default `/data`. */
  readonly pointer?: string | undefined;
}
