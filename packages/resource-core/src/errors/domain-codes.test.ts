import { describe, expect, it } from 'vitest';

import { internalsOf } from '../declare/declared-resource';
import {
  check,
  checkedDomain,
  declareOver,
  domainColumn,
  SIZE,
  UPPER,
} from '../test-support/errors';

const V_CHECK = {
  v_check: { kind: 'check', columns: ['v'], rule: SIZE, enforced: true },
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
        "t: domain vd's CHECK v_check derives code V_CHECK, which constraint v_check also takes; set code on one of them",
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
        "t: domain inner's CHECK value_check derives code VALUE_CHECK, which domain outer's CHECK value_check also takes; set code on one of them",
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
        `t: domain size's CHECK größe_check derives code "GRÖSSE_CHECK", which is not A-Z, 0-9, _; give it a code in createDeclareResource domains`,
      ),
    );
  });
});

describe('errors: a domain CHECK with a rule renamed by the definer (SPEC 3.6)', () => {
  const chain = [
    checkedDomain('inner', 'value_check', UPPER),
    checkedDomain('outer', 'value_check', SIZE, 'inner'),
  ];

  it('gives the CHECK its code over every member of the domain, and maps a violation to it', () => {
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
      { email: { email_check: { code: 'EMAIL_UPPER_CASE' } } },
    );
    expect(resource.errors).toEqual({
      EMAIL_UPPER_CASE: check('workEmail', 'homeEmail'),
    });
    expect(internalsOf(resource)?.domainChecks).toEqual(
      new Map([['email', new Map([['email_check', 'EMAIL_UPPER_CASE']])]]),
    );
  });

  it('resolves a collision with a table constraint in the definer, not the declaration', () => {
    const resource = declareOver(
      { v: domainColumn('vd') },
      V_CHECK,
      [checkedDomain('vd', 'v_check', UPPER)],
      WRITTEN_V,
      { vd: { v_check: { code: 'VD_CHECK' } } },
    );
    expect(Object.keys(resource.errors)).toEqual(['V_CHECK', 'VD_CHECK']);
  });

  it('resolves two CHECKs of a domain chain that derive one code', () => {
    const resource = declareOver(
      { v: domainColumn('outer') },
      {},
      chain,
      WRITTEN_V,
      {
        inner: { value_check: { code: 'INNER_VALUE_CHECK' } },
      },
    );
    expect(Object.keys(resource.errors)).toEqual([
      'VALUE_CHECK',
      'INNER_VALUE_CHECK',
    ]);
  });

  it('gives a code to a CHECK whose name derives none', () => {
    const resource = declareOver(
      { v: domainColumn('size') },
      {},
      [checkedDomain('size', 'größe_check', UPPER)],
      { fields: { v: { access: 'read' } } },
      { size: { größe_check: { code: 'SIZE_CHECK' } } },
    );
    expect(Object.keys(resource.errors)).toEqual(['SIZE_CHECK']);
  });

  it('refuses a given code that another code of the resource takes', () => {
    expect(() =>
      declareOver({ v: domainColumn('outer') }, {}, chain, WRITTEN_V, {
        inner: { value_check: { code: 'VALUE_CHECK' } },
      }),
    ).toThrow(
      new TypeError(
        "t: domain inner's CHECK value_check takes code VALUE_CHECK, which domain outer's CHECK value_check also takes; set code on one of them",
      ),
    );
  });
});
