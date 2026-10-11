/**
 * Rewrites the storage contract's public catalog from its migrations
 * (resource SPEC 12.9): `pnpm run contract:catalog` after changing them.
 */
import {
  CONTRACT_CATALOG,
  extractContractCatalog,
} from '../support/contract-catalog.ts';

console.log(`${await extractContractCatalog(false)} ${CONTRACT_CATALOG}`);
