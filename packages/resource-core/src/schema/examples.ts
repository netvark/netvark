/**
 * The check of each field's `example` (SPEC 3, 14): the OpenAPI document
 * shows it as a value of the field, so the field's value schema must accept
 * it, validators included, since every stored value passed them too. It
 * runs when the resource is declared, and builds only the schemas of fields
 * that have an example.
 * @packageDocumentation
 */
import type { Declaration } from '../declare/types';
import type { MemberSpec } from './field-spec';

import { ownValue } from '../internal/object';
import { levelSchema } from './value-schema';

/** Throws `TypeError` for the first field whose value schema rejects its example. */
export function checkExamples(
  table: string,
  declaration: Declaration,
  fields: ReadonlyArray<MemberSpec>,
): void {
  for (const field of fields) {
    const example = ownValue(declaration.fields, field.column)?.example;
    if (example === undefined) {
      continue;
    }
    const schema = levelSchema(field.value, {
      nullable: field.nullable,
      validators: true,
    });
    const result = schema.safeParse(example);
    if (!result.success) {
      throw new TypeError(
        `${table}.fields.${field.column}.example: the field schema rejects the example`,
        { cause: result.error },
      );
    }
  }
}
