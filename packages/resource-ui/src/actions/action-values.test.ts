/**
 * An update action's values held to the declaration (resource SPEC 21.2,
 * 21.4): the members the update writes, a relationship by id or by
 * identifier as the client sends it, values the update's validator refuses,
 * and a CHECK across a field and a relationship that runs only when the
 * values carry both (SPEC 6.2).
 */
import { describe, expect, it } from 'vitest';

import { text } from '../test-support/messages';
import { Contacts, Organizations } from '../test-support/resources';
import { recordActions } from './record-actions';

/** A JavaScript caller's arguments, which the types would refuse. */
const untyped = recordActions as (...args: Array<any>) => any;

const label = text('Ändern', 'Change');

/** The variables of an update action of `values` on `resource`, for the record `id`. */
function variables(resource: unknown, values: unknown, id = '7'): unknown {
  const rows = untyped(resource, {
    actions: { change: { label, update: values } },
  });
  return rows.change.variables({ type: 'any', id });
}

/** The message of the `TypeError` an update action of `values` on `resource` throws. */
function refusal(resource: unknown, values: unknown): string {
  try {
    variables(resource, values);
  } catch (error) {
    expect(error).toBeInstanceOf(TypeError);
    return (error as TypeError).message;
  }
  throw new Error('the values were not refused');
}

describe('the values of an update action (resource SPEC 21.2)', () => {
  it('holds values of members the update writes, a write-only member among them, frozen', () => {
    const values = {
      attributes: { name: 'Analytical Engines', inviteCode: 'BABBAGE-1' },
    };
    const sent = variables(Organizations, values);

    expect(sent).toStrictEqual({ id: '7', ...values });
    expect(Object.isFrozen((sent as typeof values).attributes)).toBe(true);
  });

  it('keeps the values as given while the application changes its own object', () => {
    const attributes: Record<string, unknown> = { status: 'archived' };
    const rows = untyped(Contacts, {
      actions: { archive: { label, update: { attributes } } },
    });
    attributes['status'] = 'deleted';

    expect(rows.archive.variables({ id: 'c1' })).toStrictEqual({
      id: 'c1',
      attributes: { status: 'archived' },
    });
  });

  it.each([
    ['an id', '7'],
    ['an identifier', { type: 'organizations', id: '7' }],
    [
      'a record, whose type and id are what the client sends',
      { type: 'organizations', id: '7', name: 'AE' },
    ],
  ])(
    'takes a relationship given as %s, which the client sends as the identifier',
    (_, organization) => {
      const values = { relationships: { organization } };

      expect(variables(Contacts, values, 'c1')).toStrictEqual({
        id: 'c1',
        ...values,
      });
    },
  );

  it('takes null for a nullable relationship, and leaves a member set to undefined out of the count', () => {
    expect(
      variables(Contacts, { relationships: { referredBy: null } }, 'c1'),
    ).toStrictEqual({ id: 'c1', relationships: { referredBy: null } });
    expect(
      variables(
        Contacts,
        {
          attributes: { status: 'archived', nickname: undefined },
        },
        'c1',
      ),
    ).toStrictEqual({
      id: 'c1',
      attributes: { status: 'archived', nickname: undefined },
    });
  });

  it('runs a CHECK across a field and a relationship only when the values carry both, the database judging the others', () => {
    expect(
      variables(Organizations, { attributes: { verified: false } }),
    ).toStrictEqual({
      id: '7',
      attributes: { verified: false },
    });
    expect(
      refusal(Organizations, {
        attributes: { verified: false },
        relationships: { plan: 'enterprise' },
      }),
    ).toBe(
      "recordActions: options.actions.change.update does not pass the update's validator at relationships.plan, attributes.verified",
    );
  });
});

describe('the TypeErrors of values the declaration refuses (resource SPEC 21.4)', () => {
  it.each([
    [
      'an immutable member',
      { attributes: { kind: 'company' } },
      'attributes.kind',
    ],
    [
      'a read-only member',
      { attributes: { createdAt: '2026-01-01T00:00:00Z' } },
      'attributes.createdAt',
    ],
    [
      'a relationship under attributes',
      { attributes: { organization: '7' } },
      'attributes.organization',
    ],
    [
      'a field under relationships',
      { relationships: { status: 'archived' } },
      'relationships.status',
    ],
    [
      'a member the resource does not have',
      { attributes: { nope: 1 } },
      'attributes.nope',
    ],
    [
      'a name Object.prototype holds',
      { attributes: { constructor: 'x' } },
      'attributes.constructor',
    ],
  ])('refuses %s, naming it', (_, values, member) => {
    expect(refusal(Contacts, values)).toBe(
      `recordActions: options.actions.change.update.${member} is not a member the update of contacts writes`,
    );
  });

  it.each([
    ['a text', 'archived', '.update must be an object'],
    ['a list', [{ status: 'archived' }], '.update must be an object'],
    [
      'a part of no write',
      { attributes: { status: 'archived' }, meta: {} },
      '.update.meta is neither attributes nor relationships',
    ],
    [
      'a part that is no object',
      { attributes: ['archived'] },
      '.update.attributes must be an object',
    ],
    ['no member', {}, '.update sets no member'],
    [
      'empty parts',
      { attributes: {}, relationships: {} },
      '.update sets no member',
    ],
    [
      'members set to undefined alone',
      { attributes: { status: undefined } },
      '.update sets no member',
    ],
  ])('refuses %s as the values', (_, values, message) => {
    expect(refusal(Contacts, values)).toBe(
      `recordActions: options.actions.change${message}`,
    );
  });

  it.each([
    [
      'a value outside the enum',
      { attributes: { status: 'deleted' } },
      'attributes.status',
    ],
    [
      'two refused fields, named in the order of the declaration',
      { attributes: { status: 'deleted', name: '' } },
      'attributes.name, attributes.status',
    ],
    [
      'null for a relationship that is not nullable',
      { relationships: { organization: null } },
      'relationships.organization',
    ],
    [
      'an id that is not the target key',
      { relationships: { organization: 'seven' } },
      'relationships.organization.id',
    ],
    [
      'a list for a relationship, which is to-one',
      { relationships: { organization: ['7'] } },
      'relationships.organization',
    ],
    [
      'an identifier of another type',
      { relationships: { organization: { type: 'plans', id: '7' } } },
      'relationships.organization.type',
    ],
  ])(
    "refuses %s, naming each issue's path and never the value",
    (_, values, paths) => {
      const message = refusal(Contacts, values);

      expect(message).toBe(
        `recordActions: options.actions.change.update does not pass the update's validator at ${paths}`,
      );
      expect(message).not.toMatch(/deleted|seven|plans/u);
    },
  );
});
