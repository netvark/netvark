/**
 * The formats of the OpenAPI Format Registry a resource document names
 * beyond ajv-formats' (resource SPEC 13.1), each asserted: `int16`,
 * `decimal`, a decimal literal in any spelling PostgreSQL reads for
 * `numeric`, and `date-time-local`, RFC 3339's date-time without an
 * offset. Formats only annotate in the OpenAPI dialect; asserting them
 * proves a value the server sends has the format the document claims.
 * @ref https://spec.openapis.org/registry/format/int16.html
 * @ref https://spec.openapis.org/registry/format/decimal.html
 * @ref https://spec.openapis.org/registry/format/date-time-local.html
 * @ref https://www.rfc-editor.org/rfc/rfc3339#section-5.6
 */
import type Ajv2020 from 'ajv/dist/2020.js';

const INT16_MIN = -32_768;
const INT16_MAX = 32_767;
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/u;
/** `full-date "T" partial-time`, where `T` may be lower case (RFC 3339 5.6). */
const DATE_TIME_LOCAL =
  /^(\d{4})-(\d{2})-(\d{2})[Tt]([01]\d|2[0-3]):[0-5]\d:([0-5]\d|60)(\.\d+)?$/u;

function isCalendarDay(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCFullYear(year);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isDateTimeLocal(text: string): boolean {
  const match = DATE_TIME_LOCAL.exec(text);
  return (
    match !== null &&
    isCalendarDay(Number(match[1]), Number(match[2]), Number(match[3]))
  );
}

/** Adds the formats to `ajv`, which already has ajv-formats'. */
export function openApiFormats(ajv: Ajv2020): void {
  ajv.addFormat('int16', {
    type: 'number',
    validate: (value: number) =>
      Number.isInteger(value) && value >= INT16_MIN && value <= INT16_MAX,
  });
  ajv.addFormat('decimal', { type: 'string', validate: DECIMAL });
  ajv.addFormat('date-time-local', {
    type: 'string',
    validate: isDateTimeLocal,
  });
}
