import type { UntypedDeclare } from '../test-support/catalog-builder';

import { describe, expect, it } from 'vitest';

import {
  catalogOf,
  domain,
  untypedDeclare,
} from '../test-support/catalog-builder';
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

/** The failure of a definer whose email domain CHECK gives `code`. */
const withCode = (code: unknown) =>
  failure({
    ...valid,
    domains: { email: { email_check: { validator: 'email', code } } },
  });

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
      'atomic',
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
    expect(failure({ catalog: { ...contactsCatalog, format: 4 } })).toBe(
      'createDeclareResource.catalog: format 4 is not supported (expected 3)',
    );
    expect(failure({ catalog: undefined })).toBe(
      'createDeclareResource.catalog: must be an object, received undefined',
    );
    expect(failure({ catalog: { format: 3, enums: {}, domains: {} } })).toBe(
      'createDeclareResource.catalog.tables: must be an object, received undefined',
    );
  });
});

describe('createDeclareResource: the registries (SPEC 2, 3.6)', () => {
  it('takes only codecs and validators their define functions made', () => {
    const { phone } = TEST_REGISTRIES.codecs;
    const { email } = TEST_REGISTRIES.validators;
    for (const codec of [{ types: ['text'] }, { ...phone }, 1, null]) {
      expect(failure({ ...valid, codecs: { phone: codec } })).toBe(
        'createDeclareResource.codecs.phone: must be made by defineCodec',
      );
    }
    for (const validator of [{}, { ...email }, 'x', phone]) {
      expect(failure({ ...valid, validators: { email: validator } })).toBe(
        'createDeclareResource.validators.email: must be made by defineValidator',
      );
    }
  });

  it('refuses a malformed scope', () => {
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
      'createDeclareResource.domains.short_text.short_text_check.validator: the CHECK has a rule, which enforces it already',
    );
    expect(
      failure({
        ...valid,
        domains: { short_text: { short_text_check: { code: 'Too long' } } },
      }),
    ).toBe(
      'createDeclareResource.domains.short_text.short_text_check.code: "Too long" is not A-Z, 0-9, _',
    );
    for (const entry of [{}, { code: 'EMAIL_INVALID' }]) {
      expect(
        failure({ ...valid, domains: { email: { email_check: entry } } }),
      ).toBe(
        'createDeclareResource.domains.email.email_check.validator: a CHECK without a rule needs a validator',
      );
    }
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

  it("takes a code alone for a domain CHECK with a rule, which its members' errors carry (SPEC 3.6)", () => {
    const declareResource = untypedDeclare(contactsCatalog, {
      ...TEST_REGISTRIES,
      domains: {
        ...TEST_REGISTRIES.domains,
        short_text: { short_text_check: { code: 'NAME_LENGTH' } },
      },
    });
    const organizations = declareResource('organizations', {
      operations: ['get', 'update'],
      fields: { name: { access: 'readWrite' } },
    });
    expect(Object.keys(organizations.errors)).toContain('NAME_LENGTH');
    expect(Object.keys(organizations.errors)).not.toContain('SHORT_TEXT_CHECK');
  });

  it('holds a domain CHECK code, given or derived, to the code pattern (SPEC 4.2, 6.4)', () => {
    expect(withCode('bad code')).toBe(
      'createDeclareResource.domains.email.email_check.code: "bad code" is not A-Z, 0-9, _',
    );
    expect(withCode(5)).toBe(
      'createDeclareResource.domains.email.email_check.code: 5 is not A-Z, 0-9, _',
    );
    const catalog = catalogOf(
      {},
      {
        prüfung: domain('prüfung', {
          constraints: { prüfung_check: { kind: 'check', rule: null } },
        }),
      },
    );
    const derived = (rule: object) =>
      typeErrorOf(() =>
        configure({
          catalog,
          validators: TEST_REGISTRIES.validators,
          domains: { prüfung: { prüfung_check: rule } },
        }),
      );
    expect(derived({ validator: 'room' })).toBe(
      'createDeclareResource.domains.prüfung.prüfung_check: code "PRÜFUNG_CHECK" is not A-Z, 0-9, _; set code',
    );
    expect(() =>
      configure({
        catalog,
        validators: TEST_REGISTRIES.validators,
        domains: {
          prüfung: { prüfung_check: { validator: 'room', code: 'PRUEFUNG' } },
        },
      }),
    ).not.toThrow();
  });
});

describe('createDeclareResource: links, page, and atomic (SPEC 2)', () => {
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

  it('sets its Atomic Operations cap on every declaration, checked by the jsonapi-core rule', () => {
    const declaration = { operations: ['remove'], fields: {} };
    const capped = configure({
      ...valid,
      atomic: { max: 50 },
    }) as UntypedDeclare;
    expect(capped('teams', declaration).resource.atomic).toEqual({ max: 50 });
    const byDefault = configure(valid) as UntypedDeclare;
    expect(byDefault('teams', declaration).resource.atomic).toEqual({
      max: 10,
    });
    expect(failure({ ...valid, atomic: { max: 0 } })).toBe(
      'createDeclareResource.atomic.max must be a positive safe integer, received 0',
    );
    expect(failure({ ...valid, atomic: { size: 10 } })).toBe(
      'createDeclareResource.atomic: unknown member "size"',
    );
    expect(
      typeErrorOf(() =>
        capped('teams', { ...declaration, atomic: { max: 5 } }),
      ),
    ).toBe('teams: unknown member "atomic"');
  });
});
