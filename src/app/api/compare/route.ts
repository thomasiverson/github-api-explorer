import { NextRequest, NextResponse } from 'next/server';
import { getSpecVersions, getEndpointsByVersion, getEndpointCount } from '@/lib/db';

interface EndpointRow {
  id: string; category: string; subcategory: string; operation_id: string;
  method: string; path: string; summary: string; description: string;
  path_params: string; query_params: string; body_schema: string | null;
  response_schema: string | null; is_deprecated: number; spec_version: string;
}

interface DiffEntry {
  method: string;
  path: string;
  category: string;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
  summary: string;
  changes?: string[];
  fromEndpoint?: Record<string, unknown>;
  toEndpoint?: Record<string, unknown>;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'versions';

  if (action === 'versions') {
    const versions = getSpecVersions();
    const total = getEndpointCount();
    // Also list available versions from GitHub
    const available = [
      'api.github.com', 'ghec',
      'ghes-3.20', 'ghes-3.19', 'ghes-3.18', 'ghes-3.17', 'ghes-3.16',
      'ghes-3.15', 'ghes-3.14', 'ghes-3.13', 'ghes-3.12', 'ghes-3.11',
      'ghes-3.10', 'ghes-3.9', 'ghes-3.8', 'ghes-3.7', 'ghes-3.6',
    ];
    return NextResponse.json({ imported: versions, available, total });
  }

  if (action === 'diff') {
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (!from || !to) {
      return NextResponse.json({ error: 'from and to required' }, { status: 400 });
    }

    try {
      const fromEndpoints = getEndpointsByVersion(from);
      const toEndpoints = getEndpointsByVersion(to);

      if (fromEndpoints.length === 0) {
        return NextResponse.json({ error: `No endpoints found for version "${from}". Import it first.` }, { status: 400 });
      }
      if (toEndpoints.length === 0) {
        return NextResponse.json({ error: `No endpoints found for version "${to}". Import it first.` }, { status: 400 });
      }

      const diff = computeDiff(fromEndpoints, toEndpoints);

      // Don't include unchanged entries' full data to keep response small
      const slimEntries = diff.entries.map(e => {
        if (e.status === 'unchanged') {
          return { method: e.method, path: e.path, category: e.category, status: e.status, summary: e.summary };
        }
        return e;
      });

      return NextResponse.json({ entries: slimEntries, summary: diff.summary });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

function slimEndpoint(ep: EndpointRow): Record<string, unknown> {
  return {
    method: ep.method,
    path: ep.path,
    category: ep.category,
    summary: ep.summary,
    path_params: ep.path_params,
    query_params: ep.query_params,
    body_schema: ep.body_schema ? truncateJson(ep.body_schema, 2000) : null,
    response_schema: ep.response_schema ? truncateJson(ep.response_schema, 2000) : null,
    is_deprecated: ep.is_deprecated,
  };
}

function truncateJson(json: string, maxLen: number): string {
  if (json.length <= maxLen) return json;
  return json.substring(0, maxLen) + '..."truncated"}';
}

function computeDiff(from: EndpointRow[], to: EndpointRow[]) {
  // Key by method + path
  const fromMap = new Map<string, EndpointRow>();
  for (const ep of from) fromMap.set(`${ep.method} ${ep.path}`, ep);

  const toMap = new Map<string, EndpointRow>();
  for (const ep of to) toMap.set(`${ep.method} ${ep.path}`, ep);

  const entries: DiffEntry[] = [];
  const categories = new Set<string>();

  // Check all "to" endpoints
  for (const [key, toEp] of toMap) {
    categories.add(toEp.category);
    const fromEp = fromMap.get(key);
    if (!fromEp) {
      entries.push({
        method: toEp.method, path: toEp.path, category: toEp.category,
        status: 'added', summary: toEp.summary,
        toEndpoint: slimEndpoint(toEp),
      });
    } else {
      const changes = diffEndpoints(fromEp, toEp);
      if (changes.length > 0) {
        entries.push({
          method: toEp.method, path: toEp.path, category: toEp.category,
          status: 'changed', summary: toEp.summary, changes,
          fromEndpoint: slimEndpoint(fromEp), toEndpoint: slimEndpoint(toEp),
        });
      } else {
        entries.push({
          method: toEp.method, path: toEp.path, category: toEp.category,
          status: 'unchanged', summary: toEp.summary,
        });
      }
    }
  }

  // Check for removed endpoints
  for (const [key, fromEp] of fromMap) {
    categories.add(fromEp.category);
    if (!toMap.has(key)) {
      entries.push({
        method: fromEp.method, path: fromEp.path, category: fromEp.category,
        status: 'removed', summary: fromEp.summary, fromEndpoint: slimEndpoint(fromEp),
      });
    }
  }

  // Sort: added first, then changed, removed, unchanged
  const order = { added: 0, changed: 1, removed: 2, unchanged: 3 };
  entries.sort((a, b) => order[a.status] - order[b.status] || a.category.localeCompare(b.category) || a.path.localeCompare(b.path));

  const summary = {
    added: entries.filter(e => e.status === 'added').length,
    removed: entries.filter(e => e.status === 'removed').length,
    changed: entries.filter(e => e.status === 'changed').length,
    unchanged: entries.filter(e => e.status === 'unchanged').length,
    totalFrom: fromMap.size,
    totalTo: toMap.size,
    categories: Array.from(categories).sort(),
  };

  return { entries, summary };
}

function diffEndpoints(from: EndpointRow, to: EndpointRow): string[] {
  const changes: string[] = [];

  // Compare path params
  const fromPathParams = JSON.parse(from.path_params || '[]');
  const toPathParams = JSON.parse(to.path_params || '[]');
  const fromPathNames = new Set(fromPathParams.map((p: { name: string }) => p.name));
  const toPathNames = new Set(toPathParams.map((p: { name: string }) => p.name));
  for (const name of toPathNames) {
    if (!fromPathNames.has(name)) changes.push(`Path param added: ${name}`);
  }
  for (const name of fromPathNames) {
    if (!toPathNames.has(name)) changes.push(`Path param removed: ${name}`);
  }

  // Compare query params
  const fromQueryParams = JSON.parse(from.query_params || '[]');
  const toQueryParams = JSON.parse(to.query_params || '[]');
  const fromQueryMap = new Map(fromQueryParams.map((p: { name: string; required: boolean; type: string }) => [p.name, p]));
  const toQueryMap = new Map(toQueryParams.map((p: { name: string; required: boolean; type: string }) => [p.name, p]));
  for (const [name] of toQueryMap) {
    if (!fromQueryMap.has(name)) changes.push(`Query param added: ${name}`);
  }
  for (const [name] of fromQueryMap) {
    if (!toQueryMap.has(name)) changes.push(`Query param removed: ${name}`);
  }
  // Check for changed required/type on existing params
  for (const [name, toParam] of toQueryMap) {
    const fromParam = fromQueryMap.get(name) as { required: boolean; type: string } | undefined;
    if (fromParam) {
      if (fromParam.required !== (toParam as { required: boolean }).required) {
        changes.push(`Query param "${name}" required: ${fromParam.required} → ${(toParam as { required: boolean }).required}`);
      }
    }
  }

  // Compare body schema
  if (JSON.stringify(from.body_schema) !== JSON.stringify(to.body_schema)) {
    if (!from.body_schema && to.body_schema) changes.push('Request body added');
    else if (from.body_schema && !to.body_schema) changes.push('Request body removed');
    else changes.push('Request body schema changed');
  }

  // Compare response schema
  if (JSON.stringify(from.response_schema) !== JSON.stringify(to.response_schema)) {
    if (!from.response_schema && to.response_schema) changes.push('Response schema added');
    else if (from.response_schema && !to.response_schema) changes.push('Response schema removed');
    else changes.push('Response schema changed');
  }

  // Compare deprecation status
  if (from.is_deprecated !== to.is_deprecated) {
    changes.push(to.is_deprecated ? 'Marked as deprecated' : 'No longer deprecated');
  }

  // Compare summary/description
  if (from.summary !== to.summary) changes.push('Summary changed');
  if (from.description !== to.description) changes.push('Description changed');

  return changes;
}
