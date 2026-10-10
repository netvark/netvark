/**
 * `@netvark/resource-core/testing`: what a test suite runs a declared
 * resource against. `boundaryFixtures` generates the values an oracle
 * compares with PostgreSQL (SPEC 15.3); the storage contract suite joins it
 * with the server entry (SPEC 12.9).
 * @packageDocumentation
 */
export type { ResourceBoundaries } from './boundary-fixtures';
export type { BoundaryFixture } from './fixture';

export { boundaryFixtures } from './boundary-fixtures';
