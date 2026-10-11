import { describe, expect, it } from 'vitest';

import { errorObjects } from '../errors/json-api-error';
import { negotiate } from './negotiate';

const JSON_API = 'application/vnd.api+json';
const ATOMIC = 'https://jsonapi.org/ext/atomic';
const VERSION = 'https://example.com/ext/version';
const PROFILE = 'https://example.com/profiles/timestamps';

function failure(result: ReturnType<typeof negotiate>) {
  if (result.ok) {
    throw new Error('expected a failure');
  }
  return result.error;
}

function success(result: ReturnType<typeof negotiate>) {
  if (!result.ok) {
    throw new Error(`expected success, received ${result.error.message}`);
  }
  return result;
}

describe('Content-Type (server responsibilities, paragraphs 1 and 2)', () => {
  it('accepts a bare JSON:API media type and an absent header', () => {
    expect(success(negotiate({ contentType: JSON_API })).request).toEqual({
      mediaType: {
        type: 'application',
        subtype: 'vnd.api+json',
        parameters: [],
      },
      jsonApi: true,
      extensions: [],
      profiles: [],
    });
    expect(success(negotiate({})).request.jsonApi).toBe(false);
    expect(
      success(negotiate({ contentType: null })).request.mediaType,
    ).toBeUndefined();
  });

  it('responds 415 to any parameter other than ext and profile', () => {
    const error = failure(
      negotiate({ contentType: `${JSON_API}; charset=utf-8` }),
    );
    expect(error.status).toBe(415);
    expect(errorObjects(error)[0]).toMatchObject({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      source: { header: 'Content-Type' },
      detail: expect.stringContaining('"charset"'),
    });
    expect(error.headers.get('vary')).toBe('Accept');
    expect(
      failure(
        negotiate(
          { contentType: `${JSON_API}; ext="${ATOMIC}"; q=1` },
          { extensions: [ATOMIC] },
        ),
      ).status,
    ).toBe(415);
  });

  it('responds 415 to an unsupported extension URI and accepts supported ones', () => {
    const error = failure(
      negotiate(
        { contentType: `${JSON_API}; ext="${ATOMIC} ${VERSION}"` },
        { extensions: [ATOMIC] },
      ),
    );
    expect(error.status).toBe(415);
    // An extension is a URI, never a plain token (ADR 0016), so the detail
    // says which part of the media type is refused without quoting it.
    expect(error.message).toBe(
      'The media type names an extension this endpoint does not support',
    );
    expect(
      success(
        negotiate(
          { contentType: `${JSON_API}; ext="${ATOMIC}"` },
          { extensions: [ATOMIC] },
        ),
      ).request.extensions,
    ).toEqual([ATOMIC]);
    expect(
      failure(negotiate({ contentType: `${JSON_API}; ext="${ATOMIC}"` }))
        .status,
    ).toBe(415);
  });

  it('records request profiles without checking them and treats other media types as not JSON:API', () => {
    const result = success(
      negotiate({
        contentType: `${JSON_API}; profile="${PROFILE} https://unknown"`,
      }),
    );
    expect(result.request.profiles).toEqual([PROFILE, 'https://unknown']);
    const json = success(
      negotiate({ contentType: 'application/json; charset=utf-8' }),
    );
    expect(json.request.jsonApi).toBe(false);
    expect(json.request.mediaType?.subtype).toBe('json');
    expect(
      success(negotiate({ contentType: 'not a media type' })).request.mediaType,
    ).toBeUndefined();
  });
});

describe('Accept (server responsibilities, paragraph 3)', () => {
  it('imposes nothing when Accept is absent, empty, or has no JSON:API instance', () => {
    for (const accept of [
      undefined,
      null,
      '',
      '*/*',
      'application/json, text/html',
    ]) {
      const result = success(negotiate({ accept }));
      expect(result.extensions).toEqual([]);
      expect(result.profiles).toEqual([]);
    }
  });

  it('ignores instances with other parameters and responds 406 when all have them', () => {
    const result = success(
      negotiate(
        { accept: `${JSON_API}; charset=utf-8, ${JSON_API}; ext="${ATOMIC}"` },
        { extensions: [ATOMIC] },
      ),
    );
    expect(result.extensions).toEqual([ATOMIC]);
    const error = failure(
      negotiate({ accept: `${JSON_API}; charset=utf-8, ${JSON_API};v=2` }),
    );
    expect(error.status).toBe(406);
    expect(errorObjects(error)[0]).toMatchObject({
      code: 'NOT_ACCEPTABLE',
      source: { header: 'Accept' },
    });
    expect(error.headers.get('vary')).toBe('Accept');
  });

  it('responds 406 only when every instance requires an unsupported extension', () => {
    const error = failure(
      negotiate(
        {
          accept: `${JSON_API}; ext="${VERSION}", ${JSON_API}; ext="${ATOMIC} ${VERSION}"`,
        },
        { extensions: [ATOMIC] },
      ),
    );
    expect(error.status).toBe(406);
    expect(error.message).toContain('extension');
    // One plain instance saves the request: the response applies no extension.
    const saved = success(
      negotiate(
        { accept: `${JSON_API}; ext="${VERSION}", ${JSON_API}` },
        { extensions: [ATOMIC] },
      ),
    );
    expect(saved.extensions).toEqual([]);
  });

  it('honors the highest weight, then the instance requiring more extensions', () => {
    const byWeight = success(
      negotiate(
        { accept: `${JSON_API}; ext="${ATOMIC}"; q=0.5, ${JSON_API}; q=0.9` },
        { extensions: [ATOMIC] },
      ),
    );
    expect(byWeight.extensions).toEqual([]);
    const byExt = success(
      negotiate(
        { accept: `${JSON_API}, ${JSON_API}; ext="${ATOMIC}"` },
        { extensions: [ATOMIC] },
      ),
    );
    expect(byExt.extensions).toEqual([ATOMIC]);
  });

  it('treats q=0 instances as not requested', () => {
    expect(
      success(negotiate({ accept: `${JSON_API}; q=0` })).extensions,
    ).toEqual([]);
    const result = success(
      negotiate(
        { accept: `${JSON_API}; ext="${ATOMIC}"; q=0, ${JSON_API}` },
        { extensions: [ATOMIC] },
      ),
    );
    expect(result.extensions).toEqual([]);
  });

  it('applies requested profiles it supports and ignores unknown ones', () => {
    const result = success(
      negotiate(
        { accept: `${JSON_API}; profile="https://unknown ${PROFILE}"` },
        { profiles: [PROFILE] },
      ),
    );
    expect(result.profiles).toEqual([PROFILE]);
    expect(
      success(negotiate({ accept: `${JSON_API}; profile="${PROFILE}"` }))
        .profiles,
    ).toEqual([]);
  });

  it('checks Content-Type before Accept', () => {
    const error = failure(
      negotiate({
        contentType: `${JSON_API}; charset=utf-8`,
        accept: `${JSON_API}; v=1`,
      }),
    );
    expect(error.status).toBe(415);
  });
});
