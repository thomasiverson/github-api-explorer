import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createOctokit } from '@/lib/auth';
import {
  collectEnterpriseActionsPolicy,
  collectEnterpriseBudgets,
  collectEnterpriseCopilotSeats,
  collectEnterpriseIdentity,
  collectEnterpriseOrganizations,
  collectEnterpriseSecurityDefaults,
  collectOrganizationRepositories,
  collectOrganizationTeams,
  evaluateAssessmentBaseline,
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
  const actionsCollectorId = uuidv4();
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
      actionsPolicy: actionsResult.value,
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
      actionsCollector: {
        id: actionsCollectorId,
        durationMs: actionsResult.durationMs,
        error: actionsResult.error,
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
      actionsPolicy: actionsResult.value,
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