import fs from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { pathState, trackedFileSystem } from './tracked-fs';

const PAST = new Date('2020-01-01T00:00:00Z');

/** A new directory holding `a.json`, `b.json`, `c.json`, and `sub/`. */
async function directory(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'paraglide-intl-'));
  for (const name of ['a.json', 'b.json', 'c.json']) {
    await writeFile(join(dir, name), '{}');
  }
  await mkdir(join(dir, 'sub'));
  return dir;
}

describe('trackedFileSystem() (SPEC 6.5)', () => {
  it('records each file read and directory listed, in each form, by absolute path', async () => {
    const dir = await directory();
    const tracked = trackedFileSystem(fs);
    tracked.fs.readFileSync(relative(process.cwd(), join(dir, 'a.json')));
    await tracked.fs.promises.readFile(pathToFileURL(join(dir, 'b.json')));
    await new Promise((resolve) => {
      tracked.fs.readFile(Buffer.from(join(dir, 'c.json')), resolve);
    });
    tracked.fs.readdirSync(dir);
    await tracked.fs.promises.readdir(join(dir, 'sub'));
    expect(Object.fromEntries(tracked.reads)).toEqual({
      [join(dir, 'a.json')]: { kind: 'file', state: expect.any(String) },
      [join(dir, 'b.json')]: { kind: 'file', state: expect.any(String) },
      [join(dir, 'c.json')]: { kind: 'file', state: expect.any(String) },
      [dir]: { kind: 'directory', state: expect.any(String) },
      [join(dir, 'sub')]: { kind: 'directory', state: expect.any(String) },
    });
  });

  it('records a path read before it exists as absent', async () => {
    const dir = await directory();
    const missing = join(dir, 'fr.json');
    const tracked = trackedFileSystem(fs);
    await expect(tracked.fs.promises.readFile(missing)).rejects.toThrow();
    expect(tracked.reads.get(missing)).toEqual({
      kind: 'file',
      state: 'absent',
    });
    await writeFile(missing, '{}');
    expect(pathState(fs, missing)).not.toBe('absent');
  });

  it('keeps the state from before the first read', async () => {
    const dir = await directory();
    const path = join(dir, 'a.json');
    fs.utimesSync(path, PAST, PAST);
    const before = pathState(fs, path);
    const tracked = trackedFileSystem(fs);
    tracked.fs.readFileSync(path);
    await writeFile(path, '[]');
    tracked.fs.readFileSync(path);
    expect(tracked.reads.get(path)?.state).toBe(before);
    expect(pathState(fs, path)).not.toBe(before);
  });

  it('records nothing for other calls or for a file descriptor', async () => {
    const dir = await directory();
    const tracked = trackedFileSystem(fs);
    tracked.fs.writeFileSync(join(dir, 'd.json'), '{}');
    tracked.fs.statSync(join(dir, 'a.json'));
    const descriptor = fs.openSync(join(dir, 'a.json'), 'r');
    try {
      expect(tracked.fs.readFileSync(descriptor, 'utf8')).toBe('{}');
    } finally {
      fs.closeSync(descriptor);
    }
    expect(tracked.reads.size).toBe(0);
  });
});

describe('pathState()', () => {
  it('is the same for an untouched file and changes when it is rewritten or replaced', async () => {
    const dir = await directory();
    const path = join(dir, 'a.json');
    fs.utimesSync(path, PAST, PAST);
    const state = pathState(fs, path);
    expect(pathState(fs, path)).toBe(state);
    await writeFile(path, '[]');
    const rewritten = pathState(fs, path);
    expect(rewritten).not.toBe(state);
    await writeFile(join(dir, 'next.json'), '[]');
    fs.utimesSync(join(dir, 'next.json'), PAST, PAST);
    fs.renameSync(join(dir, 'next.json'), path);
    expect(pathState(fs, path)).not.toBe(rewritten);
  });

  it('is absent for a path that does not exist', async () => {
    const dir = await directory();
    expect(pathState(fs, join(dir, 'missing.json'))).toBe('absent');
  });
});
