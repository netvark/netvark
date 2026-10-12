/**
 * A refused write's error objects by field (resource SPEC 20.4): each
 * object whose `source.pointer` names a member the form holds, under
 * `/data/attributes/<name>` or `/data/relationships/<name>`, gives that
 * member its text, the first per member; every other object's text is the
 * form's, each distinct text once, so no refusal goes unseen. An object's
 * text is its `detail`, else its `title`, as the server localized it for
 * the request; an error that is no `ResponseError` gives nothing, since
 * an error's `message` is for logs (ADR 0014).
 * @ref https://jsonapi.org/format/1.1/#error-objects
 * @ref https://www.rfc-editor.org/rfc/rfc6901#section-4
 * @packageDocumentation
 */
import type { FormPlan } from './form-plan';
import type { FormErrors } from './form-types';
import type { HeldMember } from './form-values';

import { isResponseError } from '@netvark/jsonapi-client';

import { memberAt } from './form-plan';

/** A reference token as RFC 6901 decodes it: `~1` to `/` first, then `~0` to `~`. */
function decoded(token: string): string {
  return token.replaceAll('~1', '/').replaceAll('~0', '~');
}

/**
 * The member `pointer` names among those the form holds: its first
 * reference tokens are `data`, the part, and the member's name, and any
 * after them point inside the member.
 */
function memberOf(
  plan: FormPlan,
  pointer: string | undefined,
): HeldMember | undefined {
  if (pointer === undefined) {
    return undefined;
  }
  const [root, data, part, name] = pointer.split('/');
  return root === '' && data === 'data' && name !== undefined
    ? memberAt(plan, part, decoded(name))
    : undefined;
}

const NONE: FormErrors = Object.freeze({
  fields: Object.freeze({}),
  form: Object.freeze([]),
});

/** The texts of `error`'s error objects, by the member each points at. */
export function formErrors(plan: FormPlan, error: unknown): FormErrors {
  if (!isResponseError(error)) {
    return NONE;
  }
  const fields: Record<string, string> = {};
  const form: Array<string> = [];
  for (const object of error.errors) {
    const text = object.detail ?? object.title;
    const member = memberOf(plan, object.source?.pointer);
    if (text === undefined) {
      continue;
    }
    if (member !== undefined && !Object.hasOwn(fields, member.meta.name)) {
      fields[member.meta.name] = text;
    } else if (!form.includes(text)) {
      form.push(text);
    }
  }
  return Object.freeze({
    fields: Object.freeze(fields),
    form: Object.freeze(form),
  });
}
