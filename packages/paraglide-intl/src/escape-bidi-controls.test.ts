import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { escapeBidiControls } from './escape-bidi-controls';

/** The Bidi_Control characters of Unicode 17: ALM, LRM, RLM, LRE to RLO, LRI to PDI. */
const CONTROLS = [
  0x06_1c, 0x20_0e, 0x20_0f, 0x20_2a, 0x20_2b, 0x20_2c, 0x20_2d, 0x20_2e,
  0x20_66, 0x20_67, 0x20_68, 0x20_69,
];
const ALL = String.fromCodePoint(...CONTROLS);
const BACKSLASH = String.fromCodePoint(0x5c);

/** The template literal of a line of code. */
function template(code: string): string {
  return code.slice(code.indexOf('`'), code.lastIndexOf('`') + 1);
}

/** What V8 makes of a template literal over `x`. */
function evaluate(literal: string): unknown {
  return runInNewContext(literal, { x: 'X' });
}

describe('escapeBidiControls (SPEC 6.4)', () => {
  it('names every character the engine counts as a bidi control', () => {
    const found: Array<number> = [];
    for (let code = 0; code <= 0xff_ff; code += 1) {
      if (/\p{Bidi_Control}/u.test(String.fromCodePoint(code))) {
        found.push(code);
      }
    }
    expect(found).toEqual(CONTROLS);
  });

  it('escapes each control of a code file, which evaluates to the same text', () => {
    const source = `export const m = () => \`a${ALL}\${x}b\`; // ${ALL}`;
    const { 'm.js': code = '' } = escapeBidiControls({ 'm.js': source });
    expect(/\p{Bidi_Control}/u.test(code)).toBe(false);
    expect(code).toContain(`${BACKSLASH}u061c${BACKSLASH}u200e`);
    expect(code).toContain(`${BACKSLASH}u2068${BACKSLASH}u2069`);
    expect(evaluate(template(code))).toBe(evaluate(template(source)));
  });

  it('escapes declarations and JSON, and leaves other files and characters alone', () => {
    const output = escapeBidiControls({
      'messages.d.ts': `/** ${ALL} */`,
      'data.json': JSON.stringify({ text: ALL }),
      'runtime.mjs': ALL,
      'README.md': ALL,
      '.gitignore': ALL,
      'plain.js': 'const name = "محمد\u200D\uFEFF";',
    });
    expect(JSON.parse(output['data.json'] ?? '')).toEqual({ text: ALL });
    expect(output['messages.d.ts']).not.toMatch(/\p{Bidi_Control}/u);
    expect(output['runtime.mjs']).not.toMatch(/\p{Bidi_Control}/u);
    expect(output['README.md']).toBe(ALL);
    expect(output['.gitignore']).toBe(ALL);
    expect(output['plain.js']).toBe('const name = "محمد\u200D\uFEFF";');
  });
});
