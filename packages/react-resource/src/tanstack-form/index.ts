/**
 * `@netvark/react-resource/form`: a form model bound to TanStack Form
 * (resource SPEC 20.5). `resourceFormOptions` gives a form the model's
 * values and validator, and `bindResponseErrors` puts a refused write's
 * texts on its fields. TanStack Form is an optional peer, which only this
 * entry imports.
 * @packageDocumentation
 */
export type { BindableForm } from './bind-errors';
export type { ResourceFormOptions } from './form-options';

export { bindResponseErrors } from './bind-errors';
export { resourceFormOptions } from './form-options';
