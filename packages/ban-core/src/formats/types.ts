import type { BanError } from '../core/ban-error';
import type { ResolvedDefinition } from '../core/definition';
import type { ErrorItem } from '../core/error-item';
import type { JsonSchema, RenderContext, SchemaContext } from './context';

/**
 * A wire format owns both rendering and the JSON Schema that describes what
 * it renders (ADR 0003). Formats are pure: same inputs, same body.
 */
export interface ErrorFormat<TBody = unknown> {
  readonly name: string;
  readonly contentType: string;
  /** Renders an error without a list (`error.errors` is `undefined`). */
  render(error: BanError, ctx: RenderContext): TBody;
  /** Renders an error with its list, which may be empty (SPEC 7). */
  renderErrors(
    error: BanError,
    errors: ReadonlyArray<ErrorItem>,
    ctx: RenderContext,
  ): TBody;
  schema(definition: ResolvedDefinition, ctx: SchemaContext): JsonSchema;
  /** Schema of `renderErrors` bodies for the entry; `validationSchema()` in `ban-kit/openapi` reads it. */
  errorsSchema(definition: ResolvedDefinition, ctx: SchemaContext): JsonSchema;
}
