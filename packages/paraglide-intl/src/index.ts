/**
 * `@netvark/paraglide-intl`: Paraglide's compile with every interpolated
 * value isolated (SPEC 6), and the core, re-exported for build scripts.
 * @packageDocumentation
 */
export type { CompileOptions, CompileResult } from './compile-options';

export * from '@netvark/intl-core';
export { compile } from './compile';
