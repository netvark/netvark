import { describe, expect, it } from 'vitest';

import { timestampReadForm, timestamptzReadForm } from './temporal';

describe('timestampReadForm: timestamp as PostgreSQL prints it (SPEC 3.4)', () => {
  it.each([
    ['2024-01-31T10:20:30', '2024-01-31T10:20:30'],
    ['2024-01-31t10:20:30', '2024-01-31T10:20:30'],
    ['2024-01-31T10:20:30.500', '2024-01-31T10:20:30.5'],
    ['2024-01-31T10:20:30.000', '2024-01-31T10:20:30'],
    ['2024-01-31T10:20:30.123456', '2024-01-31T10:20:30.123456'],
  ])('spells %s as %s', (text, printed) => {
    expect(timestampReadForm(text)).toBe(printed);
  });

  it('leaves text outside the form as it is', () => {
    expect(timestampReadForm('soon')).toBe('soon');
  });
});

describe('timestamptzReadForm: the instant in UTC with Z (SPEC 3.4)', () => {
  it.each([
    ['2024-01-31T10:20:30Z', '2024-01-31T10:20:30Z'],
    ['2024-01-31T10:20:30z', '2024-01-31T10:20:30Z'],
    ['2024-01-31T10:20:30+00:00', '2024-01-31T10:20:30Z'],
    ['2024-01-31T10:20:30-00:00', '2024-01-31T10:20:30Z'],
    ['2024-01-31T12:20:30+02:00', '2024-01-31T10:20:30Z'],
    ['2024-01-31T00:20:30.50+02:00', '2024-01-30T22:20:30.5Z'],
    ['2024-12-31T23:30:00-01:00', '2025-01-01T00:30:00Z'],
    ['2024-03-01T00:30:00+01:00', '2024-02-29T23:30:00Z'],
    ['2023-03-01T00:30:00+01:00', '2023-02-28T23:30:00Z'],
    ['2024-01-01T00:00:00+15:59', '2023-12-31T08:01:00Z'],
    ['2024-01-31T10:20:30.000Z', '2024-01-31T10:20:30Z'],
  ])('spells %s as %s', (text, printed) => {
    expect(timestamptzReadForm(text)).toBe(printed);
  });

  it('leaves text outside the form as it is', () => {
    expect(timestamptzReadForm('2024-01-31T10:20:30')).toBe(
      '2024-01-31T10:20:30',
    );
  });
});
