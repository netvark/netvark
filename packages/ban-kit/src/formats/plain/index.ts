/**
 * Plain JSON format (SPEC 7.3): a closed `{ status, code, title, detail, id,
 * instance, traceId, meta, errors }` shape for teams migrating from ad hoc
 * bodies. Not a standard; `problemDetails()` is the default.
 * @packageDocumentation
 */
import type { BanError } from '../../core/ban-error';
import type { ResolvedDefinition } from '../../core/definition';
import type { ErrorItem } from '../../core/error-item';
import type { JsonSchema, RenderContext, SchemaContext } from '../context';
import type { ErrorEntry } from '../error-entries';
import type { ErrorFormat } from '../types';

import {
  ERROR_ENTRIES_SCHEMA,
  readLocation,
  toErrorEntries,
} from '../error-entries';
import { constant } from '../schema-helpers';

/** A closed JSON shape for teams migrating from ad hoc error bodies (SPEC 7.3). */
export interface PlainBody {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail?: string;
  readonly id: string;
  readonly instance?: string;
  readonly traceId?: string;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly stack?: string;
  readonly errors?: ReadonlyArray<ErrorEntry>;
}

export const PLAIN_CONTENT_TYPE = 'application/json';

function renderBase(error: BanError, ctx: RenderContext): PlainBody {
  return {
    status: error.status,
    code: error.code,
    title: error.title,
    ...(error.detail === undefined ? {} : { detail: error.detail }),
    id: error.id,
    ...(ctx.instance === undefined ? {} : { instance: ctx.instance }),
    ...(ctx.traceId === undefined ? {} : { traceId: ctx.traceId }),
    ...(Object.keys(ctx.meta).length === 0 ? {} : { meta: ctx.meta }),
    ...(ctx.stack === undefined ? {} : { stack: ctx.stack }),
  };
}

function baseSchema(
  definition: ResolvedDefinition,
  ctx: SchemaContext,
): JsonSchema {
  return {
    type: 'object',
    required: ['status', 'code', 'title', 'id'],
    properties: {
      status: constant(definition.status, ctx.dialect),
      code: constant(definition.code, ctx.dialect),
      title: constant(definition.title, ctx.dialect),
      detail: { type: 'string' },
      id: { type: 'string' },
      instance: { type: 'string' },
      traceId: { type: 'string' },
      meta: { type: 'object' },
      stack: { type: 'string' },
      errors: ERROR_ENTRIES_SCHEMA,
    },
    additionalProperties: false,
  };
}

export function plain(): ErrorFormat<PlainBody> {
  return {
    name: 'plain',
    contentType: PLAIN_CONTENT_TYPE,
    render(error: BanError, ctx: RenderContext): PlainBody {
      return renderBase(error, ctx);
    },
    renderErrors(
      error: BanError,
      errors: ReadonlyArray<ErrorItem>,
      ctx: RenderContext,
    ): PlainBody {
      return {
        ...renderBase(error, ctx),
        errors: toErrorEntries(errors, readLocation(ctx.meta)),
      };
    },
    schema(definition: ResolvedDefinition, ctx: SchemaContext): JsonSchema {
      return baseSchema(definition, ctx);
    },
    errorsSchema(
      definition: ResolvedDefinition,
      ctx: SchemaContext,
    ): JsonSchema {
      return {
        ...baseSchema(definition, ctx),
        required: ['status', 'code', 'title', 'id', 'errors'],
      };
    },
  };
}
