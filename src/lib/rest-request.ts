export type QueryParamValue = string | string[];

export interface QueryParameterDefinition {
  name: string;
  type: string;
  style?: string;
  explode?: boolean;
}

export interface QueryValueState {
  value: string;
  enabled: boolean;
}

export interface CustomHeaderState {
  key: string;
  value: string;
  enabled: boolean;
}

export type BatchTargetLocation = 'path' | 'query' | 'body';

export interface BatchTarget {
  location: BatchTargetLocation;
  name: string;
}

export interface BatchRequestValues {
  pathParams: Record<string, string>;
  queryParams: Record<string, QueryParamValue>;
  body: unknown;
}

export interface BatchJsonLine {
  lineNumber: number;
  input: Record<string, unknown>;
}

export interface BatchJsonLineError {
  lineNumber: number;
  message: string;
}

export interface BatchJsonLinesResult {
  rows: BatchJsonLine[];
  errors: BatchJsonLineError[];
}

export function parseBatchJsonLines(text: string, maxRequests = 100): BatchJsonLinesResult {
  const rows: BatchJsonLine[] = [];
  const errors: BatchJsonLineError[] = [];

  for (const [index, rawLine] of text.split('\n').entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const lineNumber = index + 1;
    try {
      const input = JSON.parse(line) as unknown;
      if (!isRecord(input)) {
        errors.push({ lineNumber, message: 'Each line must be a JSON object' });
        continue;
      }
      rows.push({ lineNumber, input });
    } catch (error) {
      errors.push({
        lineNumber,
        message: error instanceof Error ? error.message : 'Invalid JSON',
      });
    }
  }

  if (rows.length > maxRequests) {
    errors.push({ lineNumber: 0, message: `Batch limit is ${maxRequests} requests` });
  }

  return { rows, errors };
}

export function applyBatchJsonLine(
  request: BatchRequestValues,
  input: Record<string, unknown>
): BatchRequestValues {
  const keys = Object.keys(input);
  const isEnvelope = keys.length > 0 && keys.every(key => ['path', 'query', 'body'].includes(key));
  if (!isEnvelope) {
    return { ...request, body: mergeBatchBody(request.body, input) };
  }

  const pathPatch = readBatchPathPatch(input.path);
  const queryPatch = readBatchQueryPatch(input.query);
  const bodyPatch = input.body;
  if (bodyPatch !== undefined && !isRecord(bodyPatch)) {
    throw new Error('body must be a JSON object');
  }

  return {
    pathParams: { ...request.pathParams, ...pathPatch },
    queryParams: { ...request.queryParams, ...queryPatch },
    body: bodyPatch === undefined ? request.body : mergeBatchBody(request.body, bodyPatch),
  };
}

export function applyBatchValue(
  request: BatchRequestValues,
  target: BatchTarget,
  value: string
): BatchRequestValues {
  if (target.location === 'path') {
    return { ...request, pathParams: { ...request.pathParams, [target.name]: value } };
  }

  if (target.location === 'query') {
    return { ...request, queryParams: { ...request.queryParams, [target.name]: value } };
  }

  if (!isRecord(request.body)) {
    throw new Error('A JSON object body is required to vary a body property');
  }

  return {
    ...request,
    body: {
      ...request.body,
      [target.name]: coerceBatchBodyValue(value, request.body[target.name]),
    },
  };
}

export function collectEnabledQueryParams(
  values: Record<string, QueryValueState>,
  definitions: QueryParameterDefinition[]
): Record<string, QueryParamValue> {
  const definitionsByName = new Map(definitions.map(definition => [definition.name, definition]));
  const queryParams: Record<string, QueryParamValue> = {};

  for (const [name, state] of Object.entries(values)) {
    if (!state.enabled || state.value.length === 0) continue;

    const definition = definitionsByName.get(name);
    if (definition?.type !== 'array') {
      queryParams[name] = state.value;
      continue;
    }

    const items = state.value.split(',').map(value => value.trim()).filter(Boolean);
    if (items.length === 0) continue;

    const style = definition.style || 'form';
    const explode = definition.explode ?? true;
    if (style === 'spaceDelimited') {
      queryParams[name] = items.join(' ');
    } else if (style === 'pipeDelimited') {
      queryParams[name] = items.join('|');
    } else {
      queryParams[name] = explode ? items : items.join(',');
    }
  }

  return queryParams;
}

export function collectEnabledHeaders(headers: CustomHeaderState[]): Record<string, string> {
  return Object.fromEntries(
    headers
      .filter(header => header.enabled && header.key.trim().length > 0)
      .map(header => [header.key.trim(), header.value])
  );
}

export function resolvePath(pathTemplate: string, pathParams: Record<string, string>): string {
  return pathTemplate.replace(/\{([\w-]+)\}/g, (placeholder, key: string) => {
    const value = pathParams[key];
    return value ? encodeURIComponent(value) : placeholder;
  });
}

export function serializeQueryParams(queryParams: Record<string, QueryParamValue>): string {
  const searchParams = new URLSearchParams();
  for (const [name, value] of Object.entries(queryParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item.length > 0) searchParams.append(name, item);
      }
    } else if (value.length > 0) {
      searchParams.append(name, value);
    }
  }
  return searchParams.toString();
}

export function buildRestUrl(
  baseUrl: string,
  pathTemplate: string,
  pathParams: Record<string, string>,
  queryParams: Record<string, QueryParamValue>
): string {
  const resolvedPath = resolvePath(pathTemplate, pathParams);
  const queryString = serializeQueryParams(queryParams);
  return `${baseUrl.replace(/\/$/, '')}${resolvedPath}${queryString ? `?${queryString}` : ''}`;
}

export function validatePaginationUrl(nextPageUrl: string, baseUrl: string): void {
  const next = new URL(nextPageUrl);
  const base = new URL(baseUrl);
  if (next.origin !== base.origin) {
    throw new Error(`Pagination URL origin ${next.origin} does not match configured base ${base.origin}`);
  }

  const basePath = base.pathname.replace(/\/$/, '');
  if (basePath && basePath !== '/' && next.pathname !== basePath && !next.pathname.startsWith(`${basePath}/`)) {
    throw new Error(`Pagination URL path is outside configured API base ${basePath}`);
  }
}

export function mergePaginatedBody(currentBody: unknown, nextBody: unknown): unknown {
  if (Array.isArray(currentBody) && Array.isArray(nextBody)) {
    return [...currentBody, ...nextBody];
  }

  if (isRecord(currentBody) && isRecord(nextBody)) {
    for (const key of ['items', 'repositories', 'installations']) {
      if (Array.isArray(currentBody[key]) && Array.isArray(nextBody[key])) {
        return {
          ...nextBody,
          [key]: [...currentBody[key], ...nextBody[key]],
        };
      }
    }
  }

  return nextBody;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerceBatchBodyValue(value: string, currentValue: unknown): unknown {
  if (typeof currentValue === 'number') {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new Error(`Expected a number but received "${value}"`);
    }
    return numberValue;
  }

  if (typeof currentValue === 'boolean') {
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`Expected true or false but received "${value}"`);
  }

  return value;
}

function mergeBatchBody(base: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = isRecord(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch)) {
    result[key] = isRecord(value) ? mergeBatchBody(result[key], value) : value;
  }
  return result;
}

function readBatchPathPatch(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.values(value).some(item => typeof item !== 'string')) {
    throw new Error('path values must be strings');
  }
  return value as Record<string, string>;
}

function readBatchQueryPatch(value: unknown): Record<string, QueryParamValue> {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.values(value).some(item => (
    typeof item !== 'string'
    && (!Array.isArray(item) || item.some(entry => typeof entry !== 'string'))
  ))) {
    throw new Error('query values must be strings or arrays of strings');
  }
  return value as Record<string, QueryParamValue>;
}
