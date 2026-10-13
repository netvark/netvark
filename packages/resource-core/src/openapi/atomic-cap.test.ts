/**
 * The cap of the Atomic Operations endpoint in the document (SPEC 13.1):
 * the request's `maxItems` is the `atomic.max` the resources' definitions
 * share, which the definer sets on every declaration (SPEC 2) and the
 * processor enforces; definitions whose caps differ are refused as the
 * processor refuses them, and only when the endpoint is listed.
 * @ref https://jsonapi.org/ext/atomic/#processing
 */
import { describe, expect, it } from 'vitest';

import { createDeclareResource } from '../declare/create-declare-resource';
import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { openapi } from './document';

const INFO = { title: 'Teams', version: '1' };
const ATOMIC = 'application/vnd.api+json; ext="https://jsonapi.org/ext/atomic"';
const PATH = '/api/operations';
const REMOVABLE = { operations: ['remove'], fields: {} } as const;
const READABLE = {
  operations: ['get'],
  fields: { name: { access: 'read' } },
} as const;

/** A definer over the unit-test catalog whose definitions carry `max`, the default without one. */
function cappedAt(max?: number) {
  return createDeclareResource({
    catalog: contactsCatalog,
    ...TEST_REGISTRIES,
    links: { base: '/api' },
    atomic: { max },
  });
}

/** The `maxItems` of the operations the endpoint of `document` takes. */
function maxItemsOf(document: ReturnType<typeof openapi>): unknown {
  const schema = document.paths[PATH]?.post?.requestBody?.content[ATOMIC]
    ?.schema as
    | { properties: { 'atomic:operations': { maxItems: unknown } } }
    | undefined;
  return schema?.properties['atomic:operations'].maxItems;
}

describe('the cap of the operations endpoint (SPEC 13.1)', () => {
  it('is the atomic.max the definer gives every definition', () => {
    const capped = openapi([cappedAt(50)('teams', REMOVABLE)], { info: INFO });
    expect(maxItemsOf(capped)).toBe(50);
    const byDefault = openapi([cappedAt()('teams', REMOVABLE)], {
      info: INFO,
    });
    expect(maxItemsOf(byDefault)).toBe(10);
  });

  it('refuses definitions whose caps differ, as the processor does', () => {
    expect(() =>
      openapi(
        [cappedAt(50)('teams', REMOVABLE), cappedAt()('people', READABLE)],
        { info: INFO },
      ),
    ).toThrow(
      new TypeError(
        "openapi: the resources' definitions have different atomic.max (50, 10); one endpoint takes one cap",
      ),
    );
  });

  it('reads no cap when no resource writes, since the endpoint is not listed', () => {
    const document = openapi(
      [cappedAt(50)('teams', READABLE), cappedAt()('people', READABLE)],
      { info: INFO },
    );
    expect(Object.keys(document.paths)).not.toContain(PATH);
  });
});
