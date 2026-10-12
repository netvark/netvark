/**
 * `@netvark/paraglide-intl`: Paraglide's compile with every interpolated
 * value isolated and every message that formats refused (SPEC 6), and the
 * core, re-exported for build scripts.
 * @packageDocumentation
 */
export type { CompileOptions, CompileResult } from './compile-options';
export type { FormattingFinding } from './formatting-annotations';

export * from '@netvark/intl-core';
export { compile } from './compile';
export { MessageFormattingError } from './formatting-annotations';
