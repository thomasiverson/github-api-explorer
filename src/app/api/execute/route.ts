import { NextResponse } from 'next/server';
import { createOctokit } from '@/lib/auth';
import { addHistory, getActiveEnvironment, lookupCategory } from '@/lib/db';
import { buildRestUrl, validatePaginationUrl } from '@/lib/rest-request';
import type { HttpMethod, ExecuteResponse } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request) {
  const startTime = performance.now();
  try {
    const body = await request.json() as Record<string, unknown>;
    const environmentId = typeof body.environmentId === 'string' ? body.environmentId : undefined;
    const pathTemplate = typeof body.path === 'string' ? body.path : undefined;
    const nextPageUrl = typeof body.nextPageUrl === 'string' ? body.nextPageUrl : undefined;
    const methodValue = typeof body.method === 'string' ? body.method.toUpperCase() : nextPageUrl ? 'GET' : '';
    const operationId = typeof body.operationId === 'string' ? body.operationId : undefined;
    const category = typeof body.category === 'string' ? body.category : undefined;

    if (!isHttpMethod(methodValue)) {
      return executeError(`Unsupported or missing HTTP method: ${methodValue || '(missing)'}`, 400, startTime);
    }
    if (!pathTemplate) {
      return executeError('Request path is required', 400, startTime);
    }
    if (nextPageUrl && methodValue !== 'GET') {
      return executeError('Paginated requests must use GET', 400, startTime);
    }

    const pathParams = readStringRecord(body.pathParams, 'pathParams');
    const queryParams = readQueryRecord(body.queryParams);
    const customHeaders = readStringRecord(body.headers, 'headers');
    const requestBody = body.body;

    const envId = environmentId || getActiveEnvironment()?.id;
    if (!envId) {
      return executeError('No active environment', 400, startTime);
    }

    const { octokit, baseUrl } = createOctokit(envId);

    // Build full URL (or use nextPageUrl for pagination)
    const fullUrl = nextPageUrl || buildRestUrl(baseUrl, pathTemplate, pathParams, queryParams);

    try {
      validatePaginationUrl(fullUrl, baseUrl);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Invalid target URL';
      return executeError(`SSRF blocked: ${message}`, 403, startTime);
    }

    // Execute request
    const fetchHeaders: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...customHeaders,
    };

    const fetchOptions: RequestInit = {
      method: methodValue,
      headers: fetchHeaders,
    };

    if (requestBody !== null && requestBody !== undefined && ['POST', 'PUT', 'PATCH'].includes(methodValue)) {
      fetchOptions.body = typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody);
      fetchHeaders['Content-Type'] = 'application/json';
    }

    // Use octokit's auth to get the token for the request
    const auth = await octokit.auth() as { token?: string; type?: string };
    if (auth.token) {
      fetchHeaders['Authorization'] = `token ${auth.token}`;
    }

    const response = await fetch(fullUrl, fetchOptions);
    const timing = Math.round(performance.now() - startTime);

    // Parse response
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    let responseBody: unknown = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('json')) {
      responseBody = await response.json();
    } else {
      const text = await response.text();
      if (text.length > 0) {
        responseBody = text;
      }
    }

    // Parse rate limit info
    const rateLimit = responseHeaders['x-ratelimit-limit'] ? {
      limit: parseInt(responseHeaders['x-ratelimit-limit']),
      remaining: parseInt(responseHeaders['x-ratelimit-remaining']),
      reset: parseInt(responseHeaders['x-ratelimit-reset']),
      used: parseInt(responseHeaders['x-ratelimit-used'] || '0'),
      resource: responseHeaders['x-ratelimit-resource'] || 'core',
    } : null;

    // Parse pagination Link header
    let nextPage: string | null = null;
    const linkHeader = responseHeaders['link'];
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        nextPage = nextMatch[1];
      }
    }

    // Store in history (truncate large bodies)
    const bodyStr = responseBody ? JSON.stringify(responseBody) : null;
    const truncatedBody = bodyStr && bodyStr.length > 100000 ? bodyStr.substring(0, 100000) + '...[truncated]' : bodyStr;

    addHistory({
      id: uuidv4(),
      environmentId: envId,
      method: methodValue,
      path: pathTemplate,
      resolvedUrl: fullUrl,
      status: response.status,
      timing,
      requestBody: requestBody !== null && requestBody !== undefined
        ? (typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody))
        : null,
      responseBody: truncatedBody,
      responseHeaders: JSON.stringify(responseHeaders),
      operationId: operationId || null,
      category: category || lookupCategory(operationId || null, pathTemplate) || null,
    });

    return NextResponse.json({
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      timing,
      rateLimit,
      nextPageUrl: nextPage,
      nextPageRequest: nextPage ? {
        environmentId: envId,
        method: 'GET',
        path: pathTemplate,
        headers: customHeaders,
        operationId,
        category,
      } : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return executeError(message, 500, startTime);
  }
}

const HTTP_METHODS = new Set<string>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

function isHttpMethod(value: string): value is HttpMethod {
  return HTTP_METHODS.has(value);
}

function readStringRecord(value: unknown, fieldName: string): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }

  const entries = Object.entries(value);
  if (entries.some(([, entryValue]) => typeof entryValue !== 'string')) {
    throw new Error(`${fieldName} values must be strings`);
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function readQueryRecord(value: unknown): Record<string, string | string[]> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('queryParams must be an object');
  }

  const entries = Object.entries(value);
  if (entries.some(([, entryValue]) => (
    typeof entryValue !== 'string'
    && (!Array.isArray(entryValue) || entryValue.some(item => typeof item !== 'string'))
  ))) {
    throw new Error('queryParams values must be strings or arrays of strings');
  }
  return Object.fromEntries(entries) as Record<string, string | string[]>;
}

function executeError(message: string, httpStatus: number, startedAt: number) {
  const response: ExecuteResponse & { error: string } = {
    error: message,
    status: httpStatus,
    statusText: 'Proxy Error',
    headers: {},
    body: { error: message },
    timing: Math.round(performance.now() - startedAt),
    rateLimit: null,
    nextPageUrl: null,
    nextPageRequest: null,
  };
  return NextResponse.json(response, { status: httpStatus });
}
