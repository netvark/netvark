import { describe, expect, it } from 'vitest';

import { contractFixture } from './fixture';
import { DEFAULT_ORDER } from './list-data';
import { FILTERS, SORTS } from './list-requests';

const fields = Object.entries(contractFixture.resources.tasks.keyset.fields);

describe('the requests of the list cases', () => {
  it('filter with every operator tasks declares, and no other', () => {
    const declared = fields.flatMap(([name, field]) =>
      (field.operators ?? []).map((op) => `${name} ${op}`),
    );
    const covered = FILTERS.map(
      ({ request }) => `${request.field} ${request.op}`,
    );
    expect(declared.filter((pair) => !covered.includes(pair))).toEqual([]);
    expect(covered.filter((pair) => !declared.includes(pair))).toEqual([]);
  });

  it('sort by every sortable field of tasks in both directions', () => {
    const sortable = fields
      .filter(([, field]) => field.sortable === true)
      .flatMap(([name]) => [name, `-${name}`]);
    expect(SORTS.map(({ request }) => request).toSorted()).toEqual(
      sortable.toSorted(),
    );
  });

  it("order each of workspace 1's tasks once in every sort", () => {
    for (const { titles } of SORTS) {
      expect(titles.toSorted()).toEqual(DEFAULT_ORDER.toSorted());
    }
  });
});
