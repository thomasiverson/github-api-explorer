import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { getCredential, getDb } from './db';

export interface AuthResult {
  octokit: Octokit;
  baseUrl: string;
  authType: string;
}

export function createOctokit(environmentId: string): AuthResult {
  const db = getDb();

  const env = db.prepare('SELECT * FROM environments WHERE id = ?').get(environmentId) as {
    id: string; base_url: string; auth_method: string;
  } | undefined;

  if (!env) {
    throw new Error(`Environment not found: ${environmentId}`);
  }

  const cred = getCredential(environmentId);
  if (!cred) {
    throw new Error(`No credentials configured for environment: ${environmentId}`);
  }

  const baseUrl = env.base_url.replace(/\/+$/, '');

  if (env.auth_method === 'pat') {
    const token = cred.data;
    const octokit = new Octokit({
      auth: token,
      baseUrl,
    });
    return { octokit, baseUrl, authType: 'pat' };
  }

  if (env.auth_method === 'github-app') {
    const appCred = JSON.parse(cred.data) as {
      appId: string; privateKey: string; installationId: string;
    };

    const octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: appCred.appId,
        privateKey: appCred.privateKey,
        installationId: Number(appCred.installationId),
      },
      baseUrl,
    });
    return { octokit, baseUrl, authType: 'github-app' };
  }

  throw new Error(`Unknown auth method: ${env.auth_method}`);
}

export async function validateAuth(environmentId: string): Promise<{
  valid: boolean;
  user?: string;
  error?: string;
  scopes?: string;
}> {
  try {
    const { octokit, authType } = createOctokit(environmentId);

    if (authType === 'pat') {
      const res = await octokit.rest.users.getAuthenticated();
      const scopes = (res.headers as Record<string, string>)['x-oauth-scopes'] || '';
      return { valid: true, user: res.data.login, scopes };
    }

    if (authType === 'github-app') {
      const res = await octokit.rest.apps.getAuthenticated();
      return { valid: true, user: res.data?.name || res.data?.slug || 'GitHub App' };
    }

    return { valid: false, error: 'Unknown auth type' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { valid: false, error: message };
  }
}
