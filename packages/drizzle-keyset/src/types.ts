/**
 * The adapter's own types: the schema the plan's names resolve in, and what
 * rendering needs beside a node (SPEC 14).
 * @packageDocumentation
 */

/**
 * The application's Drizzle schema object, the one it hands `drizzle()`
 * (`import * as schema from './schema'`). Its members that are PostgreSQL
 * tables are what a definition names, by key; the others (relations,
 * enums, views) are ignored.
 */
export type KeysetSchema = Readonly<Record<string, unknown>>;

/** What rendering needs beyond the node itself (SPEC 14.2). */
export interface RenderContext {
  /** The schema the plan's table and column names resolve in. */
  readonly schema: KeysetSchema;
  /** The main table's key in the schema: the correlation side of aggregates and `exists`. */
  readonly table: string;
}
