/**
 * The binding through its built package (SPEC 6, 7.2): a Paraglide project
 * in a new directory, compiled by `compile()` with the Paraglide installed
 * beside it, its messages called in English and Arabic, and a project whose
 * messages format refused before anything is written.
 */
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  compile,
  isolate,
  MessageFormattingError,
} from '@netvark/paraglide-intl';

const PLUGIN = createRequire(import.meta.url).resolve(
  '@inlang/plugin-message-format',
);
const CATALOGS = {
  en: { shared_by: 'Shared by {name} ({count})', only_name: '{name}' },
  ar: { shared_by: 'شاركه {name} ({count})', only_name: '{name}' },
};

type Message = (
  inputs: Record<string, unknown>,
  options: { locale: string },
) => string;

/** A project of `catalogs` in a new directory. */
async function project(
  catalogs: Readonly<Record<string, Record<string, unknown>>> = CATALOGS,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'intl-e2e-'));
  await mkdir(join(dir, 'project.inlang'));
  await mkdir(join(dir, 'messages'));
  await writeFile(
    join(dir, 'project.inlang', 'settings.json'),
    JSON.stringify({
      baseLocale: 'en',
      locales: ['en', 'ar'],
      modules: [PLUGIN],
      'plugin.inlang.messageFormat': {
        pathPattern: './messages/{locale}.json',
      },
    }),
  );
  for (const [locale, messages] of Object.entries(catalogs)) {
    await writeFile(
      join(dir, 'messages', `${locale}.json`),
      JSON.stringify(messages),
    );
  }
  return dir;
}

async function compiledMessages(
  outdir: string,
): Promise<Record<string, Message>> {
  const module = (await import(
    pathToFileURL(join(outdir, 'messages.js')).href
  )) as { m: Record<string, Message> };
  return module.m;
}

describe('compile through the built package', () => {
  it('compiles messages whose values are isolated in every locale', async () => {
    const dir = await project();
    const outdir = join(dir, 'paraglide');
    const result = await compile({
      project: join(dir, 'project.inlang'),
      outdir,
    });
    expect(result.warnings).toEqual([]);
    const m = await compiledMessages(outdir);
    expect(m['shared_by']?.({ name: 'محمد', count: 2 }, { locale: 'en' })).toBe(
      `Shared by ${isolate('محمد')} (${isolate('2')})`,
    );
    expect(m['shared_by']?.({ name: 'Ali', count: 2 }, { locale: 'ar' })).toBe(
      `شاركه ${isolate('Ali')} (${isolate('2')})`,
    );
    expect(m['only_name']?.({ name: 'Ali' }, { locale: 'ar' })).toBe('Ali');
    const code = await readFile(
      join(outdir, 'messages', 'shared_by.js'),
      'utf8',
    );
    expect(code).not.toMatch(/\p{Bidi_Control}/u);
    expect(await readFile(join(dir, 'messages', 'ar.json'), 'utf8')).toBe(
      JSON.stringify(CATALOGS.ar),
    );
  });

  it('refuses a message that formats, naming it, before writing anything', async () => {
    const dir = await project({
      en: { total: 'Total: {amount: number}' },
      ar: { total: 'المجموع: {amount: number}' },
    });
    const outdir = join(dir, 'paraglide');
    const error: unknown = await compile({
      project: join(dir, 'project.inlang'),
      outdir,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MessageFormattingError);
    expect(error).toMatchObject({
      findings: [
        {
          bundleId: 'total',
          locale: 'ar',
          variable: 'amount',
          annotation: 'number',
        },
        {
          bundleId: 'total',
          locale: 'en',
          variable: 'amount',
          annotation: 'number',
        },
      ],
    });
    await expect(stat(outdir)).rejects.toThrow(/ENOENT/u);
  });
});
