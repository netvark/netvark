/**
 * What `oracleCases` gives `pg-catalog rules --check` (SPEC 7.3): each
 * case's probe, where its fixtures are written, and each fixture's text
 * and judge. The runner writes a fixture's texts into the probe with
 * assignment semantics and hands the database's verdict to its judge.
 * @packageDocumentation
 */

/**
 * Where a case writes: copies of a table's columns, each of the column's
 * own type and collation, holding the table's CHECKs the case names, or a
 * value of a domain, which brings its own CHECKs and NOT NULL. A column of
 * a domain type brings the domain's too.
 */
export type OracleProbe =
  | {
      readonly kind: 'columns';
      /** The table's catalog key. */
      readonly table: string;
      readonly columns: ReadonlyArray<string>;
      /** The table's CHECKs the copy holds, by constraint name. */
      readonly checks: ReadonlyArray<string>;
      /**
       * Whether the copies keep the columns' NOT NULL: a member's case and
       * a codec's do, since a member's schema judges `null`; a validator's
       * does not, since only its CHECK decides, and a CHECK passes `NULL`.
       */
      readonly notNull: boolean;
    }
  | {
      readonly kind: 'domain';
      /** The domain's catalog key. */
      readonly domain: string;
    };

/** The database's verdict on a write: the stored values as text, or the refusal's SQLSTATE and the constraint it names. */
export type OracleVerdict =
  | {
      readonly accepted: true;
      /** Each probe column's value printed as text, `null` for SQL `NULL`. */
      readonly stored: ReadonlyArray<string | null>;
    }
  | {
      readonly accepted: false;
      readonly code: string;
      readonly constraint: string | null;
    };

/** A fixture and how the case judges what the database did with it. */
export interface WritableFixture {
  readonly label: string;
  /** The fixture as the schema saw it. */
  readonly value: unknown;
  /** The text each probe column is written, `null` for SQL `NULL`. */
  readonly texts: ReadonlyArray<string | null>;
  /** How the schema and the verdict disagree, or `undefined` when they agree. */
  readonly judge: (verdict: OracleVerdict) => string | undefined;
}

/**
 * A fixture the oracle cannot write, and why: it has no text form, it is
 * not the object of members' values a CHECK over several needs, or its
 * storage codec throws on it. The database never sees it.
 */
export interface UnwritableFixture {
  readonly label: string;
  readonly value: unknown;
  readonly unwritable: string;
}

export type OracleFixture = WritableFixture | UnwritableFixture;

/** One member, validator, or codec, and the fixtures that try it. */
export interface OracleCase {
  /** What the case tries, for a report: `contacts.email`, `meetings.during (codec timeRange)`. */
  readonly subject: string;
  readonly kind: 'field' | 'relationship' | 'validator' | 'codec';
  readonly probe: OracleProbe;
  readonly fixtures: ReadonlyArray<OracleFixture>;
}
