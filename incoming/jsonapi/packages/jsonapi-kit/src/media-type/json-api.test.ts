import { describe, expect, it } from 'vitest';

import {
  formatJsonApiMediaType,
  isJsonApiMediaType,
  jsonApiParameters,
} from './json-api';
import { parseMediaType } from './parse';

function parsed(value: string) {
  const mediaType = parseMediaType(value);
  if (mediaType === undefined) {
    throw new Error(`unparseable: ${value}`);
  }
  return mediaType;
}

describe('isJsonApiMediaType', () => {
  it('matches application/vnd.api+json case-insensitively and ignores parameters', () => {
    expect(isJsonApiMediaType(parsed('application/vnd.api+json'))).toBe(true);
    expect(isJsonApiMediaType(parsed('Application/VND.API+JSON; q=1'))).toBe(
      true,
    );
    expect(isJsonApiMediaType(parsed('application/json'))).toBe(false);
    expect(isJsonApiMediaType(parsed('application/vnd.api+json+ld'))).toBe(
      false,
    );
  });
});

describe('jsonApiParameters', () => {
  it('splits ext and profile on spaces and lists other parameter names', () => {
    expect(
      jsonApiParameters(
        parsed(
          'application/vnd.api+json; ext="https://a  https://b"; profile="https://p"; charset=utf-8; ext="https://b https://c"',
        ),
      ),
    ).toEqual({
      ext: ['https://a', 'https://b', 'https://c'],
      profile: ['https://p'],
      other: ['charset'],
    });
  });

  it('treats an empty value as no URIs', () => {
    expect(
      jsonApiParameters(parsed('application/vnd.api+json; ext=""')),
    ).toEqual({ ext: [], profile: [], other: [] });
  });
});

describe('formatJsonApiMediaType', () => {
  it('omits empty parameters and quotes URI lists', () => {
    expect(formatJsonApiMediaType()).toBe('application/vnd.api+json');
    expect(formatJsonApiMediaType({ ext: [], profile: [] })).toBe(
      'application/vnd.api+json',
    );
    expect(
      formatJsonApiMediaType({
        ext: ['https://jsonapi.org/ext/atomic'],
        profile: ['https://p/1', 'https://p/2', 'https://p/1'],
      }),
    ).toBe(
      'application/vnd.api+json; ext="https://jsonapi.org/ext/atomic"; profile="https://p/1 https://p/2"',
    );
  });

  it('round-trips through the parser', () => {
    const value = formatJsonApiMediaType({
      ext: ['https://a'],
      profile: ['https://b', 'https://c'],
    });
    expect(jsonApiParameters(parsed(value))).toEqual({
      ext: ['https://a'],
      profile: ['https://b', 'https://c'],
      other: [],
    });
  });
});
