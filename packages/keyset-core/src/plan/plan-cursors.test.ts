import { describe, expect, it } from 'vitest';

import { createCursorCodec } from '../cursor/codec';
import { InvalidCursorError, UnsupportedSortError } from '../errors';
import { canonicalJson } from '../internal/canonical';
import { sha256Base64Url } from '../internal/crypto';
import { sortSignature } from '../sort/resolve-sort';
import { definition, rejected, SECRET } from '../test-support/fixtures';
import { createPlanner } from './plan';

const codec = createCursorCodec({ secret: SECRET });
const plan = createPlanner(definition, codec);

describe('createPlanner (cursors)', () => {
  it('decodes an after cursor into a seek in the request direction', async () => {
    const first = await plan({ sort: ['-createdAt'], page: { size: 2 } });
    const after = await codec.encode(['2024-01-02', 'k2'], first.context);
    const next = await plan({ sort: ['-createdAt'], page: { size: 2, after } });
    expect(next).toMatchObject({
      reversed: false,
      after,
      before: null,
      limit: 3,
    });
    expect(next.keys.map((key) => [key.direction, key.nulls])).toEqual([
      ['desc', 'last'],
      ['asc', 'last'],
    ]);
    expect(next.seek).toEqual({
      kind: 'or',
      items: [
        {
          kind: 'or',
          items: [
            {
              kind: 'compare',
              target: next.keys[0]?.target,
              operator: '<',
              value: '2024-01-02',
            },
            { kind: 'null', target: next.keys[0]?.target, negate: false },
          ],
        },
        {
          kind: 'and',
          items: [
            {
              kind: 'compare',
              target: next.keys[0]?.target,
              operator: '=',
              value: '2024-01-02',
            },
            {
              kind: 'or',
              items: [
                {
                  kind: 'compare',
                  target: next.keys[1]?.target,
                  operator: '>',
                  value: 'k2',
                },
                { kind: 'null', target: next.keys[1]?.target, negate: false },
              ],
            },
          ],
        },
      ],
    });
  });

  it('plans a before-only page inverted, with nulls first, and marks it reversed', async () => {
    const first = await plan({ sort: ['-createdAt'] });
    const before = await codec.encode([null, 'k9'], first.context);
    const previous = await plan({ sort: ['-createdAt'], page: { before } });
    expect(previous.reversed).toBe(true);
    expect(previous.keys.map((key) => [key.direction, key.nulls])).toEqual([
      ['asc', 'first'],
      ['desc', 'first'],
    ]);
    expect(previous.sort).toEqual([
      { field: 'createdAt', direction: 'desc' },
      { field: 'id', direction: 'asc' },
    ]);
    expect(previous.seek).toEqual({
      kind: 'or',
      items: [
        { kind: 'null', target: previous.keys[0]?.target, negate: true },
        {
          kind: 'and',
          items: [
            { kind: 'null', target: previous.keys[0]?.target, negate: false },
            {
              kind: 'compare',
              target: previous.keys[1]?.target,
              operator: '<',
              value: 'k9',
            },
          ],
        },
      ],
    });
  });

  it('plans a range as a forward page bounded on both sides', async () => {
    const first = await plan({});
    const after = await codec.encode(['a'], first.context);
    const before = await codec.encode(['z'], first.context);
    const range = await plan({ page: { after, before } });
    expect(range).toMatchObject({
      reversed: false,
      range: true,
      size: 100,
      limit: 101,
    });
    expect(range.keys[0]).toMatchObject({ direction: 'asc', nulls: 'last' });
    expect(range.seek).toEqual({
      kind: 'and',
      items: [
        {
          kind: 'or',
          items: [
            {
              kind: 'compare',
              target: range.keys[0]?.target,
              operator: '>',
              value: 'a',
            },
            { kind: 'null', target: range.keys[0]?.target, negate: false },
          ],
        },
        {
          kind: 'compare',
          target: range.keys[0]?.target,
          operator: '<',
          value: 'z',
        },
      ],
    });
  });

  it('rejects cursors from another context, with the parameter that carried them', async () => {
    const sorted = await plan({ sort: ['-createdAt'] });
    const cursor = await codec.encode(['2024', 'k'], sorted.context);
    const error = await rejected(plan({ page: { after: cursor } }));
    expect(error).toBeInstanceOf(InvalidCursorError);
    expect(error).toMatchObject({ parameter: 'after', reason: 'context' });
    expect(await rejected(plan({ page: { before: 'garbage' } }))).toMatchObject(
      {
        parameter: 'before',
        reason: 'malformed',
      },
    );
  });
});

/** A cursor on the first page of `-createdAt` under `context`. */
async function cursorUnder(
  context?: Readonly<Record<string, string | number | bigint>>,
): Promise<string> {
  const first = await plan({ sort: ['-createdAt'] }, { context });
  return codec.encode(['2024-01-02', 'k2'], first.context);
}

async function resume(
  after: string,
  context?: Readonly<Record<string, string | number | bigint>>,
): Promise<unknown> {
  return rejected(plan({ sort: ['-createdAt'], page: { after } }, { context }));
}

describe('createPlanner (context, SPEC 6.1, ADR 0015)', () => {
  const ACME = { tenant: 'acme' } as const;
  const GLOBEX = { tenant: 'globex' } as const;

  it('resumes a cursor under the context it was issued in, whatever the member order', async () => {
    const after = await cursorUnder({ tenant: 'acme', region: 'eu' });
    expect(
      await resume(after, { region: 'eu', tenant: 'acme' }),
    ).toBeUndefined();
  });

  it('rejects it under another context or none, naming the parameter', async () => {
    const after = await cursorUnder(ACME);
    expect(await resume(after, GLOBEX)).toEqual(
      new InvalidCursorError('after', 'context'),
    );
    expect(await resume(after)).toMatchObject({
      parameter: 'after',
      reason: 'context',
    });
    const before = await cursorUnder(ACME);
    expect(
      await rejected(
        plan({ sort: ['-createdAt'], page: { before } }, { context: GLOBEX }),
      ),
    ).toMatchObject({ parameter: 'before', reason: 'context' });
  });

  it('rejects an unbound cursor where a context is passed', async () => {
    const after = await cursorUnder();
    expect(await resume(after, ACME)).toMatchObject({ reason: 'context' });
    expect(await resume(after)).toBeUndefined();
  });

  it('keeps the binding of a request without a context, so earlier cursors still resume', async () => {
    const unbound = await plan({ sort: ['-createdAt'] });
    const sort = [
      { field: 'createdAt', direction: 'desc' },
      { field: 'id', direction: 'asc' },
    ] as const;
    expect(unbound.context).toBe(
      await sha256Base64Url(
        canonicalJson({ sort: sortSignature(sort), filter: null, search: '' }),
      ),
    );
    expect(
      (await plan({ sort: ['-createdAt'] }, { context: {} })).context,
    ).toBe(unbound.context);
  });

  it('binds a bigint as its decimal text and a number apart from a string', async () => {
    const big = await plan({}, { context: { tenant: 42n } });
    const text = await plan({}, { context: { tenant: '42' } });
    const number = await plan({}, { context: { tenant: 42 } });
    expect(big.context).toBe(text.context);
    expect(number.context).not.toBe(text.context);
  });

  it('checks the context before the request', async () => {
    const error = await rejected(
      plan({ sort: ['bio'] }, { context: { tenant: Number.NaN } }),
    );
    expect(error).toBeInstanceOf(TypeError);
    expect(error).not.toBeInstanceOf(UnsupportedSortError);
  });
});
