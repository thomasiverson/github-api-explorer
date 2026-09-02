/**
 * OpenAPI Spec Importer
 * 
 * Parses GitHub's official OpenAPI spec from github/rest-api-description
 * and imports all endpoint definitions into the SQLite database.
 * 
 * Supports:
 * - GitHub Enterprise Cloud, including EMU
 * - ghes-X.Y (GitHub Enterprise Server versions)
 */

import { v4 as uuidv4 } from 'uuid';

export interface OpenApiSpec {
  paths: Record<string, OpenApiPathItem>;
  components?: OpenApiComponents;
}

interface OpenApiComponents {
  parameters?: Record<string, OpenApiParameter>;
  schemas?: Record<string, unknown>;
  requestBodies?: Record<string, OpenApiRequestBody>;
  responses?: Record<string, OpenApiResponse>;
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
  requestBody?: OpenApiRequestBody;
  responses?: Record<string, OpenApiResponse>;
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
    items?: unknown;
  };
  style?: string;
  explode?: boolean;
  '$ref'?: string;
}

interface OpenApiRequestBody {
  required?: boolean;
  content?: Record<string, OpenApiMediaType>;
  '$ref'?: string;
}

interface OpenApiResponse {
  content?: Record<string, OpenApiMediaType>;
  '$ref'?: string;
}

interface OpenApiMediaType {
  schema?: unknown;
  example?: unknown;
  examples?: Record<string, { value?: unknown }>;
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

export interface ImportedEndpoint {
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
      style: p.style,
      explode: p.explode,
    }));
}

function extractBodySchema(op: OpenApiOperation, spec: OpenApiSpec): string | null {
  const requestBody = resolveReferencedObject<OpenApiRequestBody>(op.requestBody, spec);
  const content = requestBody?.content;
  if (!content) return null;
  const jsonContent = findJsonContent(content);
  if (!jsonContent?.schema) return null;
  const simplified = simplifySchema(jsonContent.schema, spec);
  if (!simplified || typeof simplified !== 'object' || Array.isArray(simplified)) {
    return JSON.stringify(simplified);
  }

  const result = { ...simplified as Record<string, unknown> };
  const example = jsonContent.example ?? firstExampleValue(jsonContent.examples);
  if (example !== undefined && result.example === undefined) {
    result.example = example;
  }
  if (requestBody.required) {
    result['x-request-body-required'] = true;
  }
  return JSON.stringify(result);
}

function extractResponseSchema(op: OpenApiOperation, spec: OpenApiSpec): string | null {
  const rawResponse = op.responses?.['200'] || op.responses?.['201'] || op.responses?.['202'];
  const resp = resolveReferencedObject<OpenApiResponse>(rawResponse, spec);
  if (!resp?.content) return null;
  const jsonContent = findJsonContent(resp.content);
  if (!jsonContent?.schema) return null;
  return JSON.stringify(simplifySchema(jsonContent.schema, spec));
}

function simplifySchema(
  schema: unknown,
  spec: OpenApiSpec,
  depth = 0,
  resolvingRefs = new Set<string>()
): unknown {
  if (!schema || typeof schema !== 'object') return schema;
  const s = schema as Record<string, unknown>;

  if (typeof s['$ref'] === 'string') {
    const ref = s['$ref'];
    if (resolvingRefs.has(ref) || depth > 6) {
      return { '$ref': ref };
    }
    const resolved = resolveJsonPointer(spec, ref);
    if (resolved !== undefined) {
      const nextRefs = new Set(resolvingRefs);
      nextRefs.add(ref);
      return simplifySchema(resolved, spec, depth, nextRefs);
    }
  }

  if (depth > 6) {
    const summary: Record<string, unknown> = {};
    if (s.type) summary.type = s.type;
    if (s.description) summary.description = s.description;
    if (s['$ref']) summary['$ref'] = s['$ref'];
    return summary;
  }

  const result: Record<string, unknown> = {};

  for (const key of [
    'type', 'description', 'format', 'enum', 'required', 'default', 'example',
    'nullable', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern',
    'minItems', 'maxItems', 'uniqueItems', 'readOnly', 'writeOnly', 'deprecated',
  ]) {
    if (s[key] !== undefined) result[key] = s[key];
  }

  if (s.properties && typeof s.properties === 'object') {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(s.properties as Record<string, unknown>)) {
      props[key] = simplifySchema(value, spec, depth + 1, resolvingRefs);
    }
    result.properties = props;
  }

  if (s.items) {
    result.items = simplifySchema(s.items, spec, depth + 1, resolvingRefs);
  }

  for (const compositionKey of ['allOf', 'oneOf', 'anyOf'] as const) {
    const branches = s[compositionKey];
    if (Array.isArray(branches)) {
      result[compositionKey] = branches.map(branch => (
        simplifySchema(branch, spec, depth + 1, resolvingRefs)
      ));
    }
  }

  if (typeof s.additionalProperties === 'boolean') {
    result.additionalProperties = s.additionalProperties;
  } else if (s.additionalProperties) {
    result.additionalProperties = simplifySchema(
      s.additionalProperties,
      spec,
      depth + 1,
      resolvingRefs
    );
  }

  return result;
}

function findJsonContent(content: Record<string, OpenApiMediaType>): OpenApiMediaType | undefined {
  return content['application/json']
    || Object.entries(content).find(([contentType]) => contentType.includes('json'))?.[1];
}

function firstExampleValue(examples: OpenApiMediaType['examples']): unknown {
  if (!examples) return undefined;
  return Object.values(examples).find(example => example.value !== undefined)?.value;
}

function resolveReferencedObject<T extends object>(
  value: (T & { '$ref'?: string }) | undefined,
  spec: OpenApiSpec
): T | undefined {
  if (!value?.['$ref']) return value;
  const resolved = resolveJsonPointer(spec, value['$ref']);
  return resolved && typeof resolved === 'object' ? resolved as T : undefined;
}

function resolveJsonPointer(root: unknown, ref: string): unknown {
  if (!ref.startsWith('#/')) return undefined;
  let current = root;
  for (const encodedSegment of ref.slice(2).split('/')) {
    if (!current || typeof current !== 'object') return undefined;
    const segment = encodedSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
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
        bodySchema: extractBodySchema(op, spec),
        responseSchema: extractResponseSchema(op, spec),
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
  if (version === 'api.github.com') {
    const [publicCloud, enterpriseCloud] = await Promise.all([
      fetchSpec('https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json'),
      fetchSpec('https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/ghec/ghec.json'),
    ]);
    return mergeOpenApiSpecs(publicCloud, enterpriseCloud);
  }

  return fetchSpec(
    `https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/${version}/${version}.json`
  );
}

async function fetchSpec(url: string): Promise<OpenApiSpec> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAPI spec from ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<OpenApiSpec>;
}

export function mergeOpenApiSpecs(...specs: OpenApiSpec[]): OpenApiSpec {
  const paths: Record<string, OpenApiPathItem> = {};
  const parameters: Record<string, OpenApiParameter> = {};
  const schemas: Record<string, unknown> = {};
  const requestBodies: Record<string, OpenApiRequestBody> = {};
  const responses: Record<string, OpenApiResponse> = {};

  for (const spec of specs) {
    Object.assign(parameters, spec.components?.parameters);
    Object.assign(schemas, spec.components?.schemas);
    Object.assign(requestBodies, spec.components?.requestBodies);
    Object.assign(responses, spec.components?.responses);
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      paths[path] = { ...paths[path], ...pathItem };
    }
  }

  return { paths, components: { parameters, schemas, requestBodies, responses } };
}

/**
 * Import endpoints from OpenAPI spec into the database.
 * Clears existing endpoints for the spec version before importing.
 */
export async function importOpenApiSpec(
  db: {
    replaceEndpoints: (specVersion: string, endpoints: ImportedEndpoint[]) => void;
  },
  specVersion = 'api.github.com'
): Promise<{ count: number; categories: number }> {
  console.log(`Fetching OpenAPI spec for ${specVersion}...`);
  const spec = await fetchOpenApiSpec(specVersion);

  console.log('Parsing spec...');
  const endpoints = parseOpenApiSpec(spec, specVersion);
  validateImportedEndpoints(endpoints, specVersion);

  console.log(`Replacing ${specVersion} catalog with ${endpoints.length} endpoints...`);
  db.replaceEndpoints(specVersion, endpoints);

  const categories = new Set(endpoints.map(e => e.category)).size;
  console.log(`Done! Imported ${endpoints.length} endpoints across ${categories} categories.`);

  return { count: endpoints.length, categories };
}

const CLOUD_SENTINEL_ROUTES = [
  'GET /meta',
  'GET /user',
  'GET /enterprises/{enterprise}/settings/billing/budgets',
];

export function validateImportedEndpoints(endpoints: ImportedEndpoint[], specVersion: string): void {
  const minimumCount = specVersion === 'api.github.com' ? 1000 : 100;
  if (endpoints.length < minimumCount) {
    throw new Error(
      `Catalog integrity check failed for ${specVersion}: expected at least ${minimumCount} endpoints, received ${endpoints.length}`
    );
  }

  const routeKeys = new Set<string>();
  for (const endpoint of endpoints) {
    const key = `${endpoint.method} ${endpoint.path}`;
    if (routeKeys.has(key)) {
      throw new Error(`Catalog integrity check failed for ${specVersion}: duplicate route ${key}`);
    }
    routeKeys.add(key);
  }

  if (specVersion === 'api.github.com') {
    const missing = CLOUD_SENTINEL_ROUTES.filter(route => !routeKeys.has(route));
    if (missing.length > 0) {
      throw new Error(
        `Catalog integrity check failed for ${specVersion}: missing required routes ${missing.join(', ')}`
      );
    }
  }
}
