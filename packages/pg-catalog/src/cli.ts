#!/usr/bin/env node
/**
 * The `pg-catalog` bin (SPEC 11.2): `runCli` with the process's arguments,
 * working directory, and standard streams.
 * @packageDocumentation
 */
import process from 'node:process';

import { runCli } from './cli/main';

process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (text) => {
    process.stdout.write(text);
  },
  stderr: (text) => {
    process.stderr.write(text);
  },
});
