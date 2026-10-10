import type { ErrorObject } from '../document/types';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { isBanError } from '@netvark/ban-core';

import { errorObjects } from '../errors/json-api-error';
import { defineResource } from '../resource/define-resource';
import { parseResourceObject, parseUpdateDocument } from './resource-document';

interface Row {
  readonly id: string;
}

const CreateArticle = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  rating: z.coerce.number().int().min(0).max(5).optional(),
});

const Articles = defineResource({
  type: 'articles',
  attributes: ['title', 'body', 'rating'],
  relationships: {
    author: { type: 'people', cardinality: 'one' },
    tags: { type: 'tags', cardinality: 'many' },
  },
  serialize: (row: Row) => ({ id: row.id }),
  validate: { create: CreateArticle, update: CreateArticle.partial() },
});

async function errorsOf(promise: Promise<unknown>): Promise<{
  status: number;
  errors: ReadonlyArray<ErrorObject>;
}> {
  try {
    await promise;
  } catch (error) {
    if (isBanError(error)) {
      return { status: error.status, errors: errorObjects(error) };
    }
    throw error;
  }
  throw new Error('expected a BanError');
}

describe('parseUpdateDocument', () => {
  it('requires type and id and matches the id to the request', async () => {
    const parsed = await parseUpdateDocument(
      Articles,
      { data: { type: 'articles', id: '1' } },
      '1',
    );
    expect(parsed).toMatchObject({
      id: '1',
      attributes: {},
      relationships: {},
    });
    const missing = await errorsOf(
      parseUpdateDocument(Articles, { data: { type: 'articles' } }, '1'),
    );
    expect(missing.status).toBe(400);
    expect(missing.errors[0]?.source?.pointer).toBe('/data/id');
    const mismatch = await errorsOf(
      parseUpdateDocument(
        Articles,
        { data: { type: 'articles', id: '2' } },
        '1',
      ),
    );
    expect(mismatch.status).toBe(409);
    expect(mismatch.errors[0]?.detail).toContain('"2"');
  });

  it('validates with the update validator and leaves missing attributes alone', async () => {
    const parsed = await parseUpdateDocument(
      Articles,
      { data: { type: 'articles', id: '1', attributes: { rating: '5' } } },
      '1',
    );
    expect(parsed.attributes).toEqual({ rating: 5 });
    const invalid = await errorsOf(
      parseUpdateDocument(
        Articles,
        { data: { type: 'articles', id: '1', attributes: { rating: 9 } } },
        '1',
      ),
    );
    expect(invalid.status).toBe(422);
    expect(invalid.errors[0]?.source?.pointer).toBe('/data/attributes/rating');
  });

  it('accepts a lid in place of id when allowed (atomic update)', async () => {
    const parsed = await parseResourceObject(
      Articles,
      { type: 'articles', lid: 'new', attributes: { title: 'x' } },
      { operation: 'update', lids: true, pointer: '/atomic:operations/0/data' },
    );
    expect(parsed.lid).toBe('new');
    const bad = await errorsOf(
      parseResourceObject(
        Articles,
        { type: 'articles', id: 5 },
        { operation: 'update', pointer: '/op' },
      ),
    );
    expect(bad.errors.map((error) => error.source?.pointer)).toEqual([
      '/op/id',
      '/op/id',
    ]);
  });
});
