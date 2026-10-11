import type { ScopeBindings } from './scope';

import { describe, it } from 'vitest';

import { defineScope } from './scope';

const SCOPES = {
  organization: { column: 'organization_id' },
  region: { column: 'region' },
} as const;

interface AppActor {
  readonly organizationId: number;
  readonly region: string;
}

const organization = defineScope({
  column: 'organization_id',
  value: (actor: AppActor) => actor.organizationId,
  session: 'app.organization_id',
});
const region = defineScope({
  column: 'region',
  value: (actor: AppActor) => actor.region,
  session: 'app.region',
});

describe('ScopeBindings types (SPEC 12.5)', () => {
  it('takes a binding per scope, over its column', () => {
    void ({ organization, region } satisfies ScopeBindings<typeof SCOPES>);
  });

  it('refuses a missing scope, an extra one, and another column', () => {
    // @ts-expect-error region has no binding
    void ({ organization } satisfies ScopeBindings<typeof SCOPES>);
    void ({
      organization,
      region,
      // @ts-expect-error team is not a scope of the definer
      team: region,
    } satisfies ScopeBindings<typeof SCOPES>);
    void ({
      // @ts-expect-error organization's column is organization_id
      organization: region,
      region,
    } satisfies ScopeBindings<typeof SCOPES>);
  });

  it('types the actor the value reads', () => {
    defineScope({
      column: 'organization_id',
      // @ts-expect-error the actor has no tenant member
      value: (actor: AppActor) => actor.tenant,
      session: 'app.organization_id',
    });
  });
});
