/**
 * The helper types a Kysely types file declares when its columns use them
 * (SPEC 9.2), in the order the file declares them.
 * @packageDocumentation
 */
import type { Helper } from './kysely-type-table';

export const HELPER_ORDER: ReadonlyArray<Helper> = [
  'JsonValue',
  'JsonParameter',
  'PostgresInterval',
  'Point',
  'Circle',
];

export const HELPER_DECLARATIONS: Readonly<
  Record<Helper, ReadonlyArray<string>>
> = {
  JsonValue: [
    'export type JsonValue =',
    '  | string',
    '  | number',
    '  | boolean',
    '  | null',
    '  | Array<JsonValue>',
    '  | { [key: string]: JsonValue };',
  ],
  // What PGlite's json serializer sends: a string as it is, anything else through JSON.stringify.
  JsonParameter: [
    '/** JSON text as a string, or any other JSON value, which PGlite sends with JSON.stringify. */',
    'export type JsonParameter =',
    '  | string',
    '  | number',
    '  | boolean',
    '  | Array<JsonValue>',
    '  | { [key: string]: JsonValue };',
  ],
  // The object postgres-interval 1.x returns; its own declaration, with `toPostgres` for parameters.
  PostgresInterval: [
    'export interface PostgresInterval {',
    '  years?: number;',
    '  months?: number;',
    '  days?: number;',
    '  hours?: number;',
    '  minutes?: number;',
    '  seconds?: number;',
    '  milliseconds?: number;',
    '  toPostgres(): string;',
    '  toISO(): string;',
    '  toISOString(): string;',
    '}',
  ],
  Point: ['export interface Point {', '  x: number;', '  y: number;', '}'],
  Circle: [
    'export interface Circle {',
    '  x: number;',
    '  y: number;',
    '  radius: number;',
    '}',
  ],
};
