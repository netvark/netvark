/**
 * `@netvark/react-resource`: forms, lists, and query caches for React
 * applications from `@netvark/resource-core` declarations. The root entry
 * is a model of a declared resource that imports neither React nor
 * TanStack. See `docs/resource/SPEC.md`, section 20, for the contract.
 * @packageDocumentation
 */
export type { FilterKind } from './fields/filter-kind';
export type {
  FormErrors,
  FormMemberName,
  FormModel,
  FormModelOptions,
  FormOperation,
  FormRecord,
  FormValue,
  FormValues,
  FormWriteOf,
} from './form/form-types';
export type { FormResource } from './form/resource-form';
export type {
  ListColumnFilters,
  ListModel,
  ListResource,
  ListSorting,
  ListState,
} from './list/list-types';
export type {
  ColumnFilterDescriptor,
  FieldDescriptor,
  FieldDescriptors,
  FieldOption,
} from './fields/fields-of';

export { fieldsOf } from './fields/fields-of';
export { resourceForm } from './form/resource-form';
export { resourceList } from './list/resource-list';
