/**
 * The queries the screen tests' screens read and write through (resource
 * SPEC 20.8), made once per API as an application makes them beside its
 * clients. Not published with the package.
 * @packageDocumentation
 */
import type { AnyResource } from '@netvark/jsonapi-core';

import type { ResourceQueries } from '../../tanstack-query/query-types';
import type { FixtureDefinitions, QueryServer } from '../query-server';

import { resourceQueries } from '../../tanstack-query/queries';

/** A record of the fixture's clients, typed as wide as their definitions. */
export type ScreenRecord = Readonly<Record<string, unknown>> & {
  readonly id: string;
};

/** The contacts' and the organizations' queries. */
export interface ScreenQueries {
  readonly contacts: ResourceQueries<FixtureDefinitions, AnyResource>;
  readonly organizations: ResourceQueries<FixtureDefinitions, AnyResource>;
}

/** The queries over `server`'s clients. */
export function screenQueries({ clients }: QueryServer): ScreenQueries {
  return {
    contacts: resourceQueries(clients.contacts),
    organizations: resourceQueries(clients.organizations),
  };
}
