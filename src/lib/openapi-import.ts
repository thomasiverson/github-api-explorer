/**
 * OpenAPI Spec Importer
 * 
 * Parses GitHub's official OpenAPI spec from github/rest-api-description
 * and imports all endpoint definitions into the SQLite database.
 * 
 * Supports:
 * - api.github.com (cloud, including EMU)
 * - ghes-X.Y (GitHub Enterprise Server versions)
 */

import { v4 as uuidv4 } from 'uuid';

interface OpenApiSpec {
  paths: Record<string, OpenApiPathItem>;
  components?: {
    parameters?: Record<string, OpenApiParameter>;
  };
}

interface OpenApiPathItem {
  parameters?: OpenApiParameter[];
  [method: string]: OpenApiOperation | OpenApiParameter[] | undefined;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: Record<string, { schema?: unknown }>;
  };
  responses?: Record<string, {
    content?: Record<string, { schema?: unknown }>;
  }>;
  'x-github'?: {
    category?: string;
    subcategory?: string;
  };
}

interface OpenApiParameter {
  name: string;
  in: string;
  description?: string;
  required?: boolean;
  schema?: {
    type?: string;
    default?: unknown;
    enum?: string[];
  };
  '$ref'?: string;
}

/**
 * Resolve $ref parameters against components/parameters.
 * Returns the parameter objects with $ref resolved inline.
 */
function resolveParams(
  params: OpenApiParameter[] | undefined,
  components: Record<string, OpenApiParameter> | undefined
): OpenApiParameter[] {
  if (!params) return [];
  return params.map(p => {
    if (p['$ref'] && components) {
      // e.g. "#/components/parameters/enterprise" → "enterprise"
      const refName = p['$ref'].split('/').pop();
      if (refName && components[refName]) {
        return components[refName];
      }
    }
    return p;
  }).filter(p => p.name && p.in); // filter out any unresolved refs
}

interface ImportedEndpoint {
  id: string;
  category: string;
  subcategory: string;
  operationId: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  pathParams: string;
  queryParams: string;
  bodySchema: string | null;
  responseSchema: string | null;
  isDeprecated: boolean;
  specVersion: string;
}

function extractParams(parameters: OpenApiParameter[] | undefined, location: string) {
  if (!parameters) return [];
  return parameters
    .filter(p => p.in === location)
    .map(p => ({
      name: p.name,
      description: p.description || '',
      required: p.required || false,
      type: p.schema?.type || 'string',
      default: p.schema?.default !== undefined ? String(p.schema.default) : undefined,
      enum: p.schema?.enum,
    }));
}

function extractBodySchema(op: OpenApiOperation): string | null {
  const content = op.requestBody?.content;
  if (!content) return null;
  const jsonContent = content['application/json'];
  if (!jsonContent?.schema) return null;
  // Simplify deeply nested schemas to keep storage reasonable
  return JSON.stringify(simplifySchema(jsonContent.schema));
}

function extractResponseSchema(op: OpenApiOperation): string | null {
  const resp = op.responses?.['200'] || op.responses?.['201'] || op.responses?.['202'];
  if (!resp?.content) return null;
  const jsonContent = resp.content['application/json'];
  if (!jsonContent?.schema) return null;
  return JSON.stringify(simplifySchema(jsonContent.schema));
}

function simplifySchema(schema: unknown, depth = 0): unknown {
  if (depth > 4 || !schema || typeof schema !== 'object') return schema;
  const s = schema as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  if (s.type) result.type = s.type;
  if (s.description) result.description = s.description;
  if (s.enum) result.enum = s.enum;
  if (s.required) result.required = s.required;
  if (s.default !== undefined) result.default = s.default;

  if (s.properties && typeof s.properties === 'object') {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(s.properties as Record<string, unknown>)) {
      props[key] = simplifySchema(value, depth + 1);
    }
    result.properties = props;
  }

  if (s.items) {
    result.items = simplifySchema(s.items, depth + 1);
  }

  return result;
}

export function parseOpenApiSpec(spec: OpenApiSpec, specVersion: string): ImportedEndpoint[] {
  const endpoints: ImportedEndpoint[] = [];
  const componentParams = spec.components?.parameters;

  for (const [pathTemplate, pathItem] of Object.entries(spec.paths)) {
    // Path-level parameters (shared across all methods), resolve $ref
    const pathLevelParams = resolveParams(
      (pathItem.parameters || []) as OpenApiParameter[],
      componentParams
    );

    for (const [method, operation] of Object.entries(pathItem)) {
      if (['get', 'post', 'put', 'patch', 'delete'].indexOf(method.toLowerCase()) === -1) continue;

      const op = operation as OpenApiOperation;
      const ghMeta = op['x-github'];
      const category = ghMeta?.category || op.tags?.[0] || 'uncategorized';
      const subcategory = ghMeta?.subcategory || '';

      // Resolve $ref in operation-level parameters, then merge with path-level
      const opParams = resolveParams(op.parameters, componentParams);
      const opParamNames = new Set(opParams.map(p => `${p.in}:${p.name}`));
      const mergedParams = [
        ...opParams,
        ...pathLevelParams.filter(p => !opParamNames.has(`${p.in}:${p.name}`)),
      ];

      const operationId = op.operationId || `${method}_${pathTemplate}`.replace(/[^a-zA-Z0-9]/g, '_');
      let pathParams = extractParams(mergedParams, 'path');
      const queryParams = extractParams(mergedParams, 'query');

      // Fallback: infer path params from {param} segments if none were extracted
      if (pathParams.length === 0) {
        const matches = pathTemplate.match(/\{([\w-]+)\}/g);
        if (matches) {
          pathParams = matches.map(m => ({
            name: m.slice(1, -1),
            description: '',
            required: true,
            type: 'string',
            default: undefined,
            enum: undefined,
          }));
        }
      }

      endpoints.push({
        id: uuidv4(),
        category,
        subcategory,
        operationId,
        method: method.toUpperCase(),
        path: pathTemplate,
        summary: op.summary || '',
        description: (op.description || '').substring(0, 2000), // cap at 2000 chars
        pathParams: JSON.stringify(pathParams),
        queryParams: JSON.stringify(queryParams),
        bodySchema: extractBodySchema(op),
        responseSchema: extractResponseSchema(op),
        isDeprecated: op.deprecated || false,
        specVersion,
      });
    }
  }

  return endpoints;
}

/**
 * Fetch the OpenAPI spec from GitHub's rest-api-description repo.
 * @param version - "api.github.com" for cloud, or "ghes-3.12" etc.
 */
export async function fetchOpenApiSpec(version = 'api.github.com'): Promise<OpenApiSpec> {
  // GitHub publishes bundled specs at:
  // https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/{version}/api.github.com.json
  // For GHES: descriptions/ghes-3.12/ghes-3.12.json
  let url: string;
  if (version === 'api.github.com') {
    url = 'https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json';
  } else {
    url = `https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/${version}/${version}.json`;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAPI spec from ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<OpenApiSpec>;
}

/**
 * Import endpoints from OpenAPI spec into the database.
 * Clears existing endpoints for the spec version before importing.
 */
export async function importOpenApiSpec(
  db: {
    clearEndpoints: (specVersion: string) => void;
    insertEndpoint: (endpoint: ImportedEndpoint) => void;
  },
  specVersion = 'api.github.com'
): Promise<{ count: number; categories: number }> {
  console.log(`Fetching OpenAPI spec for ${specVersion}...`);
  const spec = await fetchOpenApiSpec(specVersion);

  console.log('Parsing spec...');
  const endpoints = parseOpenApiSpec(spec, specVersion);

  console.log(`Clearing existing endpoints for ${specVersion}...`);
  db.clearEndpoints(specVersion);

  console.log(`Importing ${endpoints.length} endpoints...`);
  for (const endpoint of endpoints) {
    db.insertEndpoint(endpoint);
  }

  const categories = new Set(endpoints.map(e => e.category)).size;
  console.log(`Done! Imported ${endpoints.length} endpoints across ${categories} categories.`);

  return { count: endpoints.length, categories };
}
