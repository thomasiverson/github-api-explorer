import { NextRequest, NextResponse } from 'next/server';
import { createOctokit } from '@/lib/auth';
import { getActiveEnvironment } from '@/lib/db';

// In-memory cache: key = `${envId}:${type}:${parent}` → { data, timestamp }
const cache = new Map<string, { data: Array<{ value: string; label: string }>; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key: string) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: Array<{ value: string; label: string }>) {
  cache.set(key, { data, timestamp: Date.now() });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const org = searchParams.get('org') || '';
  const owner = searchParams.get('owner') || '';
  const repo = searchParams.get('repo') || '';

  if (!type) {
    return NextResponse.json({ error: 'Missing type parameter' }, { status: 400 });
  }

  const env = getActiveEnvironment() as { id: string; enterprise_slug: string; org_name: string } | null;
  if (!env) {
    return NextResponse.json({ error: 'No active environment' }, { status: 400 });
  }

  const cacheKey = `${env.id}:${type}:${org}:${owner}:${repo}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const { octokit } = createOctokit(env.id);
    let results: Array<{ value: string; label: string }> = [];

    switch (type) {
      case 'orgs': {
        const { data } = await octokit.request('GET /user/orgs', { per_page: 100 });
        results = data.map((o: { login: string; description?: string | null }) => ({
          value: o.login,
          label: o.description ? `${o.login} — ${o.description}` : o.login,
        }));
        break;
      }

      case 'repos': {
        const targetOrg = org || owner;
        if (!targetOrg) {
          return NextResponse.json({ error: 'org or owner param required for repos' }, { status: 400 });
        }
        const { data } = await octokit.request('GET /orgs/{org}/repos', {
          org: targetOrg,
          per_page: 100,
          sort: 'updated',
          type: 'all',
        });
        results = data.map((r: { name: string; description?: string | null; private: boolean }) => ({
          value: r.name,
          label: r.description ? `${r.name} — ${r.description}` : r.name,
        }));
        break;
      }

      case 'teams': {
        const targetOrg = org || owner;
        if (!targetOrg) {
          return NextResponse.json({ error: 'org param required for teams' }, { status: 400 });
        }
        const { data } = await octokit.request('GET /orgs/{org}/teams', {
          org: targetOrg,
          per_page: 100,
        });
        results = data.map((t: { slug: string; name: string; description?: string | null }) => ({
          value: t.slug,
          label: t.description ? `${t.name} — ${t.description}` : t.name,
        }));
        break;
      }

      case 'members': {
        const targetOrg = org || owner;
        if (!targetOrg) {
          return NextResponse.json({ error: 'org param required for members' }, { status: 400 });
        }
        const { data } = await octokit.request('GET /orgs/{org}/members', {
          org: targetOrg,
          per_page: 100,
        });
        results = data.map((m: { login: string }) => ({
          value: m.login,
          label: m.login,
        }));
        break;
      }

      case 'branches': {
        const targetOwner = owner || org;
        if (!targetOwner || !repo) {
          return NextResponse.json({ error: 'owner and repo params required for branches' }, { status: 400 });
        }
        const { data } = await octokit.request('GET /repos/{owner}/{repo}/branches', {
          owner: targetOwner,
          repo,
          per_page: 100,
        });
        results = data.map((b: { name: string }) => ({
          value: b.name,
          label: b.name,
        }));
        break;
      }

      case 'enterprises': {
        // Enterprises aren't easily listable via API, but we know the configured one
        if (env.enterprise_slug) {
          results = [{ value: env.enterprise_slug, label: env.enterprise_slug }];
        }
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown discovery type: ${type}` }, { status: 400 });
    }

    setCache(cacheKey, results);
    return NextResponse.json(results);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Discovery failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
