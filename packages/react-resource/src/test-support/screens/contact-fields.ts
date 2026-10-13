/**
 * The contacts' field descriptors, as the screen tests' screens label
 * their inputs and columns with them (resource SPEC 20.2). The fixture's
 * resources are typed wide, so a lookup names its member as text and
 * throws for one the declaration lacks. Not published with the package.
 * @packageDocumentation
 */
import type { FieldDescriptor } from '@netvark/resource-ui';

import { fieldsOf } from '@netvark/resource-ui';

import { messages } from '../messages';
import { Contacts } from '../resources';

const fields = fieldsOf(Contacts, messages);

/** The descriptor of the contacts' member `name`. */
export function contactField(name: string): FieldDescriptor {
  const descriptor = fields[name];
  if (descriptor === undefined) {
    throw new TypeError(`contactField: contacts declare no ${name}`);
  }
  return descriptor;
}
