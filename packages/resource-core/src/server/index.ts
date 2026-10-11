/**
 * `@netvark/resource-core/server`: what only a server composes, typed by
 * the application's registries (SPEC 12, ADR 0008): the domain definers,
 * policies, behavior, scopes, quotas, events, `reject`, the database
 * rejections of SPEC 9.5, and the storage adapter contract. Nothing here
 * touches a database; adapters implement the contract.
 * @packageDocumentation
 */
export type {
  CreateBehavior,
  Effect,
  RemoveBehavior,
  ResourceBehavior,
  Rule,
  RuleContext,
  UpdateBehavior,
  ValuesContext,
} from './behavior-types';
export type { ConstraintErrorOptions } from './constraint-options';
export type { DomainDefiners } from './domain';
export type {
  Actor,
  AppCodeOf,
  DomainContext,
  DomainShape,
} from './domain-types';
export type { DomainEvent, EventDefinition } from './event';
export type { Policy, PolicyContexts, PolicyInit } from './policy';
export type { Quota, QuotaContext } from './quota';
export type { Reject, RejectionErrorOptions, RejectOptions } from './reject';
export type {
  CreateInputOf,
  IncludableOf,
  MemberNameOf,
  OperationOf,
  PublicRowOf,
  UpdateInputOf,
} from './resource-types';
export type { Scope, ScopeBindings, ScopeKey, ScopeValue } from './scope';
export type { ServerValuesOf } from './server-values';
export type { ViolationNames } from './violation-names';
export type {
  PublicRow,
  StorageAdapter,
  StorageListRequest,
  StoragePage,
  StorageWrite,
} from './storage';

export { constraintError } from './constraint-error';
export { createDomainDefiners } from './domain';
export { defineEvent } from './event';
export { keysetRequest } from './keyset-request';
export { PARTITION_ROOT_SQL, partitionViolation } from './partition';
export { denyAll } from './policy';
export { defineQuota, quotaExceeded } from './quota';
export { reject, Rejection, rejectionError } from './reject';
export { defineScope, scopeValues } from './scope';
