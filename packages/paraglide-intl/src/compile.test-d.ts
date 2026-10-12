import type { compile as paraglideCompile } from '@inlang/paraglide-js';

import type {
  CompileOptions,
  CompileResult,
  FormattingFinding,
  MessageFormattingError,
} from './index';

import { describe, expectTypeOf, it } from 'vitest';

import { compile } from './index';

declare const options: CompileOptions;

describe('compile types (SPEC 6.1)', () => {
  it("takes Paraglide's compiler options with isolate", () => {
    expectTypeOf(compile).parameter(0).toEqualTypeOf<CompileOptions>();
    expectTypeOf(compile).returns.resolves.toEqualTypeOf<CompileResult>();
    expectTypeOf<{
      project: string;
      outdir: string;
      strategy: ['cookie', 'baseLocale'];
      isolate: ['ar'];
    }>().toExtend<CompileOptions>();
    expectTypeOf<{
      project: string;
      outdir: string;
      isolate: 'ar';
    }>().not.toExtend<CompileOptions>();
    expectTypeOf(options.isolate).toEqualTypeOf<
      boolean | ReadonlyArray<string> | undefined
    >();
  });

  it("takes formatters: 'refuse' or 'allow'", () => {
    expectTypeOf(options.formatters).toEqualTypeOf<
      'refuse' | 'allow' | undefined
    >();
    expectTypeOf<{
      project: string;
      outdir: string;
      formatters: 'warn';
    }>().not.toExtend<CompileOptions>();
  });

  it('describes each finding of the refusal', () => {
    expectTypeOf<MessageFormattingError['findings']>().toEqualTypeOf<
      ReadonlyArray<FormattingFinding>
    >();
    expectTypeOf<FormattingFinding>().toEqualTypeOf<{
      readonly bundleId: string;
      readonly locale: string | undefined;
      readonly variable: string | undefined;
      readonly annotation: string;
    }>();
  });

  it("takes its own result or Paraglide's as the previous compilation", () => {
    expectTypeOf<CompileResult>().toExtend<
      NonNullable<CompileOptions['previousCompilation']>
    >();
    expectTypeOf<Awaited<ReturnType<typeof paraglideCompile>>>().toExtend<
      NonNullable<CompileOptions['previousCompilation']>
    >();
    expectTypeOf<CompileResult>().toExtend<
      NonNullable<Parameters<typeof paraglideCompile>[0]['previousCompilation']>
    >();
  });
});
