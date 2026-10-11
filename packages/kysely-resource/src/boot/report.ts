/**
 * What boot reports (SPEC 18.3): the problems that keep the runtime from
 * starting and the warnings that do not, each a message that starts with
 * the resource's type, or with `role <name>` for a problem of the role. A
 * message names tables, columns, roles, and session parameters, never a
 * connection string.
 * @packageDocumentation
 */

/** What `checkResourceRuntime` found. */
export interface BootReport {
  readonly problems: ReadonlyArray<string>;
  readonly warnings: ReadonlyArray<string>;
}

/** What `createResourceRuntime` rejects with when boot found problems: every one, its message joining them one per line. */
export class BootError extends Error {
  public readonly problems: ReadonlyArray<string>;

  public constructor(problems: ReadonlyArray<string>) {
    super(problems.join('\n'));
    this.name = 'BootError';
    this.problems = Object.freeze([...problems]);
  }
}
