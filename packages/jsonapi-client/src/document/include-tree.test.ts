/**
 * The include paths as a tree (SPEC 15.6): each segment of a path is a
 * branch, so `author.articles` resolves `author` too.
 */
import { describe, expect, it } from 'vitest';

import { includeTree, NO_INCLUDES } from './include-tree';

describe('includeTree', () => {
  it('branches at each segment and merges the paths that share one', () => {
    const tree = includeTree(['author.articles.tags', 'tags', 'author']);
    expect([...tree.keys()]).toEqual(['author', 'tags']);
    expect([...(tree.get('author')?.keys() ?? [])]).toEqual(['articles']);
    expect([...(tree.get('author')?.get('articles')?.keys() ?? [])]).toEqual([
      'tags',
    ]);
    expect(tree.get('tags')?.size).toBe(0);
  });

  it('is empty for no paths', () => {
    expect(includeTree([]).size).toBe(0);
    expect(NO_INCLUDES.size).toBe(0);
  });
});
