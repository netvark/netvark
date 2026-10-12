/**
 * Fixture inlang projects for the compile tests (SPEC 7.1): a project in a
 * new `mkdtemp` directory that loads the message-format plugin by path, so
 * nothing is fetched, and the compiled message functions of its output.
 * @ref https://github.com/opral/inlang/tree/main/packages/plugins/message-format (message syntax)
 */
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The message-format plugin's bundle, loaded by path from the project settings. */
export const MESSAGE_FORMAT_PLUGIN: string = createRequire(
  import.meta.url,
).resolve('@inlang/plugin-message-format');

export interface FixtureProject {
  readonly dir: string;
  /** The `project.inlang` directory. */
  readonly project: string;
  /** Where a compile writes, `<dir>/paraglide`. */
  readonly outdir: string;
}

/** A project whose first locale is the base locale, with `messages` per locale. */
export async function fixtureProject(
  messages: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
  modules: ReadonlyArray<string> = [MESSAGE_FORMAT_PLUGIN],
): Promise<FixtureProject> {
  const dir = await mkdtemp(join(tmpdir(), 'paraglide-intl-'));
  const locales = Object.keys(messages);
  await mkdir(join(dir, 'project.inlang'));
  await mkdir(join(dir, 'messages'));
  await writeFile(
    join(dir, 'project.inlang', 'settings.json'),
    JSON.stringify({
      baseLocale: locales[0],
      locales,
      modules,
      'plugin.inlang.messageFormat': {
        pathPattern: './messages/{locale}.json',
      },
    }),
  );
  for (const [locale, entries] of Object.entries(messages)) {
    await writeFile(
      join(dir, 'messages', `${locale}.json`),
      JSON.stringify(entries),
    );
  }
  return {
    dir,
    project: join(dir, 'project.inlang'),
    outdir: join(dir, 'paraglide'),
  };
}

/** A compiled message function, called with its inputs and a locale. */
export type CompiledMessage = (
  inputs?: Readonly<Record<string, unknown>>,
  options?: { readonly locale: string },
) => string;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMessage(value: unknown): value is CompiledMessage {
  return typeof value === 'function';
}

/** The message `key` of the output in `outdir`. */
export async function compiledMessage(
  outdir: string,
  key: string,
): Promise<CompiledMessage> {
  const module: unknown = await import(
    pathToFileURL(join(outdir, 'messages.js')).href
  );
  const m = isRecord(module) ? module['m'] : undefined;
  const message = isRecord(m) ? m[key] : undefined;
  if (!isMessage(message)) {
    throw new TypeError(`no message ${key} in ${outdir}`);
  }
  return message;
}

/** A plural message in the message-format plugin's syntax, `few` and `many` only where given. */
function pluralMessage(forms: {
  readonly one: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
}): ReadonlyArray<Record<string, unknown>> {
  return [
    {
      declarations: ['input count', 'local countPlural = count: plural'],
      selectors: ['countPlural'],
      match: Object.fromEntries(
        Object.entries(forms).map(([form, text]) => [
          `countPlural=${form}`,
          text,
        ]),
      ),
    },
  ];
}

/** The messages most tests compile: values in text, a bare value, markup, and a plural. */
export const MESSAGES: Readonly<
  Record<string, Readonly<Record<string, unknown>>>
> = {
  en: {
    shared_by: 'Shared by {name} ({count})',
    only_name: '{name}',
    welcome: '{#b}Hi {name}{/b}',
    items: pluralMessage({ one: '{count} item', other: '{count} items' }),
  },
  ar: {
    shared_by: 'شاركه {name} ({count})',
    only_name: '{name}',
    welcome: '{#b}مرحبا {name}{/b}',
    items: pluralMessage({
      one: 'عنصر واحد',
      few: '{count} عناصر',
      many: '{count} عنصرًا',
      other: '{count} عنصر',
    }),
  },
};

/** Every file under `dir`, by path relative to it. */
export async function filesUnder(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await readdir(dir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      files[relative(dir, path)] = await readFile(path, 'utf8');
    }
  }
  return files;
}
