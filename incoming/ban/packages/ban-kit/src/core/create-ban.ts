import type { ErrorFormat } from '../formats/types';
import type { BanError, BanErrorOptions } from './ban-error';
import type { ResolvedDefinition } from './definition';
import type { BanCore } from './internal';
import type { ErrorStatusCode } from './status';
import type {
  Ban,
  BanInstance,
  BanOptions,
  Catalog,
  CustomErrorInit,
  EmptyCatalog,
  NoReserved,
} from './types';

import { problemDetails } from '../formats/problem-details';
import { createHandler } from '../handler/handler';
import { UNEXPECTED_DETAIL } from '../internal/constants';
import { generateErrorId } from '../internal/id';
import { createValidation } from '../validation/validation-error';
import { BanError as BanErrorClass } from './ban-error';
import { BUILTIN_CATALOG, FACTORY_NAMES } from './catalog';
import { indexByStatus, reasonPhrase, resolveDefinition } from './definition';
import { createFactory } from './factories';
import { createFrom } from './from';
import { createRenderer } from './render';

const INSTANCE_KEYS = [
  'format',
  'catalog',
  'docsBaseUrl',
  'validationKey',
  'error',
  'custom',
  'fromStatus',
  'validation',
  'from',
  'handler',
  'render',
] as const satisfies ReadonlyArray<keyof BanInstance<Catalog>>;

/** Names a custom catalog entry may not use: instance members and factory names (SPEC 2). */
const RESERVED_KEYS: ReadonlySet<string> = new Set<string>([
  ...INSTANCE_KEYS,
  ...Object.keys(FACTORY_NAMES),
]);

function buildCatalog(custom: Catalog): {
  readonly catalog: Record<string, ResolvedDefinition>;
  readonly byStatus: Map<number, ResolvedDefinition>;
} {
  const catalog: Record<string, ResolvedDefinition> = {};
  for (const [key, definition] of Object.entries(BUILTIN_CATALOG)) {
    catalog[key] = resolveDefinition(key, definition);
  }
  for (const [key, definition] of Object.entries(custom)) {
    catalog[key] = resolveDefinition(key, definition);
  }
  return { catalog, byStatus: indexByStatus(catalog) };
}

/**
 * Creates an instance: built-in and custom factories, the handler, and the
 * helpers, all sharing one catalog and one format (SPEC 2, 5).
 */
export function createBan<const TErrors extends Catalog = EmptyCatalog>(
  options: BanOptions<TErrors> & {
    readonly errors?: NoReserved<TErrors> | undefined;
  } = {},
): Ban<TErrors> {
  const custom = (options.errors ?? {}) as Catalog;
  for (const key of Object.keys(custom)) {
    if (RESERVED_KEYS.has(key)) {
      throw new TypeError(
        `Catalog key "${key}" collides with a ban instance member`,
      );
    }
  }
  const format: ErrorFormat = options.format ?? problemDetails();
  const docsBaseUrl = options.docsBaseUrl;
  const generateId = options.id ?? generateErrorId;
  const { catalog, byStatus } = buildCatalog(custom);
  const render = createRenderer(format, docsBaseUrl);
  const instance: Record<string, unknown> = {};
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: the object is filled below from the catalog; create-ban.test-d.ts proves the shape
  const ban = instance as unknown as Ban<TErrors>;
  const adopt = options.adopt;

  const core: BanCore = {
    catalog,
    byStatus,
    format,
    docsBaseUrl,
    validationKey: options.validationKey ?? 'VALIDATION_FAILED',
    generateId,
    render,
    definition(key: string): ResolvedDefinition {
      const definition = catalog[key];
      if (definition === undefined) {
        throw new RangeError(`Unknown error key "${key}"`);
      }
      return definition;
    },
    build(definition, errorOptions: BanErrorOptions): BanError {
      return new BanErrorClass({
        ...errorOptions,
        status: definition.status,
        code: definition.code,
        title: definition.title,
        type: errorOptions.type ?? definition.type,
        id: errorOptions.id ?? generateId(),
        definition,
        render,
      });
    },
    custom(init: CustomErrorInit): BanError {
      return new BanErrorClass({
        ...init,
        code: init.code ?? 'CUSTOM',
        title: init.title ?? reasonPhrase(init.status) ?? 'Error',
        id: init.id ?? generateId(),
        render,
      });
    },
    unexpected(cause: unknown): BanError {
      return core.build(core.definition('INTERNAL_SERVER_ERROR'), {
        detail: UNEXPECTED_DETAIL,
        cause,
      });
    },
    adopt(value: unknown): BanError | undefined {
      return adopt?.(value, ban);
    },
  };
  if (!Object.hasOwn(catalog, core.validationKey)) {
    throw new RangeError(
      `validationKey "${core.validationKey}" is not in the catalog`,
    );
  }

  Object.assign(instance, {
    format,
    catalog,
    docsBaseUrl,
    validationKey: core.validationKey,
    error: (key: string, errorOptions: BanErrorOptions = {}): BanError =>
      core.build(core.definition(key), errorOptions),
    custom: (init: CustomErrorInit): BanError => core.custom(init),
    fromStatus: (
      status: ErrorStatusCode,
      errorOptions: BanErrorOptions = {},
    ): BanError => {
      const definition = byStatus.get(status);
      return definition === undefined
        ? core.custom({ ...errorOptions, status })
        : core.build(definition, errorOptions);
    },
    validation: createValidation(core),
    from: createFrom(core),
    handler: createHandler(core, ban, options.map),
    render,
  } satisfies BanInstance<Catalog>);
  for (const [name, key] of Object.entries(FACTORY_NAMES)) {
    instance[name] = createFactory(core, key);
  }
  for (const key of Object.keys(custom)) {
    instance[key] = createFactory(core, key);
  }
  return ban;
}
