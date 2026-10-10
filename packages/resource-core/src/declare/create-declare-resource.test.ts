import { describe, expect, it } from 'vitest';

import { contactsCatalog } from '../test-support/contacts';
import { TEST_REGISTRIES } from '../test-support/definer';
import { typeErrorOf } from '../test-support/failure';
import { createDeclareResource } from './create-declare-resource';

/** The definer with its types erased, as JavaScript calls it. */
const configure = createDeclareResource as unknown as (
  config: unknown,
) => unknown;

const failure = (config: unknown) => typeErrorOf(() => configure(config));

const valid = { catalog: contactsCatalog, ...TEST_REGISTRIES };

describe('createDeclareResource: the catalog (SPEC 2)', () => {
  it('accepts the public catalog with every registry', () => {
    expect(
      typeof configure({
        ...valid,
        links: { base: '/api/v1' },
        page: { max: 50 },
      }),
    ).toBe('function');
  });

  it('refuses a configuration that is not an object, and unknown options', () => {
    expect(failure(null)).toBe(
      'createDeclareResource: must be an object, received null',
    );
    expect(failure({ ...valid, catalogue: {} })).toBe(
      'createDeclareResource: unknown member "catalogue"',
    );
  });

  it('treats an option left out as empty and refuses null', () => {
    expect(typeof configure({ catalog: contactsCatalog })).toBe('function');
    expect(
      typeof configure({ catalog: contactsCatalog, codecs: undefined }),
    ).toBe('function');
    for (const name of [
      'codecs',
      'validators',
      'scopes',
      'domains',
      'links',
      'page',
    ]) {
      expect(failure({ ...valid, [name]: null })).toBe(
        `createDeclareResource.${name}: must be an object, received null`,
      );
    }
  });

  it('refuses a full catalog, another format, and a malformed catalog', () => {
    expect(
      failure({ catalog: { ...contactsCatalog, schemas: ['public'] } }),
    ).toBe(
      'createDeclareResource.catalog: a full catalog; pass the public catalog (toPublicCatalog), since declarations reach browsers',
    );
    expect(failure({ catalog: { ...contactsCatalog, format: 2 } })).toBe(
      'createDeclareResource.catalog: format 2 is not supported (expected 1)',
    );
    expect(failure({ catalog: undefined })).toBe(
      'createDeclareResource.catalog: must be an object, received undefined',
    );
    expect(failure({ catalog: { format: 1, enums: {}, domains: {} } })).toBe(
      'createDeclareResource.catalog.tables: must be an object, received undefined',
    );
  });
});

describe('createDeclareResource: the registries (SPEC 2, 3.6)', () => {
  it('refuses a codec without type names', () => {
    for (const types of [[], [1], 'text', undefined]) {
      expect(failure({ ...valid, codecs: { phone: { types } } })).toBe(
        'createDeclareResource.codecs.phone.types: must be a non-empty list of type names',
      );
    }
    expect(failure({ ...valid, codecs: { phone: 1 } })).toBe(
      'createDeclareResource.codecs.phone: must be an object, received 1',
    );
  });

  it('refuses a validator that is not an object, and a malformed scope', () => {
    expect(failure({ ...valid, validators: { email: 'x' } })).toBe(
      'createDeclareResource.validators.email: must be an object, received "x"',
    );
    expect(
      failure({ ...valid, scopes: { organization: { column: '' } } }),
    ).toBe(
      'createDeclareResource.scopes.organization.column: must be a column name, received ""',
    );
    expect(
      failure({
        ...valid,
        scopes: { organization: { columns: 'organization_id' } },
      }),
    ).toBe(
      'createDeclareResource.scopes.organization: unknown member "columns"',
    );
  });

  it('refuses domain rules the catalog or the validators do not support', () => {
    expect(failure({ ...valid, domains: { phone: {} } })).toBe(
      'createDeclareResource.domains.phone: "phone" is not a domain of the public catalog',
    );
    expect(
      failure({
        ...valid,
        domains: { email: { email_format: { validator: 'email' } } },
      }),
    ).toBe(
      'createDeclareResource.domains.email.email_format: "email_format" is not a CHECK of domain email',
    );
    expect(
      failure({
        ...valid,
        domains: { short_text: { short_text_check: { validator: 'email' } } },
      }),
    ).toBe(
      'createDeclareResource.domains.short_text.short_text_check: the CHECK has a rule, which enforces it already',
    );
    expect(
      failure({
        ...valid,
        domains: { email: { email_check: { validator: 'phone' } } },
      }),
    ).toBe(
      'createDeclareResource.domains.email.email_check.validator: "phone" is not a validator of createDeclareResource',
    );
    expect(
      failure({
        ...valid,
        domains: { email: { email_check: { validators: 'email' } } },
      }),
    ).toBe(
      'createDeclareResource.domains.email.email_check: unknown member "validators"',
    );
  });
});

describe('createDeclareResource: links and page (SPEC 2)', () => {
  it('checks links.base by the jsonapi-core convention', () => {
    expect(failure({ ...valid, links: { base: '/api/' } })).toBe(
      'createDeclareResource.links.base must not end with "/"',
    );
    expect(failure({ ...valid, links: { base: 'api' } })).toBe(
      'createDeclareResource.links.base must be empty, start with "/", or be an absolute URL',
    );
  });

  it('checks the page bounds', () => {
    expect(failure({ ...valid, page: { max: 0 } })).toBe(
      'createDeclareResource.page.max: must be a positive integer, received 0',
    );
    expect(failure({ ...valid, page: { default: 1.5 } })).toBe(
      'createDeclareResource.page.default: must be a positive integer, received 1.5',
    );
    expect(failure({ ...valid, page: { default: 200 } })).toBe(
      'createDeclareResource.page.default: 200 exceeds the max page size 100',
    );
    expect(failure({ ...valid, page: { size: 10 } })).toBe(
      'createDeclareResource.page: unknown member "size"',
    );
    expect(failure({ ...valid, page: { range: 'yes' } })).toBe(
      'createDeclareResource.page.range: must be a boolean, received "yes"',
    );
  });
});
