/**
 * `@netvark/resource-core`: one declaration per PostgreSQL table, keyed by
 * its database names and typed by the public catalog `@netvark/pg-catalog`
 * extracts, from which the public API follows. See `docs/resource/SPEC.md`
 * for the contract.
 * @packageDocumentation
 */
export type { StorageCodec, StorageCodecs } from './codecs/storage-codecs';
export type { Codec, Validator } from './codecs/types';
export type { DeclarationCheck } from './declare/declaration-check';
export type { DeclareResourceConfig } from './declare/create-declare-resource';
export type { DeclareResource } from './declare/declare-resource-type';
export type { DeclaredResource } from './declare/declared-resource';
export type {
  CodecRegistry,
  CodecTypes,
  DeclareContext,
  DomainRule,
  DomainRules,
  EmptyRegistry,
  ScopeColumn,
  ScopeRegistry,
  ValidatorRegistry,
} from './declare/registries';
export type {
  Access,
  Declaration,
  FieldDeclaration,
  Operation,
  RelationshipDeclaration,
  RelationshipOperator,
  RuleDeclaration,
  SearchDeclaration,
  SortDeclaration,
} from './declare/types';
export type { ResourceNames } from './names/types';
export type { Infer } from './schema/infer';
export type { IssueKind } from './schema/issue-kinds';
export type { ResourceIssue } from './schema/issues';

export { defineCodec } from './codecs/define-codec';
export { defineValidator } from './codecs/define-validator';
export { createDeclareResource } from './declare/create-declare-resource';
export { ISSUE_KINDS } from './schema/issue-kinds';
