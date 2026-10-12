/**
 * Runtime-neutral checks (SPEC 7.3) over the built core. No file system and
 * no environment: the same module runs on Bun, Deno, and workerd.
 */
import type { Check } from './assert.ts';

import {
  FIRST_STRONG_ISOLATE,
  isolate,
  POP_DIRECTIONAL_ISOLATE,
} from '@netvark/intl-core';

import { equal } from './assert.ts';

export interface SmokeResult {
  readonly runtime: string;
  readonly passed: number;
  readonly failures: ReadonlyArray<string>;
}

const CHECKS: Readonly<Record<string, Check>> = {
  'isolates a value between U+2068 and U+2069': () => {
    equal(FIRST_STRONG_ISOLATE.codePointAt(0), 0x20_68, 'first strong isolate');
    equal(
      POP_DIRECTIONAL_ISOLATE.codePointAt(0),
      0x20_69,
      'pop directional isolate',
    );
    equal(isolate('محمد'), '\u2068محمد\u2069', 'isolated value');
  },
};

export async function runChecks(runtime: string): Promise<SmokeResult> {
  const failures: Array<string> = [];
  let passed = 0;
  for (const [name, run] of Object.entries(CHECKS)) {
    try {
      await run();
      passed += 1;
    } catch (error) {
      failures.push(
        `${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { runtime, passed, failures };
}

/** Prints the outcome; throws on failure so the process exits non-zero everywhere. */
export function report(result: SmokeResult): void {
  const total = result.passed + result.failures.length;
  if (result.failures.length === 0) {
    console.log(
      `@netvark/intl-core smoke: ${total} checks passed on ${result.runtime}`,
    );
    return;
  }
  for (const failure of result.failures) {
    console.error(`FAIL ${failure}`);
  }
  throw new Error(
    `@netvark/intl-core smoke: ${result.failures.length} of ${total} checks failed on ${result.runtime}`,
  );
}
