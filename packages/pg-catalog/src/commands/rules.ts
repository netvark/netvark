/**
 * `checkRules` (SPEC 10.3, ADR 0012): runs every fixture of the declared
 * resources through their schemas and through the replayed database, and
 * reports where they disagree. `@netvark/resource-core/testing` builds
 * the cases from the registry (resource SPEC 7.3); this command replays
 * the migrations, writes each case's fixtures into copies of its columns,
 * and hands the database's verdicts to the cases' judges.
 * @packageDocumentation
 */
import type { OracleCase } from '@netvark/resource-core/testing';

import type { ExtractionConfig, RulesConfig } from '../config';
import type { OracleModule } from '../oracle/oracle-module';
import type { RulesReport } from '../oracle/report';

import process from 'node:process';

import { DEFAULT_SCHEMAS } from '../config';
import { PgCatalogError } from '../errors';
import { readCatalog } from '../extract/read-catalog';
import { loadMigrations } from '../migrations/load';
import { importOracle } from '../oracle/oracle-module';
import { runCases } from '../oracle/run-cases';
import { replay } from '../replay';
import { openTarget } from '../target/open-target';
import { useSession } from '../target/session';

export interface RulesOptions {
  /** The directory relative paths resolve against; default the process's working directory. */
  readonly cwd?: string;
}

/**
 * What `oracleCases` throws for a mistake in the registry or the storage
 * codecs names it first: `oracleCases: ` or `oracleCases.resources[0]: `
 * (resource SPEC 4.2, 7.3).
 */
const ORACLE_MISTAKE = /^oracleCases[.:]/u;

function isObjectList(value: unknown): value is ReadonlyArray<object> {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'object' && item !== null)
  );
}

/** The tables `out.public.tables` lists that no declared resource reads. */
function unusedTables(
  config: ExtractionConfig,
  resources: ReadonlyArray<object>,
): ReadonlyArray<string> {
  const used = new Set(
    resources.map((resource) =>
      'table' in resource && typeof resource.table === 'string'
        ? resource.table
        : null,
    ),
  );
  return (config.out.public?.tables ?? []).filter((table) => !used.has(table));
}

/** The registry's cases; a mistake `oracleCases` reports is a `registry_invalid`. */
function casesOf(
  oracle: OracleModule,
  resources: ReadonlyArray<object>,
  rules: RulesConfig,
): ReadonlyArray<OracleCase> {
  try {
    return oracle.oracleCases(resources, { storage: rules.storage });
  } catch (error) {
    if (error instanceof TypeError && ORACLE_MISTAKE.test(error.message)) {
      throw new PgCatalogError('registry_invalid', `rules: ${error.message}`, {
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * Checks the declared resources `config.rules.registry` returns against
 * the database `config`'s migrations build. Fails with `config_invalid`
 * when `rules` is not configured, `resource_core_missing` when
 * `@netvark/resource-core` cannot be loaded, and `registry_invalid` when
 * the registry function returns anything but a list of objects or
 * `oracleCases` refuses the registry or the storage codecs; then as
 * `extractCatalog` fails. What the registry function throws is thrown.
 * The database is closed, and a server's throwaway database dropped,
 * before it returns.
 */
export async function checkRules(
  config: ExtractionConfig,
  options: RulesOptions = {},
): Promise<RulesReport> {
  const { rules } = config;
  if (rules === undefined) {
    throw new PgCatalogError(
      'config_invalid',
      'rules is not configured: set rules.registry to a function that returns the declared resources',
    );
  }
  const oracle = await importOracle();
  const resources: unknown = await rules.registry();
  if (!isObjectList(resources)) {
    throw new PgCatalogError(
      'registry_invalid',
      'rules.registry must return an array of declared resources',
    );
  }
  const cases = casesOf(oracle, resources, rules);
  const migrations = await loadMigrations(
    config.migrations,
    options.cwd ?? process.cwd(),
  );
  const reports = await useSession(
    await openTarget(config.database),
    async (session) => {
      await replay(session, migrations);
      const catalog = await readCatalog(
        session,
        config.schemas ?? DEFAULT_SCHEMAS,
      );
      return runCases(session, catalog, cases);
    },
  );
  return { cases: reports, unusedTables: unusedTables(config, resources) };
}
