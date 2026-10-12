/**
 * Which floors a CI workflow runs (root ADR 0007). Each job's `run` lines
 * are replayed in order: an `add` puts its filtered packages on a version of
 * a peer, and a `run typecheck` or `run test` records, for each filtered
 * package and each of its outside peers, the version it ran on. A run counts
 * only when every workspace package the tested one builds on, and that peers
 * on the same package, is on the same version: an application has one copy,
 * and two make the peer's types disagree.
 * @ref https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsrun
 * @packageDocumentation
 */
import type { PnpmCommand } from './commands.ts';
import type { PeerFloor } from './floors.ts';
import type { Manifest } from './workspace.ts';

import { parseCommand } from './commands.ts';
import { outsidePeers } from './floors.ts';

/** A script of one package that a job ran on one version of a peer. */
export interface FloorRun {
  readonly job: string;
  readonly package: string;
  readonly peer: string;
  readonly version: string;
  readonly script: string;
  /** The workspace packages it builds on that peer on `peer` from another version. */
  readonly mismatched: ReadonlyArray<string>;
}

/** A floor and the job that runs it, or why none does. */
export type FloorJob =
  | { readonly floor: PeerFloor; readonly job: string }
  | { readonly floor: PeerFloor; readonly problem: string };

const REQUIRED_SCRIPTS = ['typecheck', 'test'] as const;

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/** Each job's id and the lines of its `run` steps, in order. */
export function jobLines(
  workflow: unknown,
): Array<{ readonly job: string; readonly lines: ReadonlyArray<string> }> {
  const jobs: unknown = isObject(workflow)
    ? Reflect.get(workflow, 'jobs')
    : undefined;
  if (!isObject(jobs)) {
    throw new TypeError('the workflow must have jobs');
  }
  return Object.entries(jobs).map(([job, definition]: [string, unknown]) => {
    const steps: unknown = isObject(definition)
      ? Reflect.get(definition, 'steps')
      : undefined;
    const lines = (Array.isArray(steps) ? steps : []).flatMap(
      (step: unknown) => {
        const run: unknown = isObject(step)
          ? Reflect.get(step, 'run')
          : undefined;
        return typeof run === 'string' ? run.split(/\r?\n|&&/u) : [];
      },
    );
    return { job, lines };
  });
}

/** The workspace packages `name` reaches through its dependency fields, itself excluded. */
export function buildsOn(
  name: string,
  manifests: ReadonlyMap<string, Manifest>,
): Set<string> {
  const reached = new Set<string>();
  const pending = [name];
  for (
    let current = pending.pop();
    current !== undefined;
    current = pending.pop()
  ) {
    const manifest = manifests.get(current);
    if (manifest === undefined) {
      continue;
    }
    const fields = [
      manifest.dependencies,
      manifest.devDependencies,
      manifest.peerDependencies,
    ];
    for (const dependency of fields.flatMap((field) => Object.keys(field))) {
      if (
        manifests.has(dependency) &&
        dependency !== name &&
        !reached.has(dependency)
      ) {
        reached.add(dependency);
        pending.push(dependency);
      }
    }
  }
  return reached;
}

/** The key of a package's installed version of a peer during a job's replay. */
function key(name: string, peer: string): string {
  return `${name} ${peer}`;
}

/** What a job has done so far: the versions its `add` steps installed. */
interface Replay {
  readonly job: string;
  readonly byName: ReadonlyMap<string, Manifest>;
  readonly workspace: ReadonlySet<string>;
  readonly installed: Map<string, string>;
}

function install(
  replay: Replay,
  command: Extract<PnpmCommand, { kind: 'add' }>,
): void {
  for (const name of command.filters) {
    for (const spec of command.specs) {
      replay.installed.set(key(name, spec.name), spec.version);
    }
  }
}

/** The runs a `script` of `name` makes, one per outside peer the job installed. */
function runsOf(replay: Replay, name: string, script: string): Array<FloorRun> {
  const manifest = replay.byName.get(name);
  const peers =
    manifest === undefined ? [] : outsidePeers(manifest, replay.workspace);
  return peers.flatMap(([peer]) => {
    const version = replay.installed.get(key(name, peer));
    if (version === undefined) {
      return [];
    }
    const mismatched = [...buildsOn(name, replay.byName)].filter(
      (other) =>
        replay.byName.get(other)?.peerDependencies[peer] !== undefined &&
        replay.installed.get(key(other, peer)) !== version,
    );
    return [
      { job: replay.job, package: name, peer, version, script, mismatched },
    ];
  });
}

/** Every script run the workflow's jobs make on an explicitly installed peer version. */
export function workflowRuns(
  workflow: unknown,
  manifests: ReadonlyArray<Manifest>,
): Array<FloorRun> {
  const byName = new Map(
    manifests.map((manifest) => [manifest.name, manifest]),
  );
  const workspace = new Set(byName.keys());
  const runs: Array<FloorRun> = [];
  for (const { job, lines } of jobLines(workflow)) {
    const replay: Replay = { job, byName, workspace, installed: new Map() };
    for (const line of lines) {
      const command = parseCommand(line);
      if (command?.kind === 'add') {
        install(replay, command);
      } else if (command?.kind === 'run') {
        runs.push(
          ...command.filters.flatMap((name) =>
            runsOf(replay, name, command.script),
          ),
        );
      }
    }
  }
  return runs;
}

function problemOf(floor: PeerFloor, runs: ReadonlyArray<FloorRun>): string {
  const target = `${floor.peer}@${floor.floor}`;
  const split = runs.find((run) => run.mismatched.length > 0);
  if (split !== undefined) {
    return `job ${split.job} runs its ${split.script} on ${target} with another ${floor.peer} in ${split.mismatched.join(', ')}, which it builds on`;
  }
  return `no CI job runs its typecheck and tests on ${target}, the floor of ${floor.peer} ${floor.range}`;
}

/** For each floor, a job that runs the package's typecheck and tests on it with one copy of the peer. */
export function floorJobs(
  floors: ReadonlyArray<PeerFloor>,
  runs: ReadonlyArray<FloorRun>,
): Array<FloorJob> {
  return floors.map((floor) => {
    const onFloor = runs.filter(
      (run) =>
        run.package === floor.package &&
        run.peer === floor.peer &&
        run.version === floor.floor,
    );
    const job = onFloor.find(({ job: candidate }) =>
      REQUIRED_SCRIPTS.every((script) =>
        onFloor.some(
          (run) =>
            run.job === candidate &&
            run.script === script &&
            run.mismatched.length === 0,
        ),
      ),
    )?.job;
    return job === undefined
      ? { floor, problem: problemOf(floor, onFloor) }
      : { floor, job };
  });
}
