import type { Surface } from './surface';

import { describe, expect, it } from 'vitest';

import { Contacts, Organizations } from '../test-support/definition-resources';
import { diffSurfaces } from './diff';
import { surfaceOf } from './surface';

/**
 * `diffSurfaces` (SPEC 13.2), one case per row of the table and one per
 * further rule, each over a real surface with one edit.
 */

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };

const BASE = surfaceOf([Organizations, Contacts]);

function edited(edit: (surface: Mutable<Surface>) => void): Surface {
  const copy = structuredClone(BASE) as Mutable<Surface>;
  edit(copy);
  return copy;
}

const contacts = (surface: Mutable<Surface>) => surface.resources['contacts']!;
const organizations = (surface: Mutable<Surface>) =>
  surface.resources['organizations']!;
const field = (surface: Mutable<Surface>, name: string) =>
  contacts(surface).fields[name]!;

/** The changes from `before` to `after` as `[path, change, breaking]`. */
function summary(before: Surface, after: Surface) {
  return diffSurfaces(before, after).map(
    ({ path, change, breaking }) => [path.join('/'), change, breaking] as const,
  );
}

describe('diffSurfaces', () => {
  it('finds nothing between a surface and itself', () => {
    expect(diffSurfaces(BASE, structuredClone(BASE))).toEqual([]);
  });

  it('breaks on a type, operation, field, relationship, code, operator, or sortable flag removed', () => {
    const after = edited((surface) => {
      const { resources } = surface;
      delete resources['organizations'];
      const resource = contacts(surface);
      resource.operations = resource.operations.filter(
        (operation) => operation !== 'update',
      );
      delete resource.fields['email'];
      delete resource.relationships['organization'];
      delete resource.codes['CONTACTS_NAME_CHECK'];
      field(surface, 'name').operators = ['eq'];
      field(surface, 'priority').sortable = false;
    });
    expect(summary(BASE, after)).toEqual([
      ['contacts/operations/update', 'removed', true],
      ['contacts/fields/email', 'removed', true],
      ['contacts/fields/name/operators/startsWithi', 'removed', true],
      ['contacts/fields/priority/sortable', 'changed', true],
      ['contacts/relationships/organization', 'removed', true],
      ['contacts/codes/CONTACTS_NAME_CHECK', 'removed', true],
      ['organizations', 'removed', true],
    ]);
    expect(diffSurfaces(BASE, after).at(-1)).toMatchObject({
      before: BASE.resources['organizations'],
      after: null,
    });
  });

  it('reports a rename as a removal, which breaks, and an addition', () => {
    const after = edited((surface) => {
      const resource = contacts(surface);
      resource.fields['mail'] = resource.fields['email']!;
      delete resource.fields['email'];
    });
    expect(summary(BASE, after)).toEqual([
      ['contacts/fields/email', 'removed', true],
      ['contacts/fields/mail', 'added', false],
    ]);
  });

  it('breaks on a member becoming required on create, or a new one required, but not without a create', () => {
    const after = edited((surface) => {
      field(surface, 'email').required = true;
      contacts(surface).fields['fax'] = {
        ...field(surface, 'email'),
        required: true,
      };
      const { fields } = organizations(surface);
      fields['name']!.required = true;
      fields['code'] = { ...fields['name']! };
    });
    expect(summary(BASE, after)).toEqual([
      ['contacts/fields/email/required', 'changed', true],
      ['contacts/fields/fax', 'added', true],
      ['organizations/fields/code', 'added', false],
      ['organizations/fields/name/required', 'changed', false],
    ]);
  });

  it('breaks on a writable member becoming non-nullable or a readable one nullable, not the reverse', () => {
    const after = edited((surface) => {
      field(surface, 'website').nullable = false;
      field(surface, 'createdAt').nullable = true;
      field(surface, 'alias').nullable = false;
    });
    expect(summary(BASE, after)).toEqual([
      ['contacts/fields/alias/nullable', 'changed', true],
      ['contacts/fields/createdAt/nullable', 'changed', true],
      ['contacts/fields/website/nullable', 'changed', true],
    ]);
    expect(summary(after, BASE)).toEqual([
      ['contacts/fields/alias/nullable', 'changed', true],
      ['contacts/fields/createdAt/nullable', 'changed', false],
      ['contacts/fields/website/nullable', 'changed', false],
    ]);
  });

  it("breaks on an option removed, a limit tightened, a pattern added, or a code's status changed", () => {
    const after = edited((surface) => {
      field(surface, 'kind').options = ['person'];
      field(surface, 'name').limits.maxLength = 100;
      field(surface, 'name').limits.patterns = ['^[A-Z]'];
      contacts(surface).codes['CONTACTS_EMAIL_UNIQUE'] = 422;
    });
    expect(summary(BASE, after)).toEqual([
      ['contacts/fields/kind/options/company', 'removed', true],
      ['contacts/fields/name/limits/maxLength', 'changed', true],
      ['contacts/fields/name/limits/patterns/^[A-Z]', 'added', true],
      ['contacts/codes/CONTACTS_EMAIL_UNIQUE', 'changed', true],
    ]);
  });

  it('does not break on a member, option, operator, code, or operation added, or a limit loosened', () => {
    const after = edited((surface) => {
      contacts(surface).fields['fax'] = field(surface, 'email');
      field(surface, 'kind').options = ['person', 'company', 'other'];
      field(surface, 'email').operators = ['eq', 'eqi'];
      contacts(surface).codes['CONTACTS_FAX_CHECK'] = 422;
      organizations(surface).operations = ['get', 'list', 'remove'];
      field(surface, 'name').limits.maxLength = 300;
      field(surface, 'name').limits.minLength = null;
      field(surface, 'website').limits.patterns = [];
    });
    expect(summary(BASE, after)).toEqual([
      ['contacts/fields/email/operators/eq', 'added', false],
      ['contacts/fields/fax', 'added', false],
      ['contacts/fields/kind/options/other', 'added', false],
      ['contacts/fields/name/limits/minLength', 'changed', false],
      ['contacts/fields/name/limits/maxLength', 'changed', false],
      ['contacts/fields/website/limits/patterns/^https://', 'removed', false],
      ['contacts/codes/CONTACTS_FAX_CHECK', 'added', false],
      ['organizations/operations/remove', 'added', false],
    ]);
  });

  it('reads a numeric side as one bound, its exclusivity included, and a step or digits as a bound', () => {
    const exclusive = edited((surface) => {
      const { limits } = field(surface, 'priority');
      limits.minimum = null;
      limits.exclusiveMinimum = '1';
      limits.maximum = '9';
      limits.multipleOf = '1';
      field(surface, 'createdAt').fractionDigits = 3;
    });
    expect(summary(BASE, exclusive)).toEqual([
      ['contacts/fields/createdAt/fractionDigits', 'changed', true],
      ['contacts/fields/priority/limits/minimum', 'changed', true],
      ['contacts/fields/priority/limits/exclusiveMinimum', 'changed', true],
      ['contacts/fields/priority/limits/maximum', 'changed', false],
      ['contacts/fields/priority/limits/multipleOf', 'changed', true],
    ]);
    expect(summary(exclusive, BASE).map(([, , breaking]) => breaking)).toEqual([
      false,
      false,
      false,
      true,
      false,
    ]);
  });

  it('compares a bound on both sides by its value, breaks when one appears, and adds a type safely', () => {
    const before = edited((surface) => {
      const { resources } = surface;
      delete resources['organizations'];
      const { limits } = field(surface, 'priority');
      limits.minimum = null;
      limits.multipleOf = '0.5';
      field(surface, 'name').limits.minLength = 0;
    });
    const after = edited((surface) => {
      field(surface, 'priority').limits.multipleOf = '1';
    });
    expect(summary(before, after)).toEqual([
      ['contacts/fields/name/limits/minLength', 'changed', true],
      ['contacts/fields/priority/limits/minimum', 'changed', true],
      ['contacts/fields/priority/limits/multipleOf', 'changed', true],
      ['organizations', 'added', false],
    ]);
  });

  it('breaks on a capability lost from the access, a representation changed, or a closed set of options appearing', () => {
    const after = edited((surface) => {
      field(surface, 'name').access = 'immutable';
      field(surface, 'website').access = 'readWrite';
      field(surface, 'priority').wire = 'number';
      field(surface, 'email').options = ['a@example.com'];
      field(surface, 'tags').items!.options = ['math'];
      contacts(surface).relationships['organization']!.target = 'teams';
    });
    expect(summary(BASE, after)).toEqual([
      ['contacts/fields/email/options', 'changed', true],
      ['contacts/fields/name/access', 'changed', true],
      ['contacts/fields/priority/wire', 'changed', true],
      ['contacts/fields/tags/items/options', 'changed', true],
      ['contacts/fields/website/access', 'changed', false],
      ['contacts/relationships/organization/target', 'changed', true],
    ]);
  });

  it('breaks on an include, the search parameter, a page maximum, or range pages withdrawn, not on a new default page size', () => {
    const after = edited((surface) => {
      contacts(surface).relationships['organization']!.include = false;
      contacts(surface).search = null;
      contacts(surface).page = { default: 10, max: 40, range: false };
      organizations(surface).search = 'filter[q]';
      organizations(surface).page = null;
    });
    expect(summary(BASE, after)).toEqual([
      ['contacts/relationships/organization/include', 'changed', true],
      ['contacts/search', 'removed', true],
      ['contacts/page/default', 'changed', false],
      ['contacts/page/max', 'changed', true],
      ['organizations/search', 'added', false],
      ['organizations/page', 'removed', true],
    ]);
    const ranged = edited((surface) => {
      contacts(surface).page = { default: 25, max: 50, range: true };
      contacts(surface).search = 'search';
    });
    expect(summary(ranged, BASE)).toEqual([
      ['contacts/search', 'changed', true],
      ['contacts/page/range', 'changed', true],
    ]);
  });
});
