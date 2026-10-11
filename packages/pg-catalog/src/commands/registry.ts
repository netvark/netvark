/**
 * The declared resources the commands over them read (SPEC 10.3, 10.4):
 * `resources` of the configuration, and the list its registry function
 * returns.
 * @packageDocumentation
 */
import type { ExtractionConfig, ResourcesConfig } from '../config';

import { PgCatalogError } from '../errors';

function isObjectList(value: unknown): value is ReadonlyArray<object> {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'object' && item !== null)
  );
}

/** `config.resources`; `config_invalid` when it is not configured. */
export function resourcesOf(config: ExtractionConfig): ResourcesConfig {
  if (config.resources === undefined) {
    throw new PgCatalogError(
      'config_invalid',
      'resources is not configured: set resources.registry to a function that returns the declared resources',
    );
  }
  return config.resources;
}

/**
 * What the registry function returns, awaited; `registry_invalid` for
 * anything but an array of objects. What the function throws is thrown.
 */
export async function callRegistry(
  resources: ResourcesConfig,
): Promise<ReadonlyArray<object>> {
  const registry: unknown = await resources.registry();
  if (!isObjectList(registry)) {
    throw new PgCatalogError(
      'registry_invalid',
      'resources.registry must return an array of declared resources',
    );
  }
  return registry;
}
