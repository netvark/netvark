/**
 * What the model reads of a declaration: each member's column, public
 * name, access, filter, sort, target, and whether it names a codec, the
 * declared scope's column, client ids, and the codes the rules give.
 * The generated declarations state these directly; a real declaration's
 * are read back from its `declaration` and `names`.
 * Not published with the package.
 * @packageDocumentation
 */

/** A member's access (SPEC 3.1). */
export type Access = 'read' | 'readWrite' | 'immutable' | 'write';

/** One declared member. */
export interface ModelMember {
  readonly kind: 'field' | 'relationship';
  readonly column: string;
  readonly name: string;
  readonly access: Access;
  readonly filter: ReadonlyArray<string> | null;
  readonly sort: boolean;
  /** A relationship's target table; `null` for a field. */
  readonly target: string | null;
  /** Whether the field names a codec, whose schema the model does not describe (SPEC 6.1). */
  readonly codec: boolean;
}

/** A declaration as the model reads it. */
export interface ModelDeclaration {
  readonly table: string;
  readonly members: ReadonlyArray<ModelMember>;
  /** The declared scope's column, a member only as a `read` relationship (SPEC 3.2). */
  readonly scopeColumn: string | null;
  readonly clientIds: boolean;
  /** Codes the declaration's `rules` give, by rule key. */
  readonly ruleCodes: Readonly<Record<string, string>>;
}
