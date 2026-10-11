import { describe, expect, it } from 'vitest';

import { ISSUE_KINDS } from '../schema/issue-kinds';
import { issueMessage } from '../schema/issue-messages';
import { ISSUE_MESSAGES, labelOf } from './english';

describe('labelOf (SPEC 10.2)', () => {
  it('makes a label from a public name', () => {
    expect(labelOf('createdAt')).toBe('Created at');
    expect(labelOf('first_name')).toBe('First name');
    expect(labelOf('organization')).toBe('Organization');
    expect(labelOf('vatID')).toBe('Vat id');
    expect(labelOf('line2')).toBe('Line2');
    expect(labelOf('e-mail')).toBe('E mail');
  });
});

describe('ISSUE_MESSAGES (SPEC 10.2)', () => {
  it('reads as the English message the item carries before localization (SPEC 6.4)', () => {
    const limit = '12';
    for (const kind of ISSUE_KINDS.filter((name) => name !== 'enum')) {
      const inputs = { field: 'Name', limit, type: 'integer', format: 'uuid' };
      const expected = { limit, type: 'integer', format: 'uuid' }[
        kind === 'type' || kind === 'format' ? kind : 'limit'
      ];
      expect(ISSUE_MESSAGES[kind](inputs)).toBe(
        issueMessage({ kind, expected }),
      );
    }
  });

  it('lists the option labels of an enum, or says that no value is allowed', () => {
    expect(ISSUE_MESSAGES.enum({ field: '', values: 'Person, Firma' })).toBe(
      'Must be one of: Person, Firma.',
    );
    expect(ISSUE_MESSAGES.enum({ field: '', values: '' })).toBe(
      issueMessage({ kind: 'enum', expected: '[]' }),
    );
    expect(ISSUE_MESSAGES.enum({ field: '', values: 'active, archived' })).toBe(
      issueMessage({ kind: 'enum', expected: '["active","archived"]' }),
    );
  });
});
