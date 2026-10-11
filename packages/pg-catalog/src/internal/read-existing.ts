/**
 * A file a command compares with what it would write (SPEC 10.1, 10.4).
 * @packageDocumentation
 */
import { readFile } from 'node:fs/promises';

/** The bytes of `path`, or `null` when there is no such file; any other failure is thrown. */
export async function readExisting(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
