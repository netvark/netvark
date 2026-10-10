/**
 * Helpers for consumers' test suites and for format authors (SPEC 11).
 * @packageDocumentation
 */
import type { BanError, RenderedError } from '../core/ban-error';
import type { ResolvedDefinition } from '../core/definition';
import type { ErrorItem } from '../core/error-item';
import type { Ban, Catalog } from '../core/types';
import type {
  JsonSchema,
  RenderContext,
  RenderOptions,
} from '../formats/context';
import type { ErrorFormat } from '../formats/types';
import type { IssueLocation, ValidationIssue } from '../validation/issue';

import { BanError as BanErrorClass, isBanError } from '../core/ban-error';
import { itemsFromIssues } from '../core/error-item';

export function renderError<TErrors extends Catalog>(
  ban: Ban<TErrors>,
  error: BanError,
  options?: RenderOptions,
): RenderedError {
  return ban.render(error, options);
}

export interface ExpectedError {
  readonly status?: number | undefined;
  readonly code?: string | undefined;
  readonly detail?: string | undefined;
}

/** Throws a readable `Error` unless `value` is a `BanError` matching `expected`. */
export function expectBanError(
  value: unknown,
  expected: ExpectedError = {},
): asserts value is BanError {
  if (!isBanError(value)) {
    throw new Error(`Expected a BanError, received ${describe(value)}`);
  }
  const mismatches: Array<string> = [];
  if (expected.status !== undefined && value.status !== expected.status) {
    mismatches.push(`status ${value.status} !== ${expected.status}`);
  }
  if (expected.code !== undefined && value.code !== expected.code) {
    mismatches.push(`code "${value.code}" !== "${expected.code}"`);
  }
  if (expected.detail !== undefined && value.detail !== expected.detail) {
    mismatches.push(
      `detail ${describe(value.detail)} !== "${expected.detail}"`,
    );
  }
  if (mismatches.length > 0) {
    throw new Error(`BanError mismatch: ${mismatches.join('; ')}`);
  }
}

function describe(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  return typeof value === 'string' ? `"${value}"` : String(value);
}

/** Returns a list of problems, empty when `body` conforms. */
export type SchemaValidator = (body: unknown) => ReadonlyArray<string>;

export interface ConformanceOptions {
  /** Compile a JSON Schema 2020-12 document, for example with Ajv 2020 plus ajv-formats. */
  readonly compile: (schema: JsonSchema) => SchemaValidator;
  readonly docsBaseUrl?: string | undefined;
}

const LOCATIONS: ReadonlyArray<IssueLocation> = [
  'body',
  'form',
  'query',
  'param',
  'header',
  'cookie',
];

const CONTEXT: RenderContext = {
  requestId: 'req-1',
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  instance: '/orders/42',
  method: 'GET',
  includeStack: false,
  docsBaseUrl: undefined,
  meta: {},
  stack: undefined,
  truncated: false,
};

function cases(
  definition: ResolvedDefinition,
): Array<{ name: string; error: BanError; ctx: RenderContext }> {
  const base = {
    status: definition.status,
    code: definition.code,
    title: definition.title,
    type: definition.type,
    definition,
  };
  const withMeta = new BanErrorClass({
    ...base,
    detail: 'Something specific',
    meta: { status: 'nope', x: 1, nested: { a: [1, 2] }, retryAfter: 30 },
    headers: { 'Retry-After': '30' },
  });
  const withStack = new BanErrorClass({
    ...base,
    cause: new Error('root cause'),
  });
  return [
    { name: 'minimal', error: new BanErrorClass(base), ctx: CONTEXT },
    { name: 'meta', error: withMeta, ctx: { ...CONTEXT, meta: withMeta.meta } },
    {
      name: 'stack',
      error: withStack,
      ctx: { ...CONTEXT, includeStack: true, stack: withStack.stack },
    },
  ];
}

const VALIDATION_ISSUES: ReadonlyArray<ValidationIssue> = [
  { path: ['email'], message: 'Invalid email', code: 'invalid_format' },
  { path: ['items', 0, 'sku'], message: 'Required' },
];

/**
 * Items that combine entries (SPEC 7.2.4): their own status, code, title,
 * type, and meta, one with a path and no location. A format either renders
 * these members or ignores them, and its `errorsSchema` must accept the
 * result either way.
 */
const MIXED_ITEMS: ReadonlyArray<ErrorItem> = [
  {
    status: 404,
    code: 'OTHER_NOT_FOUND',
    title: 'Other Not Found',
    detail: 'No such thing',
    type: 'https://errors.example.com/OTHER_NOT_FOUND',
    meta: { kind: 'thing' },
  },
  {
    status: 403,
    code: 'OTHER_FORBIDDEN',
    detail: 'Not yours',
    path: ['data', 'id'],
  },
];

function listCases(
  location: IssueLocation,
): Array<{ label: string; errors: ReadonlyArray<ErrorItem> }> {
  return [
    { label: 'errors', errors: itemsFromIssues(VALIDATION_ISSUES, location) },
    // An empty list is legal, and a format whose schema demands at least
    // one entry must still render a body that conforms.
    { label: 'errors-empty', errors: [] },
    { label: 'errors-mixed', errors: MIXED_ITEMS },
  ];
}

/**
 * Renders representative errors for every catalog entry and validates each
 * body against the schema the format claims for it (SPEC 7.4). Throws an
 * `AggregateError` listing every failure.
 */
export function assertFormatConformance(
  format: ErrorFormat,
  catalog: Readonly<Record<string, ResolvedDefinition>>,
  options: ConformanceOptions,
): void {
  const failures: Array<Error> = [];
  const schemaCtx = {
    docsBaseUrl: options.docsBaseUrl,
    dialect: 'draft-2020-12',
  } as const;
  for (const definition of Object.values(catalog)) {
    const validate = options.compile(format.schema(definition, schemaCtx));
    for (const item of cases(definition)) {
      const problems = validate(format.render(item.error, item.ctx));
      if (problems.length > 0) {
        failures.push(
          new Error(
            `${format.name} ${definition.key} ${item.name}: ${problems.join('; ')}`,
          ),
        );
      }
    }
    const validateErrors = options.compile(
      format.errorsSchema(definition, schemaCtx),
    );
    for (const location of LOCATIONS) {
      for (const { label, errors } of listCases(location)) {
        const error = new BanErrorClass({
          status: definition.status,
          code: definition.code,
          title: definition.title,
          type: definition.type,
          definition,
          meta: { location },
          errors,
        });
        const body = format.renderErrors(error, errors, {
          ...CONTEXT,
          meta: error.meta,
        });
        const problems = validateErrors(body);
        if (problems.length > 0) {
          failures.push(
            new Error(
              `${format.name} ${definition.key} ${label}/${location}: ${problems.join('; ')}`,
            ),
          );
        }
      }
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `${format.name} failed ${failures.length} conformance check(s)`,
    );
  }
}
