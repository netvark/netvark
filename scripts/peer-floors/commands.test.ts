import { describe, expect, it } from 'vitest';

import { parseCommand, peerSpec } from './commands.ts';

describe('peerSpec', () => {
  it.each([
    ['hono@4.13.7', { name: 'hono', version: '4.13.7' }],
    [
      '@tanstack/react-form@1.17.0',
      { name: '@tanstack/react-form', version: '1.17.0' },
    ],
    ['@electric-sql/pglite', { name: '@electric-sql/pglite', version: '*' }],
    ['kysely', { name: 'kysely', version: '*' }],
  ])('reads %s', (text, spec) => {
    expect(peerSpec(text)).toEqual(spec);
  });
});

describe('parseCommand', () => {
  it('reads an add of several peers for several packages', () => {
    expect(
      parseCommand(
        'pnpm --filter @x/a -F @x/b --filter=@x/c add --save-dev zod@4.5.0 @tanstack/react-query@5.89.0',
      ),
    ).toEqual({
      kind: 'add',
      filters: ['@x/a', '@x/b', '@x/c'],
      specs: [
        { name: 'zod', version: '4.5.0' },
        { name: '@tanstack/react-query', version: '5.89.0' },
      ],
    });
  });

  it('reads a script run, and test as the run of test', () => {
    expect(parseCommand('  pnpm --filter "@x/a" run typecheck')).toEqual({
      kind: 'run',
      filters: ['@x/a'],
      script: 'typecheck',
    });
    expect(parseCommand("pnpm --filter '@x/a' test")).toEqual({
      kind: 'run',
      filters: ['@x/a'],
      script: 'test',
    });
  });

  it.each([
    'pnpm install --frozen-lockfile',
    'pnpm run build',
    'pnpm --filter @x/a add',
    'pnpm --filter @x/a run',
    'pnpm --filter @x/a exec tsc',
    'pnpm add --save-dev --filter',
    'npm --workspace @x/a run test',
    '',
  ])('reads no floor step in %j', (line) => {
    expect(parseCommand(line)).toBeUndefined();
  });
});
