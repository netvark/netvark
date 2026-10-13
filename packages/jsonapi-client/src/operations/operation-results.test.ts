/**
 * The response to `sendOperations` (SPEC 17.2) through a fetch double:
 * each result held to its operation's shape, every other 2xx a
 * `TypeError` that never quotes the document, and a refusal a
 * `ResponseError` whose pointers name the operation that failed.
 * @ref https://jsonapi.org/ext/atomic/#result-objects
 * @ref https://jsonapi.org/ext/atomic/#processing-errors
 */
import type { Answer } from '../test-support/fetch-double';

import { describe, expect, it } from 'vitest';

import { isResponseError } from '../errors/response-error';
import { Articles, People } from '../test-support/blog';
import { fetchDouble, jsonApi } from '../test-support/fetch-double';
import { createTransport } from '../transport/transport';
import { operationOf } from './operation-of';
import { operationsOf } from './operations-of';
import { sendOperations } from './send-operations';

const ORIGIN = 'https://api.example.test';
const articles = operationsOf(Articles);
const people = operationsOf(People);
const STORED = {
  type: 'articles',
  id: 'a9',
  attributes: { title: 'T', body: 'B' },
};

function transportWith(...answers: ReadonlyArray<Answer>) {
  return createTransport({
    origin: ORIGIN,
    fetch: fetchDouble(...answers).fetch,
  });
}

/** The results of a 200 holding `results`, for the operations given. */
async function resultsOf(
  results: unknown,
  operations: Parameters<typeof sendOperations>[1],
): Promise<unknown> {
  return sendOperations(
    transportWith(jsonApi({ 'atomic:results': results })),
    operations,
  );
}

describe('sendOperations: the response (SPEC 17.2)', () => {
  it("keeps a result's meta and the data of an update's result", async () => {
    const result = await resultsOf(
      [{ data: STORED, meta: { version: 2 } }],
      [articles.update('a9', { attributes: { title: 'T' } })],
    );

    expect(result).toMatchObject({
      results: [{ data: { id: 'a9', title: 'T' }, meta: { version: 2 } }],
    });
  });

  it.each([
    [
      'a list of results of another length',
      [{}],
      [articles.remove('a1'), articles.remove('a2')],
      'articles operations answered 200 with 1 results for 2 operations',
    ],
    [
      'a result that is not an object',
      ['done'],
      [articles.remove('a1')],
      'articles operations answered 200 with result 0, which is not a result object',
    ],
    [
      'data on the result of a removal, which "MUST return a result with no data"',
      [{ data: null }],
      [articles.remove('a1')],
      'articles operations answered 200 with data at result 0, which the result of its operation must not hold',
    ],
    [
      'data on the result of a relationship operation',
      [{ data: [{ type: 'tags', id: 't1' }] }],
      [articles.addToRelationship('a1', 'tags', ['t1'])],
      'articles operations answered 200 with data at result 0, which the result of its operation must not hold',
    ],
    [
      "a list as a create's data",
      [{ data: [STORED] }],
      [articles.create({ attributes: { title: 'T', body: 'B' } })],
      'articles operations answered 200 with data at result 0 that is not a resource object',
    ],
    [
      "null as an update's data",
      [{ data: null }],
      [articles.update('a1', {})],
      'articles operations answered 200 with data at result 0 that is not a resource object',
    ],
  ])('throws TypeError for %s', async (_, results, operations, message) => {
    await expect(resultsOf(results, operations)).rejects.toThrow(
      new TypeError(message),
    );
  });

  it('throws TypeError for a 200 without atomic:results and for another 2xx, never quoting the document', async () => {
    const operations = [articles.remove('a1')];
    const transport = transportWith(
      jsonApi({ meta: { secret: 's3cr3t' } }),
      jsonApi({ 'atomic:results': [{}] }, 201),
    );

    await expect(sendOperations(transport, operations)).rejects.toThrow(
      new TypeError('articles operations answered 200 without atomic:results'),
    );
    await expect(sendOperations(transport, operations)).rejects.toThrow(
      new TypeError(
        'articles operations answered 201 where a 200 with atomic:results or a 204 is the answer',
      ),
    );
  });

  it('rejects a refusal with a ResponseError naming the types and the call, whose pointers name the operation that failed', async () => {
    const transport = transportWith(
      jsonApi(
        {
          errors: [
            {
              status: '422',
              code: 'VALIDATION_FAILED',
              source: { pointer: '/atomic:operations/1/data/attributes/name' },
            },
          ],
        },
        422,
      ),
    );

    const error: unknown = await sendOperations(transport, [
      articles.remove('a1'),
      people.update('p1', { attributes: { name: '' } }),
      articles.remove('a2'),
    ]).then(
      () => expect.unreachable(),
      (failure: unknown) => failure,
    );

    expect(isResponseError(error, 'VALIDATION_FAILED')).toBe(true);
    if (!isResponseError(error)) {
      return;
    }
    expect([error.message, error.status]).toStrictEqual([
      'articles, people operations answered 422',
      422,
    ]);
    expect(error.errors.map((object) => operationOf(object))).toStrictEqual([
      { index: 1, pointer: '/data/attributes/name' },
    ]);
  });
});
