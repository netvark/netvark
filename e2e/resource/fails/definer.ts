/**
 * Definer configurations TypeScript refuses (resource SPEC 2, 3.6). Each
 * `// error:` names a text the diagnostic on the next line must contain.
 */
import { createDeclareResource } from '@netvark/resource-core';

import { catalog } from '../fixtures/contacts/catalog.ts';
import { publicCatalog } from '../fixtures/contacts/public-catalog.ts';

createDeclareResource({
  // error: catalog: a full catalog; pass the public catalog (toPublicCatalog), since declarations reach browsers
  catalog,
});

createDeclareResource({
  catalog: publicCatalog,
  validators: { email: {} },
  domains: {
    // error: "phone" is not a domain of the public catalog
    phone: { phone_check: { validator: 'email' } },
  },
});

createDeclareResource({
  catalog: publicCatalog,
  validators: { email: {} },
  domains: {
    email: {
      // error: email_format is not a CHECK without a rule of domain email
      email_format: { validator: 'email' },
    },
  },
});
