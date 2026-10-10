import { describe, expect, it } from 'vitest';

import { searchConfig } from './search-config';

// Expressions as PostgreSQL 14 and 18 deparse generation expressions
// (pg_get_expr(adbin, adrelid)).
describe('searchConfig (SPEC 7.3)', () => {
  it('reads the configuration of one to_tsvector call', () => {
    expect(
      searchConfig(
        "to_tsvector('english'::regconfig, COALESCE(name, ''::text))",
      ),
    ).toBe('english');
  });

  it('reads the configuration every call names, through setweight and concatenation', () => {
    const expression =
      "(setweight(to_tsvector('english'::regconfig, COALESCE(name, ''::text)), 'A'::\"char\") || " +
      "setweight(to_tsvector('english'::regconfig, COALESCE(email, ''::text)), 'B'::\"char\"))";
    expect(searchConfig(expression)).toBe('english');
  });

  it('accepts pg_catalog.to_tsvector and keeps a schema-qualified configuration name', () => {
    expect(
      searchConfig("pg_catalog.to_tsvector('app.names'::regconfig, body)"),
    ).toBe('app.names');
  });

  it('never matches inside string constants', () => {
    expect(
      searchConfig(
        "to_tsvector('simple'::regconfig, 'to_tsvector(''english''::regconfig, x)'::text)",
      ),
    ).toBe('simple');
  });

  it.each([
    [
      'calls that name different configurations',
      "(to_tsvector('english'::regconfig, a) || to_tsvector('simple'::regconfig, b))",
    ],
    ['a configuration taken from a column', 'to_tsvector(config, body)'],
    ['no to_tsvector call', 'array_to_tsvector(tags)'],
    [
      'a to_tsvector of another schema',
      "app.to_tsvector('simple'::regconfig, body)",
    ],
    ['a call without a second argument', "to_tsvector('english'::regconfig)"],
    ['text the tokenizer rejects', "to_tsvector('english'::regconfig, E'x')"],
  ])('gives null for %s', (_title, expression) => {
    expect(searchConfig(expression)).toBeNull();
  });
});
