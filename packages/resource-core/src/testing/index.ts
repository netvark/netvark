/**
 * `@netvark/resource-core/testing`: what a test suite runs a declared
 * resource or a storage adapter against. `boundaryFixtures` generates the
 * values an oracle compares with PostgreSQL (SPEC 15.3); `storageContract`
 * checks an adapter against the obligations of SPEC 12.8 on the schema,
 * catalog, and declarations of `contractFixture` (SPEC 12.9).
 * @packageDocumentation
 */
export type { ResourceBoundaries } from './boundary-fixtures';
export type {
  ContractActor,
  ContractCodecs,
  ContractFixture,
  Point,
} from './contract/fixture';
export type { ContractCase, ContractHarness } from './contract/types';
export type { BoundaryFixture } from './fixture';

export { boundaryFixtures } from './boundary-fixtures';
export { contractFixture } from './contract/fixture';
export { storageContract } from './storage-contract';
