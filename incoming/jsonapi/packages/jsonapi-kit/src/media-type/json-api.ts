/**
 * The JSON:API media type and its two parameters (SPEC 3.2). `ext` and
 * `profile` values are space-separated URI lists; everything else on the
 * media type is "another parameter" that the negotiation rules act on.
 * @ref https://jsonapi.org/format/1.1/#media-type-parameter-rules
 * @packageDocumentation
 */
import type { MediaType } from './parse';

import { JSON_API_MEDIA_TYPE } from '../internal/constants';
import { quoteParameterValue } from './format';

export interface JsonApiParameters {
  /** Extension URIs from every `ext` parameter, in order, deduplicated. */
  readonly ext: ReadonlyArray<string>;
  /** Profile URIs from every `profile` parameter, in order, deduplicated. */
  readonly profile: ReadonlyArray<string>;
  /** Names of parameters other than `ext` and `profile`, in order. */
  readonly other: ReadonlyArray<string>;
}

export interface JsonApiMediaTypeInit {
  readonly ext?: ReadonlyArray<string> | undefined;
  readonly profile?: ReadonlyArray<string> | undefined;
}

/** `application/vnd.api+json` compared case-insensitively, parameters aside. */
export function isJsonApiMediaType(mediaType: MediaType): boolean {
  return (
    mediaType.type === 'application' && mediaType.subtype === 'vnd.api+json'
  );
}

/**
 * Splits a parameter value on U+0020 SPACE, the one separator the
 * specification names. Runs of spaces and surrounding spaces are tolerated
 * because they cannot change which URIs were sent.
 */
function uris(value: string): Array<string> {
  return value.split(' ').filter((uri) => uri !== '');
}

function unique(values: Iterable<string>): Array<string> {
  return [...new Set(values)];
}

/** Reads `ext`, `profile`, and the names of any other parameters. */
export function jsonApiParameters(mediaType: MediaType): JsonApiParameters {
  const ext: Array<string> = [];
  const profile: Array<string> = [];
  const other: Array<string> = [];
  for (const parameter of mediaType.parameters) {
    if (parameter.name === 'ext') {
      ext.push(...uris(parameter.value));
    } else if (parameter.name === 'profile') {
      profile.push(...uris(parameter.value));
    } else {
      other.push(parameter.name);
    }
  }
  return { ext: unique(ext), profile: unique(profile), other };
}

/**
 * `application/vnd.api+json` with `ext` and `profile` parameters when their
 * lists are non-empty. Values are always quoted-strings, as the specification
 * notes HTTP requires for space-separated lists; a single URI is quoted too so
 * there is one serialization regardless of count.
 */
export function formatJsonApiMediaType(
  init: JsonApiMediaTypeInit = {},
): string {
  let out = JSON_API_MEDIA_TYPE;
  const ext = unique(init.ext ?? []);
  const profile = unique(init.profile ?? []);
  if (ext.length > 0) {
    out += `; ext=${quoteParameterValue(ext.join(' '))}`;
  }
  if (profile.length > 0) {
    out += `; profile=${quoteParameterValue(profile.join(' '))}`;
  }
  return out;
}
