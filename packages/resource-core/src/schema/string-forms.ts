/**
 * The string wire forms with a format (SPEC 5.1): `uuid`, `date`,
 * `timestamp(p)`, and `timestamptz(p)`, each refused as a whole with the
 * OpenAPI format it names when the text is not in its form. A date-time
 * whose fraction PostgreSQL would round is not in its form either: Zod's
 * `z.iso.datetime({ precision })`, which demands exactly that many digits,
 * also reports a fraction it refuses as a format issue.
 * @ref https://spec.openapis.org/registry/format/
 * @ref https://zod.dev/api?id=iso-datetimes
 * @packageDocumentation
 */
import type { ValueForm } from './value-form';

import { z } from 'zod/v4';

import { WIRE_FORMATS } from '../wire/formats';
import {
  isWireDate,
  isWireTimestamp,
  isWireTimestamptz,
} from '../wire/temporal';
import { UUID_TEXT } from '../wire/uuid';
import { raise } from './raise';

type StringForm = Extract<ValueForm, { readonly kind: 'string' }>;

/** The test of a form's text; a date-time's reads the column's fraction digits. */
function testOf(form: StringForm): (text: string) => boolean {
  if (form.type === 'timestamp' || form.type === 'timestamptz') {
    const test =
      form.type === 'timestamp' ? isWireTimestamp : isWireTimestamptz;
    return (text) => test(text, form.fractionDigits);
  }
  return form.type === 'uuid' ? (text) => UUID_TEXT.test(text) : isWireDate;
}

/** The schema of a string wire form with a format. */
export function stringFormSchema(form: StringForm): z.ZodType {
  const format = WIRE_FORMATS[form.type];
  const test = testOf(form);
  return z.string().check((payload) => {
    if (!test(payload.value)) {
      raise(payload, { kind: 'format', expected: format }, { abort: true });
    }
  });
}
