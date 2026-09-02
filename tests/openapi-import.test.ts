import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeOpenApiSpecs,
  parseOpenApiSpec,
  validateImportedEndpoints,
} from '../src/lib/openapi-import';
import type { ImportedEndpoint, OpenApiSpec } from '../src/lib/openapi-import';
import { generateExampleBody } from '../src/lib/openapi-example';

test('resolves referenced and composed request and response schemas', () => {
  const spec = {
    paths: {
      '/widgets/{widget_id}': {
        post: {
          operationId: 'widgets/update',
          parameters: [
            { '$ref': '#/components/parameters/filters' },
          ],
          requestBody: { '$ref': '#/components/requestBodies/UpdateWidget' },
          responses: {
            '200': { '$ref': '#/components/responses/WidgetResponse' },
          },
        },
      },
    },
    components: {
      parameters: {
        filters: {
          name: 'filters',
          in: 'query',
          schema: { type: 'array', items: { type: 'string' } },
          style: 'pipeDelimited',
          explode: false,
        },
      },
      schemas: {
        WidgetBase: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string' } },
        },
        WidgetUpdate: {
          allOf: [
            { '$ref': '#/components/schemas/WidgetBase' },
            {
              type: 'object',
              properties: { enabled: { type: 'boolean', default: true } },
            },
          ],
        },
        Widget: {
          type: 'object',
          properties: { id: { type: 'integer' }, name: { type: 'string' } },
        },
      },
      requestBodies: {
        UpdateWidget: {
          required: true,
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/WidgetUpdate' },
              example: { name: 'demo', enabled: true },
            },
          },
        },
      },
      responses: {
        WidgetResponse: {
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/Widget' },
            },
          },
        },
      },
    },
  } as unknown as OpenApiSpec;

  const [endpoint] = parseOpenApiSpec(spec, 'test-version');
  const bodySchema = JSON.parse(endpoint.bodySchema || '{}');
  const responseSchema = JSON.parse(endpoint.responseSchema || '{}');
  const queryParams = JSON.parse(endpoint.queryParams);

  assert.equal(bodySchema['x-request-body-required'], true);
  assert.deepEqual(bodySchema.example, { name: 'demo', enabled: true });
  assert.equal(bodySchema.allOf[0].properties.name.type, 'string');
  assert.equal(bodySchema.allOf[1].properties.enabled.default, true);
  assert.equal(responseSchema.properties.id.type, 'integer');
  assert.deepEqual(queryParams, [{
    name: 'filters',
    description: '',
    required: false,
    type: 'array',
    style: 'pipeDelimited',
    explode: false,
  }]);
});

test('merges paths and reusable OpenAPI components from every cloud product', () => {
  const publicSpec = {
    paths: {
      '/user': { get: { operationId: 'users/get-authenticated' } },
      '/shared': { get: { operationId: 'shared/get-public' } },
    },
    components: {
      schemas: { PublicSchema: { type: 'string' } },
    },
  } as unknown as OpenApiSpec;
  const enterpriseSpec = {
    paths: {
      '/enterprises/{enterprise}': { get: { operationId: 'enterprise/get' } },
      '/shared': { post: { operationId: 'shared/create-enterprise' } },
    },
    components: {
      schemas: { EnterpriseSchema: { type: 'object' } },
    },
  } as unknown as OpenApiSpec;

  const merged = mergeOpenApiSpecs(publicSpec, enterpriseSpec);

  assert.ok(merged.paths['/user']);
  assert.ok(merged.paths['/enterprises/{enterprise}']);
  assert.ok(merged.paths['/shared'].get);
  assert.ok(merged.paths['/shared'].post);
  assert.ok(merged.components?.schemas?.PublicSchema);
  assert.ok(merged.components?.schemas?.EnterpriseSchema);
});

test('generates examples from composed schemas without losing wrapper requirements', () => {
  const example = JSON.parse(generateExampleBody({
    type: 'object',
    required: ['reason'],
    properties: {
      reason: { type: 'string' },
      read_only_id: { type: 'integer', readOnly: true },
    },
    allOf: [{
      type: 'object',
      required: ['enabled'],
      properties: {
        enabled: { type: 'boolean', default: true },
      },
    }],
  }));

  assert.deepEqual(example, {
    reason: '',
    enabled: true,
  });
});

test('rejects undersized and duplicate catalogs before database replacement', () => {
  assert.throws(
    () => validateImportedEndpoints([], 'test-version'),
    /expected at least 100 endpoints/
  );

  const endpoints = Array.from({ length: 100 }, (_, index) => createEndpoint(index));
  endpoints[99] = { ...endpoints[99], path: endpoints[0].path };
  assert.throws(
    () => validateImportedEndpoints(endpoints, 'test-version'),
    /duplicate route/
  );
});

test('requires public and Enterprise Cloud sentinel routes in the merged cloud catalog', () => {
  const endpoints = Array.from({ length: 997 }, (_, index) => createEndpoint(index));
  endpoints.push(
    createEndpoint(997, '/meta'),
    createEndpoint(998, '/user'),
    createEndpoint(999, '/enterprises/{enterprise}/settings/billing/budgets')
  );

  assert.doesNotThrow(() => validateImportedEndpoints(endpoints, 'api.github.com'));
  assert.throws(
    () => validateImportedEndpoints(endpoints.filter(endpoint => endpoint.path !== '/meta'), 'api.github.com'),
    /expected at least 1000 endpoints/
  );
  assert.throws(
    () => validateImportedEndpoints(
      [...endpoints.slice(0, 999), createEndpoint(1000, '/replacement')],
      'api.github.com'
    ),
    /missing required routes.*billing\/budgets/
  );
});

function createEndpoint(index: number, path = `/test/${index}`): ImportedEndpoint {
  return {
    id: `endpoint-${index}`,
    category: 'test',
    subcategory: '',
    operationId: `test/operation-${index}`,
    method: 'GET',
    path,
    summary: '',
    description: '',
    pathParams: '[]',
    queryParams: '[]',
    bodySchema: null,
    responseSchema: null,
    isDeprecated: false,
    specVersion: 'test-version',
  };
}
