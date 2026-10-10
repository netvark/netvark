import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { describe, expect, it } from 'vitest';

import { createBan } from './create-ban';
import {
  errorResponses,
  errorSchema,
  validationResponse,
  validationSchema,
} from './openapi';

const CT = 'application/problem+json';
const ban = createBan({
  errors: {
    ORDER_CONFLICT: {
      status: 409,
      description: 'The order changed underneath you',
    },
  },
});

describe('openapi helpers with @hono/zod-openapi', () => {
  it('emits the schemas verbatim in the generated document', () => {
    const app = new OpenAPIHono();
    app.openapi(
      createRoute({
        method: 'get',
        path: '/orders/{id}',
        request: { params: z.object({ id: z.string() }) },
        responses: {
          200: {
            description: 'The order',
            content: {
              'application/json': { schema: z.object({ id: z.string() }) },
            },
          },
          ...errorResponses(ban, [404, 'ORDER_CONFLICT']),
          422: validationResponse(ban),
        },
      }),
      (c) => c.json({ id: c.req.param('id') }),
    );
    const document = app.getOpenAPI31Document({
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
    });
    const responses = document.paths?.['/orders/{id}']?.get
      ?.responses as Record<
      string,
      { description: string; content: Record<string, { schema: unknown }> }
    >;
    expect(responses['404']?.content[CT]?.schema).toEqual(
      errorSchema(ban, 404),
    );
    expect(responses['409']?.description).toBe(
      'The order changed underneath you',
    );
    expect(responses['422']?.content[CT]?.schema).toEqual(
      validationSchema(ban),
    );
  });
});
