/**
 * The document the contacts API serves (epic #32; resource SPEC 13.1,
 * 19.6): `GET /api/openapi.json` over a socket answers the runtime's
 * document, which an independent validator of the OpenAPI Initiative's
 * schema accepts with the contacts' business examples in it, and every
 * example in it, of a request, of a response, or of a field, passes the
 * schema it illustrates, as a client generator or a mock server reads it.
 * @ref https://spec.openapis.org/oas/v3.1.2.html#media-type-object
 * @ref https://json-schema.org/draft/2020-12/json-schema-validation#section-9.5
 * @ref https://github.com/seriousme/openapi-schema-validator
 */
import type { RuntimeDatabase } from '../runtime/database.ts';
import type { ContactsServer } from '../support/contacts-server.ts';

import { Validator } from '@seriousme/openapi-schema-validator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runtimeDatabases } from '../runtime/database.ts';
import { openContactsServer } from '../support/contacts-server.ts';

const OK = 200;
const MEDIA = 'application/vnd.api+json';

/** An example and the document's segments of the schema it illustrates. */
interface Example {
  readonly where: string;
  readonly schema: ReadonlyArray<string>;
  readonly value: unknown;
}

/** Where the examples of the Media Type Object of `path`, `method`, and `where` sit. */
function media(path: string, method: string, where: string): string {
  return `paths/${path}/${method}/${where}/content/${MEDIA}/examples`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Every example under `node`: each Example Object of a Media Type Object,
 * against the media type's schema, and each value of a schema's `examples`
 * array, against that schema. An example's own value is not searched.
 */
function examplesIn(
  node: unknown,
  segments: ReadonlyArray<string> = [],
): Array<Example> {
  if (Array.isArray(node)) {
    return node.flatMap((item, index) =>
      examplesIn(item, [...segments, String(index)]),
    );
  }
  if (!isRecord(node)) {
    return [];
  }
  const { examples } = node;
  const own: Array<Example> = [];
  if (Array.isArray(examples)) {
    own.push(
      ...examples.map((value, index) => ({
        where: [...segments, 'examples', String(index)].join('/'),
        schema: segments,
        value,
      })),
    );
  } else if (isRecord(examples) && 'schema' in node) {
    own.push(
      ...Object.entries(examples).map(([name, example]) => ({
        where: [...segments, 'examples', name].join('/'),
        schema: [...segments, 'schema'],
        value: isRecord(example) ? example['value'] : undefined,
      })),
    );
  }
  return [
    ...own,
    ...Object.entries(node)
      .filter(([key]) => key !== 'examples')
      .flatMap(([key, member]) => examplesIn(member, [...segments, key])),
  ];
}

describe.each(runtimeDatabases())(
  'on %s, the document the contacts API serves',
  (_name, open) => {
    let database: RuntimeDatabase;
    let server: ContactsServer;

    beforeAll(async () => {
      database = await open();
      server = await openContactsServer(database);
    });
    afterAll(async () => {
      await server.close();
      await database.close();
    });

    it("answers GET /api/openapi.json with the runtime's document", async () => {
      const sent = await server.send('get', '/api/openapi.json');
      expect(sent.status).toBe(OK);
      expect(sent.mediaType).toBe('application/json');
      expect(sent.body).toEqual(JSON.parse(JSON.stringify(server.document)));
    });

    it('passes an independent validator with the business examples in it', async () => {
      const sent = await server.send('get', '/api/openapi.json');
      const validator = new Validator();
      const result = await validator.validate(
        sent.body as Record<string, unknown>,
      );
      expect(result.errors).toBeUndefined();
      expect(result.valid).toBe(true);
    });

    it('holds every example to the schema it illustrates', () => {
      const examples = examplesIn(server.document);
      expect(examples.map(({ where }) => where)).toEqual(
        expect.arrayContaining([
          `${media('/api/contacts', 'post', 'requestBody')}/person`,
          `${media('/api/contacts', 'post', 'requestBody')}/company`,
          `${media('/api/contacts/{id}', 'patch', 'requestBody')}/nickname`,
          `${media('/api/contacts/{id}', 'get', 'responses/200')}/ada`,
        ]),
      );
      for (const { where, schema, value } of examples) {
        expect(server.contract.schema(schema, value), where).toEqual([]);
      }
    });
  },
);
