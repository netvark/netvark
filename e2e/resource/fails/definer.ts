/**
 * Definer configurations TypeScript refuses (resource SPEC 2, 3.6): a full
 * catalog, domain rules the catalog does not support, and a codec written
 * by hand instead of by `defineCodec`. Each `// error:` names a text the
 * diagnostic on the next line must contain.
 */
import { createDeclareResource } from '@netvark/resource-core';

import { catalog } from '../fixtures/contacts/catalog.ts';
import { publicCatalog } from '../fixtures/contacts/public-catalog.ts';
import { codecs } from '../resources/codecs.ts';
import { validators } from '../resources/validators.ts';

createDeclareResource({
  // error: catalog: a full catalog; pass the public catalog (toPublicCatalog), since declarations reach browsers
  catalog,
});

createDeclareResource({
  catalog: publicCatalog,
  validators,
  domains: {
    // error: "phone" is not a domain of the public catalog
    phone: { phone_check: { validator: 'email' } },
  },
});

createDeclareResource({
  catalog: publicCatalog,
  validators,
  domains: {
    email: {
      // error: email_format is not a CHECK without a rule of domain email
      email_format: { validator: 'email' },
    },
  },
});

createDeclareResource({
  catalog: publicCatalog,
  codecs: {
    // error: Property '[madeByDefineCodec]' is missing
    timeRange: {
      types: ['tstzrange'],
      schema: codecs.timeRange.schema,
      fixtures: codecs.timeRange.fixtures,
      description: undefined,
    },
  },
});
