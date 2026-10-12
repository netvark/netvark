/**
 * A contact create, and the server's refusals of it the binding tests
 * bind (resource SPEC 20.5, 20.8): the 409 of `contacts_email_unique
 * (organization_id, email)`, one error object per member (SPEC 9.1), and
 * the 404 of the organization's foreign key, one object on the
 * relationship, each as a `ResponseError` of the client. Not published
 * with the package.
 * @packageDocumentation
 */
import type { FormModel } from '../form/form-types';
import type { MountedForm } from './forms';

import { ResponseError } from '@netvark/jsonapi-client';

import { resourceForm } from '../form/resource-form';
import { bindResponseErrors } from '../tanstack-form/bind-errors';
import { mountForm } from './forms';
import { messages } from './messages';
import { Contacts } from './resources';

/** A create form that holds four members: two attributes, the email, and the organization. */
export const contactCreate: FormModel<
  Readonly<Record<string, unknown>>,
  unknown
> = resourceForm(Contacts, 'create', {
  messages,
  members: ['name', 'nickname', 'email', 'organization'],
});

export const TAKEN = 'Diese E-Mail hat schon ein Kontakt der Organisation.';
export const MISSING = 'Die Organisation gibt es nicht.';

/** A refused create whose body is an error document of `errors`. */
export function refused(
  status: number,
  errors: ReadonlyArray<unknown>,
): ResponseError {
  return new ResponseError({
    type: 'contacts',
    call: 'create',
    status,
    body: { errors },
  });
}

/** One error object of the 409, on the member `pointer` names. */
function taken(pointer: string) {
  return {
    status: '409',
    code: 'CONTACT_EMAIL_TAKEN',
    title: 'Konflikt',
    detail: TAKEN,
    source: { pointer },
  };
}

/** The 409 of the unique constraint over the organization and the email. */
export const EMAIL_TAKEN: ResponseError = refused(409, [
  taken('/data/relationships/organization'),
  taken('/data/attributes/email'),
]);

/** The 404 of the organization's foreign key. */
export const NO_ORGANIZATION: ResponseError = refused(404, [
  {
    status: '404',
    code: 'CONTACTS_ORGANIZATION_ID_FKEY',
    title: 'Nicht gefunden',
    detail: MISSING,
    source: { pointer: '/data/relationships/organization' },
  },
]);

/** A form a person sent, the writes its handler sent, the first refused. */
export interface RefusedForm extends MountedForm {
  readonly writes: ReadonlyArray<unknown>;
}

/**
 * The create form, filled in validly and submitted, whose handler sends
 * the write as an application's does and binds the refusal when the send
 * throws: the server refuses the first write with `refusal` and takes
 * every one after.
 */
export async function refusedOnce(
  refusal: ResponseError,
): Promise<RefusedForm> {
  const writes: Array<unknown> = [];
  const send = (write: unknown): void => {
    writes.push(write);
    if (writes.length === 1) {
      throw refusal;
    }
  };
  const mounted = mountForm(contactCreate, {
    onSubmit: (values, form) => {
      try {
        send(contactCreate.write(values));
      } catch (error) {
        bindResponseErrors(form, contactCreate, error);
      }
    },
  });
  mounted.field('name').handleChange('Ada Lovelace');
  mounted.field('email').handleChange('ada@example.com');
  mounted.field('organization').handleChange('7');
  await mounted.form.handleSubmit();
  return { ...mounted, writes };
}
