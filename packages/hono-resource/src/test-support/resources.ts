/**
 * The declarations the routes' tests serve, over the storage contract's
 * catalog and linked under `/api`: tasks, scoped to a workspace, with
 * every operation, an includable workspace, and an includable parent;
 * workspaces, which serve `get` only; and logs, typed `entrées` so its
 * links percent-encode the type, which serve `list` and `create` with
 * client ids. What this module exports is typed wide, as a host takes
 * it. Not published with the package.
 */
import type { DeclaredResource } from '@netvark/resource-core';

import { createDeclareResource } from '@netvark/resource-core';
import { contractFixture } from '@netvark/resource-core/testing';

const declareResource = createDeclareResource({
  catalog: contractFixture.catalog,
  codecs: contractFixture.codecs,
  scopes: { workspace: { column: 'workspace_id' } },
  links: { base: '/api' },
});

export const Workspaces: DeclaredResource = declareResource('workspaces', {
  operations: ['get'],
  fields: { name: { access: 'read' } },
});

export const Tasks: DeclaredResource = declareResource('tasks', {
  operations: ['list', 'get', 'create', 'update', 'remove'],
  scope: 'workspace',
  fields: {
    title: { access: 'readWrite', filter: ['eq'], sort: true },
    done: { access: 'readWrite', filter: ['eq'] },
  },
  relationships: {
    workspace_id: { target: () => Workspaces, access: 'read', include: true },
    parent_id: { target: () => Tasks, access: 'readWrite', include: true },
  },
});

export const Logs: DeclaredResource = declareResource('logs', {
  as: 'entrées',
  operations: ['list', 'create'],
  clientIds: true,
  fields: { note: { access: 'readWrite' } },
  relationships: {
    owner_id: { target: () => Workspaces, access: 'readWrite' },
  },
});

/** Every resource of the tests, in the order a runtime lists them. */
export const RESOURCES: ReadonlyArray<DeclaredResource> = [
  Tasks,
  Workspaces,
  Logs,
];
