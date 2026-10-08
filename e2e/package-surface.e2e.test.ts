/**
 * Package surface. Both subpaths must resolve through the published
 * `exports` map at runtime and export exactly what the SPEC lists. Value
 * imports on purpose: a missing dist file or a wrong `exports` entry fails
 * here before any feature test runs.
 */
import { describe, expect, it } from 'vitest';

import * as root from 'hono-jsonapi';
import * as atomic from 'hono-jsonapi/atomic';

function names(module: object): Array<string> {
  return Object.keys(module).toSorted();
}

describe('package surface', () => {
  it('root exports the SPEC section 1 values', () => {
    expect(names(root)).toEqual(
      [
        'ATOMIC_OPERATIONS_EXTENSION',
        'CURSOR_PAGINATION_PROFILE',
        'ERROR_CATALOG',
        'ERROR_CODES',
        'JSON_API_MEDIA_TYPE',
        'JSON_API_VERSION',
        'JsonApiError',
        'MAX_SIZE_EXCEEDED_TYPE',
        'RANGE_PAGINATION_NOT_SUPPORTED_TYPE',
        'UNSUPPORTED_SORT_TYPE',
        'applyFields',
        'assertFullLinkage',
        'assertMemberName',
        'bodyValidator',
        'collectionDocument',
        'defineResource',
        'errorDocument',
        'errorHandler',
        'errorObject',
        'formatJsonApiMediaType',
        'identify',
        'include',
        'invalidCursor',
        'invalidCursorError',
        'isAtMember',
        'isErrorStatusCode',
        'isExtensionMemberName',
        'isJsonApiError',
        'isJsonApiMediaType',
        'isJsonApiResponse',
        'isMemberName',
        'isMemberPath',
        'itemCursorMeta',
        'jsonApi',
        'jsonApiObject',
        'jsonApiParameters',
        'maxPageSizeExceededError',
        'negotiate',
        'notFoundHandler',
        'pageMeta',
        'paginatedDocument',
        'paginationLinks',
        'parseAccept',
        'parseCreateDocument',
        'parseIdentifier',
        'parseLinkage',
        'parseMediaType',
        'parseQuery',
        'parseResourceObject',
        'parseToManyRelationshipDocument',
        'parseToOneRelationshipDocument',
        'parseUpdateDocument',
        'primaryData',
        'queryValidator',
        'rangePaginationNotSupportedError',
        'readDocument',
        'reasonPhrase',
        'relatedResource',
        'relationshipValidator',
        'resourceDocument',
        'respond',
        'respondError',
        'responseStatus',
        'serializeResource',
        'toJsonApiError',
        'toManyLinkage',
        'toOneLinkage',
        'toManyRelationshipDocument',
        'toOneRelationshipDocument',
        'unsupportedSort',
        'unsupportedSortError',
        'varyAccept',
      ].toSorted(),
    );
    expect(root.JSON_API_MEDIA_TYPE).toBe('application/vnd.api+json');
    expect(root.JSON_API_VERSION).toBe('1.1');
    expect(root.ATOMIC_OPERATIONS_EXTENSION).toBe(
      'https://jsonapi.org/ext/atomic',
    );
    expect(root.CURSOR_PAGINATION_PROFILE).toBe(
      'http://jsonapi.org/profiles/ethanresnick/cursor-pagination/',
    );
  });

  it('the atomic subpath exports the handler and the document parser', () => {
    expect(names(atomic)).toEqual([
      'atomicOperations',
      'parseOperationsDocument',
    ]);
  });
});
