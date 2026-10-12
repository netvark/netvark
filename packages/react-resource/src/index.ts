/**
 * `@netvark/react-resource`: forms, lists, and query caches for React
 * applications from `@netvark/resource-core` declarations. The root entry
 * is a model of a declared resource that imports neither React nor
 * TanStack. See `docs/resource/SPEC.md`, section 20, for the contract.
 * @packageDocumentation
 */
export type { FilterKind } from './fields/filter-kind';
export type {
  ColumnFilterDescriptor,
  FieldDescriptor,
  FieldDescriptors,
  FieldOption,
} from './fields/fields-of';

export { fieldsOf } from './fields/fields-of';
