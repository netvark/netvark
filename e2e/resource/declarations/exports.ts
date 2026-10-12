/**
 * What a shared module of an application exports, compiled with
 * `declaration: true` by `declaration-emit.e2e.test.ts`: a declared
 * resource, and its JSON:API definition alone, which a client imports.
 */
import { Contacts } from '../resources/contacts.ts';

export { Contacts };

export const contactsDefinition = Contacts.resource;
