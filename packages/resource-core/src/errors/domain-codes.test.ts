import { describe, expect, it } from 'vitest';

import {
  check,
  checkedDomain,
  declareOver,
  domainColumn,
  SIZE,
  UPPER,
} from '../test-support/errors';

const V_CHECK = {
  v_check: { kind: 'check', columns: ['v'], rule: SIZE },
} as const;

const WRITTEN_V = { fields: { v: { access: 'readWrite' } } };

function overVd(declaration: object) {
  return declareOver(
    { v: domainColumn('vd') },
    V_CHECK,
    [checkedDomain('vd', 'v_check', UPPER)],
    declaration,
  );
}

describe('errors: the codes of domain CHECKs (SPEC 3.6, 9.1)', () => {
  it('gives a domain several members pass one code over all of them, in column order', () => {
    const resource = declareOver(
      { work_email: domainColumn('email'), home_email: domainColumn('email') },
      {},
      [checkedDomain('email', 'email_check', UPPER)],
      {
        fields: {
          home_email: { access: 'readWrite' },
          work_email: { access: 'read' },
        },
      },
    );
    expect(resource.errors).toEqual({
      EMAIL_CHECK: check('workEmail', 'homeEmail'),
    });
  });

  it('derives a code for each CHECK of each domain in a chain, outermost first', () => {
    const resource = declareOver(
      { label: domainColumn('code') },
      {},
      [
        checkedDomain('short', 'short_check', SIZE),
        checkedDomain('code', 'code_check', UPPER, 'short'),
      ],
      { fields: { label: { access: 'readWrite' } } },
    );
    expect(Object.keys(resource.errors)).toEqual(['CODE_CHECK', 'SHORT_CHECK']);
    expect(resource.errors['SHORT_CHECK']).toEqual(check('label'));
  });

  it('refuses a domain CHECK whose code a table constraint of the resource takes, until the rule renames it', () => {
    expect(() => overVd(WRITTEN_V)).toThrow(
      new TypeError(
        "t: domain vd's CHECK v_check derives code V_CHECK, which constraint v_check also takes",
      ),
    );
    const renamed = overVd({
      ...WRITTEN_V,
      rules: { v_check: { code: 'T_V_CHECK' } },
    });
    expect(Object.keys(renamed.errors)).toEqual(['T_V_CHECK', 'V_CHECK']);
  });

  it('refuses two CHECKs of a domain chain that derive one code', () => {
    expect(() =>
      declareOver(
        { v: domainColumn('outer') },
        {},
        [
          checkedDomain('inner', 'value_check', UPPER),
          checkedDomain('outer', 'value_check', SIZE, 'inner'),
        ],
        WRITTEN_V,
      ),
    ).toThrow(
      new TypeError(
        "t: domain inner's CHECK value_check derives code VALUE_CHECK, which domain outer's CHECK value_check also takes",
      ),
    );
  });

  it('refuses a domain CHECK whose derived code is not A-Z, 0-9, _', () => {
    expect(() =>
      declareOver(
        { v: domainColumn('size') },
        {},
        [checkedDomain('size', 'größe_check', UPPER)],
        { fields: { v: { access: 'read' } } },
      ),
    ).toThrow(
      new TypeError(
        `t: domain size's CHECK größe_check derives code "GRÖSSE_CHECK", which is not A-Z, 0-9, _; rename the constraint`,
      ),
    );
  });
});
