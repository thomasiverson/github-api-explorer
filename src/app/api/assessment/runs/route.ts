import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createOctokit } from '@/lib/auth';
import {
  collectEnterpriseActionsEvidence,
  collectEnterpriseActionsPolicy,
  collectEnterpriseBudgets,
  collectEnterpriseCopilotSeats,
  collectEnterpriseIdentity,
  collectEnterpriseOrganizations,
  collectEnterpriseSecurityDefaults,
  collectOrganizationRepositories,
  collectOrganizationTeams,
  collectRepositoryRules,
  collectRepositorySecurity,
  collectRulesetDetails,
  evaluateAssessmentBaseline,
  type AssessmentRestResponse,
} from '@/lib/assessment';
import {
  completeAssessment,
  createAssessmentRun,
  failAssessmentRun,
  getAssessmentById,
  getEnvironment,
  getLatestAssessment,
} from '@/lib/db';

export async function GET(request: NextRequest) {
  const environmentId = request.nextUrl.searchParams.get('environmentId');
  if (!environmentId) {
    return NextResponse.json({ error: 'environmentId is required' }, { status: 400 });
  }
  if (!getEnvironment(environmentId)) {
    return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
  }
  return NextResponse.json(getLatestAssessment(environmentId));
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 });
  }
  const environmentId = (payload as Record<string, unknown>).environmentId;
  if (typeof environmentId !== 'string' || !environmentId) {
    return NextResponse.json({ error: 'environmentId is required' }, { status: 400 });
  }

  const environment = getEnvironment(environmentId);
  if (!environment) {
    return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
  }
  if (!environment.enterprise_slug) {
    return NextResponse.json({ error: 'The environment requires an enterprise slug' }, { status: 400 });
  }

  const runId = uuidv4();
  const organizationCollectorId = uuidv4();
  const identityCollectorId = uuidv4();
  const repositoryCollectorId = uuidv4();
  const teamCollectorId = uuidv4();
  const securityCollectorId = uuidv4();
  const repositorySecurityCollectorId = uuidv4();
  const repositoryRulesCollectorId = uuidv4();
  const rulesetDetailsCollectorId = uuidv4();
  const actionsCollectorId = uuidv4();
  const actionsDepthCollectorId = uuidv4();
  const copilotCollectorId = uuidv4();
  const billingCollectorId = uuidv4();
  const collectorIds = {
    organizations: organizationCollectorId,
    identity: identityCollectorId,
    repositories: repositoryCollectorId,
    teams: teamCollectorId,
  };
  let activeCollector: keyof typeof collectorIds = 'organizations';
  createAssessmentRun(runId, environmentId);

  try {
    const { octokit } = createOctokit(environmentId);
    const organizationStartedAt = performance.now();
    const organizations = await collectEnterpriseOrganizations(
      (query, variables) => octokit.graphql(query, variables),
      environment.enterprise_slug
    );
    const organizationDurationMs = Math.round(performance.now() - organizationStartedAt);
    activeCollector = 'identity';
    const identityStartedAt = performance.now();
    const identity = await collectEnterpriseIdentity(
      (query, variables) => octokit.graphql(query, variables),
      environment.enterprise_slug
    );
    const identityDurationMs = Math.round(performance.now() - identityStartedAt);
    const organizationLogins = organizations.map(organization => organization.login);
    activeCollector = 'repositories';
    const repositoryStartedAt = performance.now();
    const repositoryResult = await collectOrganizationRepositories(
      (query, variables) => octokit.graphql(query, variables),
      organizationLogins
    );
    const repositoryDurationMs = Math.round(performance.now() - repositoryStartedAt);
    activeCollector = 'teams';
    const teamStartedAt = performance.now();
    const teamResult = await collectOrganizationTeams(
      (query, variables) => octokit.graphql(query, variables),
      organizationLogins
    );
    const teamDurationMs = Math.round(performance.now() - teamStartedAt);
    const repositorySecurityStartedAt = performance.now();
    const repositorySecurityResult = await collectRepositorySecurity({
      getRepository: (owner, repo) => requestWithStatus(() => octokit.request(
        'GET /repos/{owner}/{repo}',
        {
          owner,
          repo,
          headers: { 'X-GitHub-Api-Version': '2026-03-10' },
        }
      )),
      getCodeScanningDefaultSetup: (owner, repo) => requestWithStatus(() => octokit.request(
        'GET /repos/{owner}/{repo}/code-scanning/default-setup',
        {
          owner,
          repo,
          headers: { 'X-GitHub-Api-Version': '2026-03-10' },
        }
      )),
      checkDependabotAlerts: (owner, repo) => requestWithStatus(() => octokit.request(
        'GET /repos/{owner}/{repo}/vulnerability-alerts',
        {
          owner,
          repo,
          headers: { 'X-GitHub-Api-Version': '2026-03-10' },
        }
      )),
      getConfiguration: (owner, repo) => requestWithStatus(() => octokit.request(
        'GET /repos/{owner}/{repo}/code-security-configuration',
        {
          owner,
          repo,
          headers: { 'X-GitHub-Api-Version': '2026-03-10' },
        }
      )),
    }, repositoryResult.items);
    const repositorySecurityDurationMs = Math.round(
      performance.now() - repositorySecurityStartedAt
    );
    const repositoryRulesStartedAt = performance.now();
    const repositoryRulesResult = await collectRepositoryRules({
      getEffectiveRules: (owner, repo, branch, page, perPage) => requestWithStatus(
        () => octokit.request(
          'GET /repos/{owner}/{repo}/rules/branches/{branch}',
          {
            owner,
            repo,
            branch,
            page,
            per_page: perPage,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )
      ),
      getClassicProtection: (owner, repo, branch) => requestWithStatus(
        () => octokit.request(
          'GET /repos/{owner}/{repo}/branches/{branch}/protection',
          {
            owner,
            repo,
            branch,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )
      ),
    }, repositorySecurityResult.items);
    const repositoryRulesDurationMs = Math.round(
      performance.now() - repositoryRulesStartedAt
    );
    const rulesetDetailsStartedAt = performance.now();
    const rulesetDetailsResult = await collectRulesetDetails(async reference => {
      const requestHeaders = { 'X-GitHub-Api-Version': '2026-03-10' };
      if (reference.sourceType === 'Repository') {
        const [owner, repo] = reference.source.split('/');
        if (!owner || !repo) {
          throw new Error(`Invalid repository ruleset source: ${reference.source}`);
        }
        return requestWithStatus(() => octokit.request(
          'GET /repos/{owner}/{repo}/rulesets/{ruleset_id}',
          {
            owner,
            repo,
            ruleset_id: reference.githubId,
            headers: requestHeaders,
          }
        ));
      }
      if (reference.sourceType === 'Organization') {
        return requestWithStatus(() => octokit.request(
          'GET /orgs/{org}/rulesets/{ruleset_id}',
          {
            org: reference.source,
            ruleset_id: reference.githubId,
            headers: requestHeaders,
          }
        ));
      }
      if (reference.sourceType === 'Enterprise') {
        return requestWithStatus(() => octokit.request(
          'GET /enterprises/{enterprise}/rulesets/{ruleset_id}',
          {
            enterprise: reference.source,
            ruleset_id: reference.githubId,
            headers: requestHeaders,
          }
        ));
      }
      throw new Error(`Unsupported ruleset source type: ${reference.sourceType}`);
    }, repositoryRulesResult.items);
    const rulesetDetailsDurationMs = Math.round(
      performance.now() - rulesetDetailsStartedAt
    );
    const securityResult = await collectOptionalEvidence(() => (
      collectEnterpriseSecurityDefaults(async () => (
        await octokit.request(
          'GET /enterprises/{enterprise}/code-security/configurations/defaults',
          {
            enterprise: environment.enterprise_slug,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )
      ).data)
    ));
    const actionsResult = await collectOptionalEvidence(() => (
      collectEnterpriseActionsPolicy(async () => (
        await octokit.request(
          'GET /enterprises/{enterprise}/actions/permissions',
          {
            enterprise: environment.enterprise_slug,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )
      ).data)
    ));
    const actionsDepthResult = await collectOptionalEvidence(() => (
      collectEnterpriseActionsEvidence({
        getSelectedActions: () => requestWithStatus(() => octokit.request(
          'GET /enterprises/{enterprise}/actions/permissions/selected-actions',
          {
            enterprise: environment.enterprise_slug,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )),
        getWorkflowPermissions: () => requestWithStatus(() => octokit.request(
          'GET /enterprises/{enterprise}/actions/permissions/workflow',
          {
            enterprise: environment.enterprise_slug,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )),
        getForkPullRequestPolicy: () => requestWithStatus(() => octokit.request(
          'GET /enterprises/{enterprise}/actions/permissions/fork-pr-workflows-private-repos',
          {
            enterprise: environment.enterprise_slug,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )),
        getSelfHostedRunnerPolicy: () => requestWithStatus(() => octokit.request(
          'GET /enterprises/{enterprise}/actions/permissions/self-hosted-runners',
          {
            enterprise: environment.enterprise_slug,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )),
        getRunnerGroups: (page, perPage) => requestWithStatus(() => octokit.request(
          'GET /enterprises/{enterprise}/actions/runner-groups',
          {
            enterprise: environment.enterprise_slug,
            page,
            per_page: perPage,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )),
        getRunners: (page, perPage) => requestWithStatus(() => octokit.request(
          'GET /enterprises/{enterprise}/actions/runners',
          {
            enterprise: environment.enterprise_slug,
            page,
            per_page: perPage,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )),
      }, actionsResult.value?.allowedActions ?? null)
    ));
    const copilotResult = await collectOptionalEvidence(() => (
      collectEnterpriseCopilotSeats(async (page, perPage) => (
        await octokit.request(
          'GET /enterprises/{enterprise}/copilot/billing/seats',
          {
            enterprise: environment.enterprise_slug,
            page,
            per_page: perPage,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )
      ).data)
    ));
    const billingResult = await collectOptionalEvidence(() => (
      collectEnterpriseBudgets(async (page, perPage) => (
        await octokit.request(
          'GET /enterprises/{enterprise}/settings/billing/budgets',
          {
            enterprise: environment.enterprise_slug,
            page,
            per_page: perPage,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )
      ).data)
    ));
    const evaluation = evaluateAssessmentBaseline({
      organizations,
      members: identity.members,
      ownerCount: identity.ownerLogins.length,
      repositories: repositoryResult.items,
      teams: teamResult.items,
      securityDefaults: securityResult.value,
      repositorySecurity: repositorySecurityResult.items,
      repositoryRules: repositoryRulesResult.items,
      rulesets: rulesetDetailsResult.items,
      actionsPolicy: actionsResult.value,
      actionsEvidence: actionsDepthResult.value,
      copilotSeats: copilotResult.value,
      budgets: billingResult.value,
    });
    const durationMs = Math.round(performance.now() - startedAt);
    completeAssessment({
      runId,
      durationMs,
      organizationCollector: { id: organizationCollectorId, durationMs: organizationDurationMs },
      identityCollector: { id: identityCollectorId, durationMs: identityDurationMs },
      repositoryCollector: { id: repositoryCollectorId, durationMs: repositoryDurationMs },
      teamCollector: { id: teamCollectorId, durationMs: teamDurationMs },
      organizations,
      members: identity.members,
      ownerCount: identity.ownerLogins.length,
      repositories: repositoryResult.items,
      repositoryFailures: repositoryResult.failures,
      teams: teamResult.items,
      teamFailures: teamResult.failures,
      securityCollector: {
        id: securityCollectorId,
        durationMs: securityResult.durationMs,
        error: securityResult.error,
      },
      repositorySecurityCollector: {
        id: repositorySecurityCollectorId,
        durationMs: repositorySecurityDurationMs,
      },
      repositoryRulesCollector: {
        id: repositoryRulesCollectorId,
        durationMs: repositoryRulesDurationMs,
      },
      rulesetDetailsCollector: {
        id: rulesetDetailsCollectorId,
        durationMs: rulesetDetailsDurationMs,
      },
      actionsCollector: {
        id: actionsCollectorId,
        durationMs: actionsResult.durationMs,
        error: actionsResult.error,
      },
      actionsDepthCollector: {
        id: actionsDepthCollectorId,
        durationMs: actionsDepthResult.durationMs,
        error: actionsDepthResult.error,
      },
      copilotCollector: {
        id: copilotCollectorId,
        durationMs: copilotResult.durationMs,
        error: copilotResult.error,
      },
      billingCollector: {
        id: billingCollectorId,
        durationMs: billingResult.durationMs,
        error: billingResult.error,
      },
      securityDefaults: securityResult.value,
      repositorySecurity: repositorySecurityResult.items,
      repositorySecurityFailures: repositorySecurityResult.failures,
      repositoryRules: repositoryRulesResult.items,
      repositoryRulesFailures: repositoryRulesResult.failures,
      rulesets: rulesetDetailsResult.items,
      rulesetDetailFailures: rulesetDetailsResult.failures,
      actionsPolicy: actionsResult.value,
      actionsEvidence: actionsDepthResult.value,
      copilotSeats: copilotResult.value,
      budgets: billingResult.value,
      evaluation,
    });
    return NextResponse.json(getAssessmentById(runId), { status: 201 });
  } catch (error: unknown) {
    const durationMs = Math.round(performance.now() - startedAt);
    const message = error instanceof Error ? error.message : 'Organization collection failed';
    failAssessmentRun({
      runId,
      collectorResultId: collectorIds[activeCollector],
      durationMs,
      error: message,
      collectorKey: activeCollector,
    });
    const status = readUpstreamStatus(error);
    return NextResponse.json(getAssessmentById(runId), { status });
  }
}

function readUpstreamStatus(error: unknown): number {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number' && status >= 400 && status < 600) return status;
  }
  return 502;
}

async function collectOptionalEvidence<T>(
  collector: () => Promise<T>
): Promise<{ value: T | null; error: string | null; durationMs: number }> {
  const startedAt = performance.now();
  try {
    return {
      value: await collector(),
      error: null,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch (error: unknown) {
    return {
      value: null,
      error: error instanceof Error ? error.message : 'Collector failed',
      durationMs: Math.round(performance.now() - startedAt),
    };
  }
}

async function requestWithStatus(
  request: () => Promise<{ status: number; data: unknown }>
): Promise<AssessmentRestResponse> {
  try {
    const response = await request();
    return { status: response.status, data: response.data };
  } catch (error) {
    if (!error || typeof error !== 'object' || Array.isArray(error)) throw error;
    const record = error as Record<string, unknown>;
    if (typeof record.status !== 'number') throw error;
    const response = record.response;
    const data = response && typeof response === 'object' && !Array.isArray(response)
      ? (response as Record<string, unknown>).data
      : undefined;
    return {
      status: record.status,
      data: data ?? {
        message: typeof record.message === 'string' ? record.message : 'GitHub request failed',
      },
    };
  }
}