/**
 * The operations documents the processor runs, and those a schema cannot
 * judge as it does, which the Atomic Operations tests hold the request
 * schema and the processor to (SPEC 13.1, jsonapi SPEC 11.2 to 11.4), over
 * the registry of `atomic-registry.ts`. Not published with the package.
 * @packageDocumentation
 */
import { addTeam, ops, PERSON, TEAM } from './atomic-document-parts';

/** Documents the processor runs. */
export const ACCEPTED: ReadonlyArray<readonly [string, unknown]> = [
  ['an add', ops(addTeam())],
  ['an add by its collection href', ops({ ...addTeam(), href: '/api/teams' })],
  [
    'an add linking what an earlier add created, by lid',
    ops(addTeam('core'), {
      op: 'add',
      data: {
        type: 'people',
        attributes: { name: 'Ada' },
        relationships: { team: { data: { type: 'teams', lid: 'core' } } },
      },
    }),
  ],
  [
    'an update by ref',
    ops({
      op: 'update',
      ref: { type: 'teams', id: TEAM },
      data: { type: 'teams', id: TEAM, attributes: { name: 'Ops' } },
    }),
  ],
  [
    'an update by href',
    ops({
      op: 'update',
      href: `/api/teams/${TEAM}`,
      data: { type: 'teams', id: TEAM },
    }),
  ],
  [
    "an update of an earlier add, by the ref's lid",
    ops(addTeam('core'), {
      op: 'update',
      ref: { type: 'teams', lid: 'core' },
      data: { type: 'teams', lid: 'core' },
    }),
  ],
  [
    "an update of an earlier add, by data's lid alone",
    ops(addTeam('core'), {
      op: 'update',
      data: { type: 'teams', lid: 'core', attributes: { slug: 'ops' } },
    }),
  ],
  ['a remove by ref', ops({ op: 'remove', ref: { type: 'teams', id: TEAM } })],
  ['a remove by href', ops({ op: 'remove', href: `/api/teams/${TEAM}` })],
  [
    'an update of a relationship by ref',
    ops({
      op: 'update',
      ref: { type: 'teams', id: TEAM, relationship: 'lead' },
      data: { type: 'people', id: PERSON },
    }),
  ],
  [
    'an update of a nullable relationship to null',
    ops({
      op: 'update',
      ref: { type: 'teams', id: TEAM, relationship: 'lead' },
      data: null,
    }),
  ],
  [
    'an update of a relationship by its link',
    ops({
      op: 'update',
      href: `/api/teams/${TEAM}/relationships/lead`,
      data: null,
    }),
  ],
  [
    'an update of a relationship to what an earlier add created',
    ops(addTeam('core'), {
      op: 'update',
      ref: { type: 'people', id: PERSON, relationship: 'team' },
      data: { type: 'teams', lid: 'core' },
    }),
  ],
  [
    'an update of a type no add creates, by ref',
    ops({
      op: 'update',
      ref: { type: 'organizations', id: '7' },
      data: { type: 'organizations', id: '7', attributes: { name: 'Acme' } },
    }),
  ],
  [
    'top-level jsonapi, links, meta, and @-members, and meta on an operation',
    {
      ...ops({ ...addTeam(), meta: { by: 'import' } }),
      jsonapi: { version: '1.1' },
      links: {},
      meta: {},
      '@context': 'x',
    },
  ],
  ['ten operations', ops(...Array.from({ length: 10 }, () => addTeam()))],
  [
    'a lid beside the id, which the processor reads past',
    ops({
      op: 'update',
      ref: { type: 'organizations', id: '7' },
      data: { type: 'organizations', id: '7', lid: 'acme' },
    }),
  ],
  [
    'an update by ref whose data names the resource by a lid, which the processor reads past',
    ops({
      op: 'update',
      ref: { type: 'organizations', id: '7' },
      data: {
        type: 'organizations',
        lid: 'acme',
        attributes: { name: 'Acme' },
      },
    }),
  ],
  [
    'an update of a resource whose relationship is read only',
    ops({
      op: 'update',
      ref: { type: 'meetings', id: '3' },
      data: { type: 'meetings', id: '3', attributes: { notes: 'Agenda' } },
    }),
  ],
];

/**
 * Documents a schema cannot judge as the processor does, each with whether
 * the processor runs it: it refuses an `href` that names nothing or another
 * type and a `lid` no earlier `add` defined, which a schema cannot know,
 * and runs a non-nullable relationship set to `null`, which only the
 * runtime behind it refuses, and which the schema refuses.
 */
export const UNSTATED: ReadonlyArray<readonly [string, unknown, boolean]> = [
  [
    'an href that names nothing',
    ops({ op: 'remove', href: '/api/nothing' }),
    false,
  ],
  [
    'an add by the href of a resource',
    ops({ ...addTeam(), href: `/api/teams/${TEAM}` }),
    false,
  ],
  [
    "an href of another type than data's",
    ops({
      op: 'update',
      href: `/api/people/${PERSON}`,
      data: { type: 'teams', id: TEAM },
    }),
    false,
  ],
  [
    'a lid no earlier add defined',
    ops({
      op: 'update',
      ref: { type: 'teams', lid: 'core' },
      data: { type: 'teams', lid: 'core' },
    }),
    false,
  ],
  [
    'a lid of a type no add creates, naming the resource by data alone',
    ops({ op: 'update', data: { type: 'organizations', lid: 'acme' } }),
    false,
  ],
  [
    'a relationship that is not nullable set to null, which the runtime refuses',
    ops({
      op: 'update',
      ref: { type: 'people', id: PERSON, relationship: 'team' },
      data: null,
    }),
    true,
  ],
];
