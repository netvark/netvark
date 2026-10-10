import { describe, expect, it } from 'vitest';

import { CODE_CASES } from '../test-support/code-cases';
import { deriveCode, isCode } from './code';

describe('isCode, the runtime twin of IsCode (SPEC 4.2, 17)', () => {
  it.each(CODE_CASES)('%j matches CODE_PATTERN: %s', (code, valid) => {
    expect(isCode(code)).toBe(valid);
  });
});

describe('deriveCode (SPEC 4.1)', () => {
  it('upper-cases a rule key with String.prototype.toUpperCase', () => {
    expect(deriveCode('contacts_email_unique')).toBe('CONTACTS_EMAIL_UNIQUE');
    expect(deriveCode('notes_größe_check')).toBe('NOTES_GRÖSSE_CHECK');
    expect(deriveCode('Notes_body_check')).toBe('NOTES_BODY_CHECK');
  });
});
