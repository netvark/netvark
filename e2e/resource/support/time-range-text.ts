/**
 * The storage codec over text of the contacts application's `timeRange`
 * codec, for `pg-catalog rules --check` (catalog SPEC 10.3, resource SPEC
 * 7.3): it writes `[start,end)` with the RFC 3339 instants as they are,
 * which `tstzrange` reads, and reads the range PostgreSQL prints in a UTC
 * session with ISO dates, `["2026-03-02 09:00:00+00","2026-03-02
 * 10:30:00+00")`, back as instants in UTC with `Z`.
 * @ref https://www.postgresql.org/docs/18/rangetypes.html#RANGETYPES-IO
 * @ref https://www.postgresql.org/docs/18/datatype-datetime.html#DATATYPE-DATETIME-OUTPUT
 */
export interface Period {
  readonly start: string;
  readonly end: string;
}

const RANGE = /^\["([^"]+)","([^"]+)"\)$/u;
const UTC_INSTANT = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)\+00$/u;

function instant(text: string): string {
  const match = UTC_INSTANT.exec(text);
  if (match === null) {
    throw new TypeError(`not an instant in UTC: ${text}`);
  }
  return `${match[1] ?? ''}T${match[2] ?? ''}Z`;
}

export const timeRangeText: {
  readonly read: (stored: string) => Period;
  readonly write: (period: Period) => string;
} = {
  read: (stored) => {
    const match = RANGE.exec(stored);
    if (match === null) {
      throw new TypeError(`not a bounded [start,end) range: ${stored}`);
    }
    return { start: instant(match[1] ?? ''), end: instant(match[2] ?? '') };
  },
  write: ({ start, end }) => `[${start},${end})`,
};
