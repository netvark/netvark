import { describe, expect, it } from 'vitest';

import { checkPageInit, mergePage } from './check-page';

describe('checkPageInit and mergePage (SPEC 2, 3.7)', () => {
  it('keeps the members given, range included, and drops the absent ones', () => {
    expect(checkPageInit('t.page', { range: true })).toEqual({ range: true });
    expect(checkPageInit('t.page', { default: 10, max: 40 })).toEqual({
      default: 10,
      max: 40,
    });
  });

  it('merges member by member, so an override of max keeps the base range', () => {
    expect(mergePage('t.page', { range: true, max: 50 }, { max: 80 })).toEqual({
      range: true,
      max: 80,
    });
  });

  it('checks a default left unset against a lowered max', () => {
    // The shared default page size is 20, which a max of 10 cannot hold
    // unless the default follows it down.
    expect(mergePage('t.page', {}, { max: 10 })).toEqual({ max: 10 });
    expect(() => mergePage('t.page', { default: 20 }, { max: 10 })).toThrow(
      't.page.default: 20 exceeds the max page size 10',
    );
  });
});
