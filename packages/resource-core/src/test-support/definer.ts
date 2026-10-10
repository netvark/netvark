/**
 * The registries the unit tests declare against: codecs, validators, a
 * scope, and a domain rule over the unit-test catalog. The values stand in
 * for `defineCodec` and `defineValidator` results, of which a declaration
 * reads only the codecs' `types` and the names. Not published with the
 * package.
 * @packageDocumentation
 */

export const TEST_REGISTRIES = {
  codecs: {
    range: { types: ['tstzrange'] },
    phone: { types: ['text', 'varchar'] },
  },
  validators: { email: {}, room: {}, contactOrNotes: {} },
  scopes: { organization: { column: 'organization_id' } },
  domains: { email: { email_check: { validator: 'email' } } },
} as const;
