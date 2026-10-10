import type { BanError } from '../core/ban-error';
import type { ResolvedDefinition } from '../core/definition';
import type { ErrorItem } from '../core/error-item';
import type {
  InferStandardOutput,
  StandardJsonSchema,
} from '../internal/standard-schema-types';
import type { JsonSchema, RenderContext, SchemaContext } from './context';
import type { ErrorFormat } from './types';

/** Hand-written format: you provide the JSON Schema (SPEC 7.5, first form). */
export interface FormatSpec<TBody> {
  readonly name: string;
  readonly contentType: string;
  render(error: BanError, ctx: RenderContext): TBody;
  /** Defaults to `render`. */
  renderErrors?(
    error: BanError,
    errors: ReadonlyArray<ErrorItem>,
    ctx: RenderContext,
  ): TBody;
  schema(definition: ResolvedDefinition, ctx: SchemaContext): JsonSchema;
  /** Defaults to `schema`. */
  errorsSchema?(definition: ResolvedDefinition, ctx: SchemaContext): JsonSchema;
}

/**
 * Schema-first format: a Standard JSON Schema (Zod 4, Valibot, ArkType, and
 * others) types the body and produces the JSON Schema (SPEC 7.5, second form).
 * @ref https://standardschema.dev/json-schema
 */
export interface StandardFormatSpec<TSchema extends StandardJsonSchema> {
  readonly name: string;
  readonly contentType: string;
  readonly schema: TSchema;
  render(error: BanError, ctx: RenderContext): InferStandardOutput<TSchema>;
  renderErrors?(
    error: BanError,
    errors: ReadonlyArray<ErrorItem>,
    ctx: RenderContext,
  ): InferStandardOutput<TSchema>;
}

function isStandardSpec(
  spec: FormatSpec<unknown> | StandardFormatSpec<StandardJsonSchema>,
): spec is StandardFormatSpec<StandardJsonSchema> {
  return typeof spec.schema !== 'function';
}

export function defineFormat<TBody>(
  spec: FormatSpec<TBody>,
): ErrorFormat<TBody>;
export function defineFormat<TSchema extends StandardJsonSchema>(
  spec: StandardFormatSpec<TSchema>,
): ErrorFormat<InferStandardOutput<TSchema>>;
export function defineFormat(
  spec: FormatSpec<unknown> | StandardFormatSpec<StandardJsonSchema>,
): ErrorFormat {
  if (isStandardSpec(spec)) {
    const jsonSchema = (
      _definition: ResolvedDefinition,
      ctx: SchemaContext,
    ): JsonSchema =>
      spec.schema['~standard'].jsonSchema.output({ target: ctx.dialect });
    const renderErrors = spec.renderErrors?.bind(spec);
    return {
      name: spec.name,
      contentType: spec.contentType,
      render: (error, ctx) => spec.render(error, ctx),
      renderErrors:
        renderErrors ?? ((error, _errors, ctx) => spec.render(error, ctx)),
      schema: jsonSchema,
      errorsSchema: jsonSchema,
    };
  }
  const renderErrors = spec.renderErrors?.bind(spec);
  const errorsSchema = spec.errorsSchema?.bind(spec);
  return {
    name: spec.name,
    contentType: spec.contentType,
    render: (error, ctx) => spec.render(error, ctx),
    renderErrors:
      renderErrors ?? ((error, _errors, ctx) => spec.render(error, ctx)),
    schema: (definition, ctx) => spec.schema(definition, ctx),
    errorsSchema:
      errorsSchema ?? ((definition, ctx) => spec.schema(definition, ctx)),
  };
}
