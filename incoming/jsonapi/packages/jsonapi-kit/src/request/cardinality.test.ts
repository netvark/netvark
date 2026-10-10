import type { ResourceLinkage } from '../document/types';

import { describe, expect, it } from 'vitest';

import { toManyLinkage, toOneLinkage } from './cardinality';

/** A parsed document that carried no relationships. */
const relationships: Readonly<Record<string, ResourceLinkage>> = {};

describe('toOneLinkage', () => {
  it('passes an identifier, null, and absence through', () => {
    expect(toOneLinkage({ type: 'people', id: '1' })).toEqual({
      type: 'people',
      id: '1',
    });
    expect(toOneLinkage(null)).toBeNull();
    expect(toOneLinkage(relationships['author'])).toBeUndefined();
  });

  it('throws for to-many linkage', () => {
    expect(() => toOneLinkage([])).toThrow(TypeError);
  });
});

describe('toManyLinkage', () => {
  it('passes an array and absence through', () => {
    expect(toManyLinkage([{ type: 'tags', id: 't1' }])).toEqual([
      { type: 'tags', id: 't1' },
    ]);
    expect(toManyLinkage([])).toEqual([]);
    expect(toManyLinkage(relationships['tags'])).toBeUndefined();
  });

  it('throws for to-one linkage', () => {
    expect(() => toManyLinkage(null)).toThrow(TypeError);
    expect(() => toManyLinkage({ type: 'people', id: '1' })).toThrow(/to-one/u);
  });
});
