/**
 * The derived names of a declared resource (SPEC 4.3), both directions of
 * each mapping. Every lookup is a `ReadonlyMap`, so a name that arrives in
 * a request never meets `Object.prototype`.
 * @packageDocumentation
 */

/** The public names of a resource and the database names behind them. */
export interface ResourceNames {
  /** The JSON:API type: `as`, or the table's name. */
  readonly type: string;
  /** The catalog key of the table. */
  readonly table: string;
  /** The primary key column, which carries the resource id. */
  readonly id: string;
  /** Public field name to column. */
  readonly fields: ReadonlyMap<string, string>;
  /** Public relationship name to foreign-key column. */
  readonly relationships: ReadonlyMap<string, string>;
  /** Column to public name, for fields and relationships. */
  readonly columns: ReadonlyMap<string, string>;
  /** Error code to rule key: a constraint name or a NOT NULL key. */
  readonly codes: ReadonlyMap<string, string>;
  /** Rule key to error code. */
  readonly rules: ReadonlyMap<string, string>;
}
