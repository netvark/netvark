import { describe, expect, it } from 'vitest';

import { Contacts, Organizations } from '../test-support/domain-resources';
import { defineScope, scopeColumnOf, scopeValues } from './scope';

interface AppActor {
  readonly organizationId: number;
  readonly region?: string;
}

const organization = defineScope({
  column: 'organization_id',
  value: (actor: AppActor) => actor.organizationId,
  session: 'app.organization_id',
});

describe('defineScope (SPEC 12.5)', () => {
  it('keeps the binding, frozen', () => {
    expect(organization.column).toBe('organization_id');
    expect(organization.session).toBe('app.organization_id');
    expect(organization.value({ organizationId: 7 })).toBe(7);
    expect(Object.isFrozen(organization)).toBe(true);
  });

  // What PGlite (PostgreSQL 18.3) and a PostgreSQL 14.19 server accept
  // from set_config, name by name.
  it.each([
    ['_app.org_1', true],
    ['App.Org', true],
    ['app.organization_id', true],
    ['app.user.organization_id', true],
    ['a.b.c.d', true],
    ['app.x$', true],
    ['app.größe', true],
    ['größe.x', true],
    ['app', false],
    ['app.', false],
    ['.app', false],
    ['app..x', false],
    ['1app.org', false],
    ['app.1x', false],
    ['app.$x', false],
    ['app.org-id', false],
    ['app.org id', false],
    ["app.org'; drop table x; --", false],
  ])('takes %s as a session parameter: %s', (session, valid) => {
    const define = () =>
      defineScope({ column: 'organization_id', value: () => 1, session });
    if (valid) {
      expect(define).not.toThrow();
    } else {
      expect(define).toThrow(
        new TypeError(
          'defineScope: organization_id: session must be two or more identifiers joined by dots, such as app.organization_id',
        ),
      );
    }
  });

  it.each([
    [null, 'defineScope: column must be a column name'],
    [
      { column: '', value: () => 1, session: 'a.b' },
      'defineScope: column must be a column name',
    ],
    [
      { column: 'org', value: 1, session: 'a.b' },
      'defineScope: org: value must be a function of the actor',
    ],
  ])('refuses the JavaScript binding %j', (binding, message) => {
    expect(() => Reflect.apply(defineScope, undefined, [binding])).toThrow(
      new TypeError(message),
    );
  });
});

describe('scopeValues (SPEC 12.5, 12.8)', () => {
  const bindings = {
    organization,
    region: defineScope({
      column: 'region',
      value: (actor: AppActor) => actor.region ?? '',
      session: 'app.region',
    }),
  };

  it("reads each scope's value for the actor, in the bindings' order", () => {
    expect(scopeValues(bindings, { organizationId: 7, region: 'eu' })).toEqual([
      {
        scope: 'organization',
        column: 'organization_id',
        session: 'app.organization_id',
        value: 7,
      },
      { scope: 'region', column: 'region', session: 'app.region', value: 'eu' },
    ]);
  });

  it.each([undefined, null, Number.NaN, Number.POSITIVE_INFINITY, {}, 1n])(
    'refuses the value %s, so an actor without a tenant never runs unscoped',
    (value) => {
      const broken = { organization: { ...organization, value: () => value } };
      expect(() =>
        Reflect.apply(scopeValues, undefined, [broken, { organizationId: 1 }]),
      ).toThrow(
        new TypeError(
          'scopeValues: scope organization gave a value that is not a string or a finite number',
        ),
      );
    },
  );
});

describe('scopeColumnOf (SPEC 12.5)', () => {
  it("gives the column of the declaration's scope, and nothing for a resource without one", () => {
    expect(scopeColumnOf(Contacts)).toBe('organization_id');
    expect(scopeColumnOf(Organizations)).toBeUndefined();
  });

  it('refuses a value declareResource did not return', () => {
    expect(() => scopeColumnOf({ ...Contacts })).toThrow(
      new TypeError(
        'scopeColumnOf: the resource must be a resource declareResource returned',
      ),
    );
  });
});
