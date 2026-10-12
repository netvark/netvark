/**
 * The operations documents the processor refuses, which the Atomic
 * Operations tests hold the request schema to (SPEC 13.1, jsonapi SPEC
 * 11.2 to 11.4), over the registry of `atomic-registry.ts`. Not published
 * with the package.
 * @packageDocumentation
 */
import { addTeam, ops, PERSON, TEAM, team } from './atomic-document-parts';

/** Documents the processor refuses. */
export const REFUSED: ReadonlyArray<readonly [string, unknown]> = [
  ['no operations', ops()],
  ['eleven operations', ops(...Array.from({ length: 11 }, () => addTeam()))],
  ['an unknown top-level member', { ...ops(addTeam()), extra: true }],
  ['an unknown op', ops({ ...addTeam(), op: 'upsert' })],
  ['an unknown member of an operation', ops({ ...addTeam(), extra: true })],
  ['an add by ref', ops({ ...addTeam(), ref: { type: 'teams', id: TEAM } })],
  [
    'a ref with id and lid',
    ops({ op: 'remove', ref: { type: 'teams', id: TEAM, lid: 'core' } }),
  ],
  [
    'a ref with neither id nor lid',
    ops({ op: 'remove', ref: { type: 'teams' } }),
  ],
  ['a remove without a target', ops({ op: 'remove' })],
  [
    'a remove by ref and href',
    ops({
      op: 'remove',
      ref: { type: 'teams', id: TEAM },
      href: `/api/teams/${TEAM}`,
    }),
  ],
  [
    'an update without id or lid',
    ops({ op: 'update', data: { type: 'teams', attributes: { name: 'Ops' } } }),
  ],
  [
    'an update whose data has another type',
    ops({
      op: 'update',
      ref: { type: 'teams', id: TEAM },
      data: { type: 'people', id: TEAM },
    }),
  ],
  [
    'an add of a type no add creates',
    ops({
      op: 'add',
      data: { type: 'organizations', attributes: { name: 'Acme' } },
    }),
  ],
  [
    'a remove of a type that removes nothing',
    ops({ op: 'remove', ref: { type: 'people', id: PERSON } }),
  ],
  ['an unknown type', ops({ op: 'remove', ref: { type: 'ghosts', id: '1' } })],
  [
    'an add with an unknown attribute',
    ops({ op: 'add', data: team({ color: 'red' }) }),
  ],
  [
    'an add with an id the server assigns',
    ops({ op: 'add', data: { ...team(), id: TEAM } }),
  ],
  [
    'an add without a required attribute',
    ops({ op: 'add', data: { type: 'teams', attributes: { name: 'Core' } } }),
  ],
  [
    'an add of a value of another type',
    ops({ op: 'add', data: team({ name: 5 }) }),
  ],
  [
    'linkage by the lid of a type no add creates',
    ops({
      op: 'add',
      data: {
        type: 'contacts',
        attributes: { kind: 'person', name: 'Ada' },
        relationships: {
          organization: { data: { type: 'organizations', lid: 'acme' } },
        },
      },
    }),
  ],
  [
    'a ref by the lid of a type no add creates',
    ops({
      op: 'update',
      ref: { type: 'organizations', lid: 'acme' },
      data: { type: 'organizations', lid: 'acme' },
    }),
  ],
  [
    'a to-one relationship added to',
    ops({
      op: 'add',
      ref: { type: 'teams', id: TEAM, relationship: 'lead' },
      data: [{ type: 'people', id: PERSON }],
    }),
  ],
  [
    'an unknown relationship',
    ops({
      op: 'update',
      ref: { type: 'teams', id: TEAM, relationship: 'members' },
      data: null,
    }),
  ],
  [
    'a relationship update with resource linkage of another type',
    ops({
      op: 'update',
      ref: { type: 'teams', id: TEAM, relationship: 'lead' },
      data: { type: 'teams', id: TEAM },
    }),
  ],
  ['an add without data', ops({ op: 'add' })],
  [
    'a ref by the lid of a type no add creates, its data by id',
    ops(addTeam('acme'), {
      op: 'update',
      ref: { type: 'organizations', lid: 'acme' },
      data: { type: 'organizations', id: '7', attributes: { name: 'Acme' } },
    }),
  ],
  [
    'linkage of a type alone',
    ops({
      op: 'update',
      ref: { type: 'teams', id: TEAM, relationship: 'lead' },
      data: { type: 'people' },
    }),
  ],
  [
    'an update of a relationship the resource reads only',
    ops({
      op: 'update',
      ref: { type: 'meetings', id: '3', relationship: 'organization' },
      data: { type: 'organizations', id: '7' },
    }),
  ],
  [
    'an update writing a relationship the resource reads only',
    ops({
      op: 'update',
      ref: { type: 'meetings', id: '3' },
      data: {
        type: 'meetings',
        id: '3',
        relationships: {
          organization: { data: { type: 'organizations', id: '7' } },
        },
      },
    }),
  ],
];
