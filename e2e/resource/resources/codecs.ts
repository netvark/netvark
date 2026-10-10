import { z } from 'zod';

/**
 * The contacts application's codecs (resource SPEC 7.1). `meetings.during`
 * is a `tstzrange`, which has no wire form; the API carries a bounded,
 * non-empty period as two RFC 3339 instants, and the storage adapter turns
 * it into `[start,end)`.
 */
import { defineCodec } from '@netvark/resource-core';

const instant = z.iso.datetime({ offset: true });

export const codecs = {
  timeRange: defineCodec({
    types: ['tstzrange'],
    schema: z
      .object({ start: instant, end: instant })
      .refine(({ start, end }) => Date.parse(start) < Date.parse(end), {
        message: 'The period must end after it starts.',
      }),
    fixtures: [
      { start: '2026-03-02T09:00:00Z', end: '2026-03-02T10:30:00Z' },
      { start: '2026-03-02T09:00:00.25+01:00', end: '2026-03-02T09:00:01Z' },
    ],
    description: 'A period from start, inclusive, to end, exclusive.',
  }),
};
