import { describe, expect, it } from 'vitest';

import { createBan } from '../core/create-ban';
import { plain } from '../formats/plain';
import { compileWithAjv } from '../test-support/ajv';
import { assertFormatConformance, expectBanError, renderError } from './index';

const ban = createBan();
/** A schema no body can satisfy, so every conformance case fails. */
const empty = () => ({ type: 'object', additionalProperties: false });

describe('expectBanError', () => {
  it('passes for matching errors and narrows', () => {
    const value: unknown = ban.notFound('x');
    expect(() => {
      expectBanError(value, { status: 404, code: 'NOT_FOUND', detail: 'x' });
    }).not.toThrow();
    expectBanError(value);
    expect(value.status).toBe(404);
  });

  it('explains what is wrong', () => {
    expect(() => {
      expectBanError(new Error('boom'));
    }).toThrow('Expected a BanError, received Error: boom');
    expect(() => {
      expectBanError('nope');
    }).toThrow('received "nope"');
    expect(() => {
      expectBanError(ban.notFound('x'), {
        status: 409,
        code: 'C',
        detail: 'y',
      });
    }).toThrow(
      'status 404 !== 409; code "NOT_FOUND" !== "C"; detail "x" !== "y"',
    );
    expect(() => {
      expectBanError(ban.notFound(), { detail: 'y' });
    }).toThrow('detail undefined !== "y"');
  });
});

describe('renderError', () => {
  it('delegates to ban.render', () => {
    const rendered = renderError(ban, ban.notFound(), { instance: '/x' });
    expect(rendered.body).toMatchObject({ status: 404, instance: '/x' });
  });
});

describe('assertFormatConformance', () => {
  it('reports every failing case of a broken format', () => {
    const broken = { ...plain(), schema: empty, errorsSchema: empty };
    let caught: unknown;
    try {
      assertFormatConformance(
        broken,
        { NOT_FOUND: ban.catalog.NOT_FOUND },
        {
          compile: compileWithAjv,
        },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    const aggregate = caught as AggregateError;
    // Three render cases, then three list cases for each of six locations.
    expect(aggregate.errors).toHaveLength(21);
    expect(aggregate.message).toContain('plain failed 21');
    const messages = aggregate.errors.map((entry) => (entry as Error).message);
    expect(messages[0]).toContain('NOT_FOUND minimal');
    expect(messages).toContainEqual(
      expect.stringMatching(/^plain NOT_FOUND errors-mixed\/cookie: /u),
    );
    const onlySchema = { ...plain(), schema: empty };
    expect(() => {
      assertFormatConformance(
        onlySchema,
        { NOT_FOUND: ban.catalog.NOT_FOUND },
        { compile: compileWithAjv },
      );
    }).toThrow('plain failed 3');
  });
});
