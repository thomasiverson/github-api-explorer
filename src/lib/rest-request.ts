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
