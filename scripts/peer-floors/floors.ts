/**
 * The floor of every peer range a workspace package declares on a package
 * outside the workspace: the lowest version the range admits (root ADR
 * 0007). Peers inside the workspace are tested at its head and have no
 * floor to check.
 * @ref https://github.com/npm/node-semver#ranges
 * @packageDocumentation
 */
import type { Manifest } from './workspace.ts';

import { minVersion, validRange } from 'semver';

/** A peer range and its floor, as one workspace package declares it. */
export interface PeerFloor {
  readonly package: string;
  readonly peer: string;
  readonly range: string;
  readonly floor: string;
}

function byPackageThenPeer(left: PeerFloor, right: PeerFloor): number {
  const byPackage = left.package.localeCompare(right.package);
  return byPackage === 0 ? left.peer.localeCompare(right.peer) : byPackage;
}

/** The peers of `manifest` that are not workspace packages, with their ranges. */
export function outsidePeers(
  manifest: Manifest,
  workspace: ReadonlySet<string>,
): Array<readonly [string, string]> {
  return Object.entries(manifest.peerDependencies).filter(
    ([peer]) => !workspace.has(peer),
  );
}

/**
 * Each outside peer range's floor, by package and then peer. A range that is
 * not a valid semver range, or that admits no version, is a `TypeError`.
 */
export function peerFloors(
  manifests: ReadonlyArray<Manifest>,
): Array<PeerFloor> {
  const workspace = new Set(manifests.map((manifest) => manifest.name));
  const floors: Array<PeerFloor> = [];
  for (const manifest of manifests) {
    for (const [peer, range] of outsidePeers(manifest, workspace)) {
      const floor = validRange(range) === null ? null : minVersion(range);
      if (floor === null) {
        throw new TypeError(
          `${manifest.name}: the ${peer} peer range ${range} admits no version`,
        );
      }
      floors.push({
        package: manifest.name,
        peer,
        range,
        floor: floor.version,
      });
    }
  }
  return floors.toSorted(byPackageThenPeer);
}
