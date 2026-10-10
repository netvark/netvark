import { describe, expect, it } from 'vitest';

import { formatParameterName, parseParameterName } from './parameter-name';

describe('parseParameterName', () => {
  it('splits a family name into base and members', () => {
    expect(parseParameterName('sort')).toEqual({ base: 'sort', members: [] });
    expect(parseParameterName('page[size]')).toEqual({
      base: 'page',
      members: ['size'],
    });
    expect(parseParameterName('filter[or][0][author.name][eq]')).toEqual({
      base: 'filter',
      members: ['or', '0', 'author.name', 'eq'],
    });
    expect(parseParameterName('filter[]')).toEqual({
      base: 'filter',
      members: [''],
    });
    expect(parseParameterName('filter[x][]')).toEqual({
      base: 'filter',
      members: ['x', ''],
    });
    expect(parseParameterName('atomic:lids[x]')).toEqual({
      base: 'atomic:lids',
      members: ['x'],
    });
  });

  it('rejects names outside the family grammar', () => {
    for (const name of [
      '',
      '[x]',
      'filter[',
      'filter]',
      'filter[x',
      'filter[x]]',
      'filter[[x]]',
      'filter[x]y',
      'filter[_x]',
      'filter[x.]',
      'filter[a b].c',
      'my.param',
      'page[size]=1',
      '__proto__[x]',
    ]) {
      expect(parseParameterName(name), name).toBeUndefined();
    }
  });

  it('formats the inverse', () => {
    expect(formatParameterName('fields', ['articles'])).toBe(
      'fields[articles]',
    );
    expect(formatParameterName('sort', [])).toBe('sort');
  });
});
