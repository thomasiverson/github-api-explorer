import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createOctokit } from '@/lib/auth';
import {
  ASSESSMENT_COLLECTOR_KEYS,
  collectEnterpriseActionsEvidenceProgressively,
  collectEnterpriseActionsPolicy,
  collectBillingGovernanceProgressively,
  collectCopilotGovernanceProgressively,
  collectEnterpriseBudgetsProgressively,
  collectEnterpriseCopilotSeatsProgressively,
  collectEnterpriseIdentityProgressively,
  collectEnterpriseOrganizations,
  collectEnterpriseScimProgressively,
  collectEnterpriseSecurityDefaults,
  collectOrganizationAccess,
  collectOrganizationRepositories,
  collectOrganizationTeams,
  collectRepositoryAccess,
  collectRepositoryRules,
  collectRepositorySecurity,
  collectRulesetDetailPlanItems,
  createAssessmentActionsProgress,
  createAssessmentBillingProgress,
  createAssessmentBudgetProgress,
  createAssessmentCopilotGovernanceProgress,
  createAssessmentCopilotSeatProgress,
  createAssessmentIdentityProgress,
  createAssessmentRulesetDetailPlan,
  createAssessmentScimProgress,
  evaluateAssessmentBaseline,
  type AssessmentCollectorKey,
  type AssessmentOrganizationAccessCollection,
  type AssessmentRepository,
  type AssessmentRepositoryAccessCollection,
  type AssessmentRepositoryRulesCollection,
  type AssessmentRepositorySecurity,
  type AssessmentRepositorySecurityCollection,
  type AssessmentResourceCollection,
  type AssessmentRestResponse,
  type AssessmentTeam,
} from '@/lib/assessment';
import {
  AssessmentRequestGovernor,
  calculateAssessmentRateLimitReserve,
  isFatalAssessmentRequestError,
  type AssessmentApiUsage,
  type AssessmentRateLimitBucket,
  type AssessmentUsageUpdateReason,
} from '@/lib/assessment-request-governor';
import {
  AssessmentCheckpointLeaseError,
  createAssessmentBatchCheckpointRunner,
  createAssessmentCheckpointRunner,
  createAssessmentProgressCheckpointRunner,
} from '@/lib/assessment-checkpoint';
import {
  ASSESSMENT_PACING_INTERVAL_MS,
  estimateAssessmentReadiness,
  isAssessmentPacingProfile,
  type AssessmentPacingProfile,
} from '@/lib/assessment-readiness';
import { AssessmentRunControlError } from '@/lib/assessment-run-control';
import {
  acquireAssessmentRunLease,
  assertAssessmentRunExecution,
  beginAssessmentCollector,
  cancelAssessmentRun,
  clearPreviousAssessmentRuns,
  completeAssessment,
  createAssessmentRun,
  deleteAssessmentRun,
  failAssessmentRun,
  getActiveAssessmentRun,
  getAssessmentById,
  getAssessmentCheckpoints,
  getEnvironment,
  getLatestAssessment,
  listAssessmentRuns,
  pruneAssessmentRuns,
  markAssessmentRunPaused,
  requestAssessmentRunCancellation,
  requestAssessmentRunPause,
  releaseAssessmentRunLease,
  renewAssessmentRunLease,
  saveAssessmentCheckpoint,
  setAssessmentRunProtection,
  updateAssessmentApiUsage,
} from '@/lib/db';

const ORGANIZATION_CHECKPOINT_BATCH_SIZE = 10;
const REPOSITORY_CHECKPOINT_BATCH_SIZE = 25;
const RULESET_CHECKPOINT_BATCH_SIZE = 25;

export async function GET(request: NextRequest) {
  const environmentId = request.nextUrl.searchParams.get('environmentId')?.trim();
  const runId = request.nextUrl.searchParams.get('runId')?.trim();
  const history = request.nextUrl.searchParams.get('history');
  const active = request.nextUrl.searchParams.get('active');
  const preflight = request.nextUrl.searchParams.get('preflight');
  if (!environmentId) {
    return NextResponse.json({ error: 'environmentId is required' }, { status: 400 });
  }
  if (
    (runId ? 1 : 0)
    + (history !== null ? 1 : 0)
    + (active !== null ? 1 : 0)
    + (preflight !== null ? 1 : 0)
    > 1
  ) {
    return NextResponse.json(
      { error: 'runId, history, active, and preflight cannot be combined' },
      { status: 400 }
    );
  }
  if (history !== null && history !== 'true') {
    return NextResponse.json({ error: 'history must be true' }, { status: 400 });
  }
  if (active !== null && active !== 'true') {
    return NextResponse.json({ error: 'active must be true' }, { status: 400 });
  }
  if (preflight !== null && preflight !== 'true') {
    return NextResponse.json({ error: 'preflight must be true' }, { status: 400 });
  }
  if (!getEnvironment(environmentId)) {
    return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
  }

  if (runId) {
    const snapshot = getAssessmentById(runId);
    if (!snapshot || snapshot.environmentId !== environmentId) {
      return NextResponse.json({ error: 'Assessment run not found' }, { status: 404 });
    }
    return NextResponse.json(snapshot);
  }

  if (active === 'true') {
    return NextResponse.json(getActiveAssessmentRun(environmentId));
  }

  if (preflight === 'true') {
    try {
      const latest = getLatestAssessment(environmentId);
      const { octokit } = createOctokit(environmentId);
      const response = await octokit.request('GET /rate_limit', {
        headers: { 'X-GitHub-Api-Version': '2026-03-10' },
      });
      const resources = readObject(response.data)?.resources;
      if (!resources || typeof resources !== 'object' || Array.isArray(resources)) {
        throw new Error('GitHub returned an invalid rate-limit response');
      }
      const rateLimitResources = resources as Record<string, unknown>;
      const restRateLimit = readRateLimitBucket(rateLimitResources.core, 'core');
      if (!restRateLimit) {
        throw new Error('GitHub did not return the core REST rate limit');
      }
      return NextResponse.json(estimateAssessmentReadiness({
        sourceRunId: latest?.id ?? null,
        previousUsage: latest?.apiUsage ?? null,
        previousDurationMs: latest?.durationMs ?? null,
        inventoryMetrics: latest?.metrics ?? null,
        restRateLimit,
        graphqlRateLimit: readRateLimitBucket(rateLimitResources.graphql, 'graphql'),
      }));
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Unable to estimate assessment readiness';
      return NextResponse.json({ error: message }, { status: readUpstreamStatus(error) });
    }
  }

  if (history === 'true') {
    const rawLimit = request.nextUrl.searchParams.get('limit');
    const limit = rawLimit === null ? 20 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return NextResponse.json(
        { error: 'limit must be an integer from 1 to 50' },
        { status: 400 }
      );
    }
    return NextResponse.json(listAssessmentRuns(environmentId, limit));
  }

  return NextResponse.json(getLatestAssessment(environmentId));
}

export async function PATCH(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 });
  }

  const { environmentId, runId, protected: isProtected } = payload as Record<string, unknown>;
  if (typeof environmentId !== 'string' || !environmentId.trim()) {
    return NextResponse.json({ error: 'environmentId is required' }, { status: 400 });
  }
  if (typeof runId !== 'string' || !runId.trim()) {
    return NextResponse.json({ error: 'runId is required' }, { status: 400 });
  }
  if (typeof isProtected !== 'boolean') {
    return NextResponse.json({ error: 'protected must be a boolean' }, { status: 400 });
  }
  if (!getEnvironment(environmentId)) {
    return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
  }
  if (!setAssessmentRunProtection(environmentId, runId, isProtected)) {
    return NextResponse.json(
      { error: 'Completed assessment run not found' },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true, protected: isProtected });
}

export async function DELETE(request: NextRequest) {
  const environmentId = request.nextUrl.searchParams.get('environmentId')?.trim();
  const runId = request.nextUrl.searchParams.get('runId')?.trim();
  const clearPrevious = request.nextUrl.searchParams.get('clearPrevious');
  if (!environmentId) {
    return NextResponse.json({ error: 'environmentId is required' }, { status: 400 });
  }
  if ((runId ? 1 : 0) + (clearPrevious === 'true' ? 1 : 0) !== 1) {
    return NextResponse.json(
      { error: 'Provide either runId or clearPrevious=true' },
      { status: 400 }
    );
  }
  if (clearPrevious !== null && clearPrevious !== 'true') {
    return NextResponse.json({ error: 'clearPrevious must be true' }, { status: 400 });
  }
  if (!getEnvironment(environmentId)) {
    return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
  }

  if (clearPrevious === 'true') {
    const deletedCount = clearPreviousAssessmentRuns(environmentId);
    return NextResponse.json({ success: true, deletedCount });
  }

  if (!runId) {
    return NextResponse.json({ error: 'runId is required' }, { status: 400 });
  }
  const result = deleteAssessmentRun(environmentId, runId);
  if (result === 'not_found') {
    return NextResponse.json({ error: 'Assessment run not found' }, { status: 404 });
  }
  if (result === 'protected') {
    return NextResponse.json(
      { error: 'Protected assessment runs must be unprotected before deletion' },
      { status: 409 }
    );
  }
  return NextResponse.json({ success: true });
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
  const payloadRecord = payload as Record<string, unknown>;
  const environmentId = payloadRecord.environmentId;
  const action = payloadRecord.action ?? 'start';
  const requestedRunId = payloadRecord.runId;
  const requestedPacingProfile = payloadRecord.pacingProfile;
  if (typeof environmentId !== 'string' || !environmentId) {
    return NextResponse.json({ error: 'environmentId is required' }, { status: 400 });
  }
  if (
    action !== 'start'
    && action !== 'resume'
    && action !== 'pause'
    && action !== 'cancel'
  ) {
    return NextResponse.json(
      { error: 'action must be start, resume, pause, or cancel' },
      { status: 400 }
    );
  }
  if (
    action !== 'start'
    && (typeof requestedRunId !== 'string' || !requestedRunId.trim())
  ) {
    return NextResponse.json(
      { error: `runId is required when action is ${action}` },
      { status: 400 }
    );
  }
  if (action === 'start' && requestedRunId !== undefined) {
    return NextResponse.json(
      { error: 'runId is only supported when action is resume, pause, or cancel' },
      { status: 400 }
    );
  }
  if (
    requestedPacingProfile !== undefined
    && !isAssessmentPacingProfile(requestedPacingProfile)
  ) {
    return NextResponse.json(
      { error: 'pacingProfile must be immediate, measured, overnight, or extended' },
      { status: 400 }
    );
  }
  if (
    (action === 'pause' || action === 'cancel')
    && requestedPacingProfile !== undefined
  ) {
    return NextResponse.json(
      { error: `pacingProfile is not supported when action is ${action}` },
      { status: 400 }
    );
  }

  const environment = getEnvironment(environmentId);
  if (!environment) {
    return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
  }
  const normalizedRunId = typeof requestedRunId === 'string'
    ? requestedRunId.trim()
    : '';
  if (action === 'pause') {
    const result = requestAssessmentRunPause(environmentId, normalizedRunId);
    if (result === 'not_found') {
      return NextResponse.json({ error: 'The active assessment run was not found' }, { status: 404 });
    }
    if (result === 'conflict') {
      return NextResponse.json({
        error: 'The assessment cannot be paused during its current transition',
        activeRun: getActiveAssessmentRun(environmentId),
      }, { status: 409 });
    }
    return NextResponse.json({
      success: true,
      state: result,
      activeRun: getActiveAssessmentRun(environmentId),
    }, { status: result === 'requested' ? 202 : 200 });
  }
  if (action === 'cancel') {
    const result = requestAssessmentRunCancellation(environmentId, normalizedRunId);
    if (result === 'not_found') {
      return NextResponse.json({ error: 'The active assessment run was not found' }, { status: 404 });
    }
    if (result === 'conflict') {
      return NextResponse.json({
        error: 'Assessment cancellation is already in progress',
        activeRun: getActiveAssessmentRun(environmentId),
      }, { status: 409 });
    }
    return NextResponse.json({
      success: true,
      state: result,
      activeRun: getActiveAssessmentRun(environmentId),
    }, { status: result === 'requested' ? 202 : 200 });
  }
  if (!environment.enterprise_slug) {
    return NextResponse.json({ error: 'The environment requires an enterprise slug' }, { status: 400 });
  }

  const runId = action === 'resume' ? normalizedRunId : uuidv4();
  const pacingProfile = requestedPacingProfile as AssessmentPacingProfile | undefined;
  const leaseOwner = uuidv4();
  const organizationCollectorId = uuidv4();
  const identityCollectorId = uuidv4();
  const organizationAccessCollectorId = uuidv4();
  const repositoryCollectorId = uuidv4();
  const repositoryAccessCollectorId = uuidv4();
  const teamCollectorId = uuidv4();
  const securityCollectorId = uuidv4();
  const repositorySecurityCollectorId = uuidv4();
  const repositoryRulesCollectorId = uuidv4();
  const rulesetDetailsCollectorId = uuidv4();
  const actionsCollectorId = uuidv4();
  const actionsDepthCollectorId = uuidv4();
  const copilotCollectorId = uuidv4();
  const copilotDepthCollectorId = uuidv4();
  const billingCollectorId = uuidv4();
  const billingDepthCollectorId = uuidv4();
  const scimCollectorId = uuidv4();
  const collectorIds = {
    organizations: organizationCollectorId,
    identity: identityCollectorId,
    organizationAccess: organizationAccessCollectorId,
    repositories: repositoryCollectorId,
    repositoryAccess: repositoryAccessCollectorId,
    teams: teamCollectorId,
    security: securityCollectorId,
    repositorySecurity: repositorySecurityCollectorId,
    repositoryRules: repositoryRulesCollectorId,
    rulesetDetails: rulesetDetailsCollectorId,
    actions: actionsCollectorId,
    actionsDepth: actionsDepthCollectorId,
    copilot: copilotCollectorId,
    copilotDepth: copilotDepthCollectorId,
    billing: billingCollectorId,
    billingDepth: billingDepthCollectorId,
    scim: scimCollectorId,
  } satisfies Record<AssessmentCollectorKey, string>;
  let activeCollector: AssessmentCollectorKey = 'organizations';
  const existingActiveRun = getActiveAssessmentRun(environmentId);
  const executionAcquired = action === 'resume'
    ? existingActiveRun?.id === runId
      && existingActiveRun.resumable
      && acquireAssessmentRunLease(runId, environmentId, leaseOwner, pacingProfile)
    : createAssessmentRun(
        runId,
        environmentId,
        leaseOwner,
        pacingProfile ?? 'immediate'
      );
  if (!executionAcquired) {
    return NextResponse.json({
      error: action === 'resume'
        ? existingActiveRun?.id === runId
          ? 'The assessment is still active and cannot be resumed yet'
          : 'The interrupted assessment run was not found'
        : 'An assessment is already running for this environment',
      activeRun: getActiveAssessmentRun(environmentId),
    }, { status: action === 'resume' && existingActiveRun?.id !== runId ? 404 : 409 });
  }

  const initialUsage = action === 'resume' ? existingActiveRun?.apiUsage : undefined;
  const heartbeatInterval = setInterval(() => {
    renewAssessmentRunLease(runId, leaseOwner);
  }, 10_000);
  let requestGovernor: AssessmentRequestGovernor | null = null;
  let lastPersistedRequestCount = initialUsage
    ? initialUsage.restRequests + initialUsage.graphqlRequests
    : 0;
  let lastPersistedAt = 0;
  const persistApiUsage = (
    usage: AssessmentApiUsage,
    reason: AssessmentUsageUpdateReason | 'complete'
  ) => {
    const requestCount = usage.restRequests + usage.graphqlRequests;
    const now = Date.now();
    if (
      reason === 'request'
      && requestCount !== 1
      && requestCount - lastPersistedRequestCount < 10
      && now - lastPersistedAt < 2_000
    ) {
      return;
    }
    updateAssessmentApiUsage(runId, usage);
    lastPersistedRequestCount = requestCount;
    lastPersistedAt = now;
  };
  try {
    const checkpoints = getAssessmentCheckpoints(runId);
    const { octokit } = createOctokit(environmentId);
    requestGovernor = new AssessmentRequestGovernor({
      initialUsage,
      minimumRequestIntervalMs: ASSESSMENT_PACING_INTERVAL_MS[
        action === 'resume'
          ? pacingProfile ?? existingActiveRun?.pacingProfile ?? 'immediate'
          : pacingProfile ?? 'immediate'
      ],
      beforeRequest: () => assertAssessmentRunExecution(runId, leaseOwner),
      onUpdate: persistApiUsage,
    });
    octokit.hook.wrap('request', (githubRequest, options) => requestGovernor!.execute(
      isGraphqlRequest(options.url) ? 'graphql' : 'rest',
      async () => githubRequest(options)
    ));
    const graphqlRequest = (query: string, variables: Record<string, unknown>) => (
      requestGovernor!.executeGraphql(() => octokit.graphql(query, variables))
    );
    const checkpointOptions = {
      checkpoints,
      begin: (collectorKey: AssessmentCollectorKey) => {
        assertAssessmentRunExecution(runId, leaseOwner);
        activeCollector = collectorKey;
        return beginAssessmentCollector(runId, leaseOwner, collectorKey);
      },
      save: (
        collectorKey: AssessmentCollectorKey,
        output: unknown,
        durationMs: number,
        cursor: number,
        totalItems: number,
        completed: boolean
      ) => {
        const saved = saveAssessmentCheckpoint(
          runId,
          leaseOwner,
          { collectorKey, output, durationMs, cursor, totalItems, completed }
        );
        if (saved) assertAssessmentRunExecution(runId, leaseOwner);
        return saved;
      },
    };
    const collectCheckpointed = createAssessmentCheckpointRunner(checkpointOptions);
    const collectBatched = createAssessmentBatchCheckpointRunner(checkpointOptions);
    const collectProgressively = createAssessmentProgressCheckpointRunner(checkpointOptions);
    const organizationCheckpoint = await collectCheckpointed(
      'organizations',
      () => collectEnterpriseOrganizations(graphqlRequest, environment.enterprise_slug)
    );
    const organizations = organizationCheckpoint.value;
    const organizationDurationMs = organizationCheckpoint.durationMs;
    const identityCheckpoint = await collectProgressively({
      collectorKey: 'identity',
      initialState: createAssessmentIdentityProgress(),
      collect: (state, saveProgress) => collectEnterpriseIdentityProgressively(
        graphqlRequest,
        environment.enterprise_slug,
        state,
        saveProgress
      ),
    });
    const identity = identityCheckpoint.value;
    const identityDurationMs = identityCheckpoint.durationMs;
    const organizationLogins = organizations.map(organization => organization.login);
    const repositoryCheckpoint = await collectBatched<
      string,
      AssessmentResourceCollection<AssessmentRepository>
    >({
      collectorKey: 'repositories',
      items: organizationLogins,
      batchSize: ORGANIZATION_CHECKPOINT_BATCH_SIZE,
      initialValue: { items: [], failures: [] },
      collectBatch: logins => collectOrganizationRepositories(graphqlRequest, logins),
      merge: mergeAssessmentCollection,
    });
    const repositoryResult = repositoryCheckpoint.value;
    const repositoryDurationMs = repositoryCheckpoint.durationMs;
    const organizationAccessCheckpoint = await collectBatched<
      string,
      AssessmentOrganizationAccessCollection
    >({
      collectorKey: 'organizationAccess',
      items: organizationLogins,
      batchSize: ORGANIZATION_CHECKPOINT_BATCH_SIZE,
      initialValue: { items: [], failures: [] },
      collectBatch: logins => collectOrganizationAccess({
      getOrganization: organizationLogin => requestWithStatus(() => octokit.request(
        'GET /orgs/{org}',
        {
          org: organizationLogin,
          headers: { 'X-GitHub-Api-Version': '2026-03-10' },
        }
      )),
      getAdministrators: (organizationLogin, page, perPage) => requestWithStatus(
        () => octokit.request(
          'GET /orgs/{org}/members',
          {
            org: organizationLogin,
            role: 'admin',
            page,
            per_page: perPage,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )
      ),
      getOutsideCollaborators: (organizationLogin, page, perPage) => requestWithStatus(
        () => octokit.request(
          'GET /orgs/{org}/outside_collaborators',
          {
            org: organizationLogin,
            page,
            per_page: perPage,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )
      ),
      }, logins),
      merge: mergeAssessmentCollection,
    });
    const organizationAccessResult = organizationAccessCheckpoint.value;
    const organizationAccessDurationMs = organizationAccessCheckpoint.durationMs;
    const repositoryAccessCheckpoint = await collectBatched<
      AssessmentRepository,
      AssessmentRepositoryAccessCollection
    >({
      collectorKey: 'repositoryAccess',
      items: repositoryResult.items,
      batchSize: REPOSITORY_CHECKPOINT_BATCH_SIZE,
      initialValue: { items: [], failures: [] },
      collectBatch: repositories => collectRepositoryAccess({
      getDirectCollaborators: (owner, repo, page, perPage) => requestWithStatus(
        () => octokit.request(
          'GET /repos/{owner}/{repo}/collaborators',
          {
            owner,
            repo,
            affiliation: 'direct',
            page,
            per_page: perPage,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )
      ),
      getTeamGrants: (owner, repo, page, perPage) => requestWithStatus(
        () => octokit.request(
          'GET /repos/{owner}/{repo}/teams',
          {
            owner,
            repo,
            page,
            per_page: perPage,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )
      ),
      }, repositories),
      merge: mergeAssessmentCollection,
    });
    const repositoryAccessResult = repositoryAccessCheckpoint.value;
    const repositoryAccessDurationMs = repositoryAccessCheckpoint.durationMs;
    const teamCheckpoint = await collectBatched<
      string,
      AssessmentResourceCollection<AssessmentTeam>
    >({
      collectorKey: 'teams',
      items: organizationLogins,
      batchSize: ORGANIZATION_CHECKPOINT_BATCH_SIZE,
      initialValue: { items: [], failures: [] },
      collectBatch: logins => collectOrganizationTeams(graphqlRequest, logins),
      merge: mergeAssessmentCollection,
    });
    const teamResult = teamCheckpoint.value;
    const teamDurationMs = teamCheckpoint.durationMs;
    const repositorySecurityCheckpoint = await collectBatched<
      AssessmentRepository,
      AssessmentRepositorySecurityCollection
    >({
      collectorKey: 'repositorySecurity',
      items: repositoryResult.items,
      batchSize: REPOSITORY_CHECKPOINT_BATCH_SIZE,
      initialValue: { items: [], failures: [] },
      collectBatch: repositories => collectRepositorySecurity({
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
      }, repositories),
      merge: mergeAssessmentCollection,
    });
    const repositorySecurityResult = repositorySecurityCheckpoint.value;
    const repositorySecurityDurationMs = repositorySecurityCheckpoint.durationMs;
    const repositoryRulesCheckpoint = await collectBatched<
      AssessmentRepositorySecurity,
      AssessmentRepositoryRulesCollection
    >({
      collectorKey: 'repositoryRules',
      items: repositorySecurityResult.items,
      batchSize: REPOSITORY_CHECKPOINT_BATCH_SIZE,
      initialValue: { items: [], failures: [] },
      collectBatch: repositories => collectRepositoryRules({
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
      }, repositories),
      merge: mergeAssessmentCollection,
    });
    const repositoryRulesResult = repositoryRulesCheckpoint.value;
    const repositoryRulesDurationMs = repositoryRulesCheckpoint.durationMs;
    const rulesetDetailPlan = createAssessmentRulesetDetailPlan(repositoryRulesResult.items);
    const rulesetDetailsCheckpoint = await collectBatched({
      collectorKey: 'rulesetDetails',
      items: rulesetDetailPlan.items,
      batchSize: RULESET_CHECKPOINT_BATCH_SIZE,
      initialValue: {
        items: [],
        failures: rulesetDetailPlan.failures,
      },
      collectBatch: references => collectRulesetDetailPlanItems(async reference => {
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
      }, references),
      merge: (current, batch) => ({
        items: [...current.items, ...batch.items].sort(
          (left, right) => left.name.localeCompare(right.name)
        ),
        failures: [...current.failures, ...batch.failures],
      }),
    });
    const rulesetDetailsResult = rulesetDetailsCheckpoint.value;
    const rulesetDetailsDurationMs = rulesetDetailsCheckpoint.durationMs;
    const securityCheckpoint = await collectCheckpointed(
      'security',
      () => collectOptionalEvidence(() => (
        collectEnterpriseSecurityDefaults(async () => (
        await octokit.request(
          'GET /enterprises/{enterprise}/code-security/configurations/defaults',
          {
            enterprise: environment.enterprise_slug,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )
        ).data)
      ))
    );
    const securityResult = securityCheckpoint.value;
    const actionsCheckpoint = await collectCheckpointed(
      'actions',
      () => collectOptionalEvidence(() => (
        collectEnterpriseActionsPolicy(async () => (
        await octokit.request(
          'GET /enterprises/{enterprise}/actions/permissions',
          {
            enterprise: environment.enterprise_slug,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )
        ).data)
      ))
    );
    const actionsResult = actionsCheckpoint.value;
    const actionsDepthCheckpoint = await collectProgressively({
      collectorKey: 'actionsDepth',
      initialState: createAssessmentActionsProgress(actionsResult.value?.allowedActions ?? null),
      collect: (state, saveProgress) => collectOptionalEvidence(() => (
        collectEnterpriseActionsEvidenceProgressively({
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
        }, state, saveProgress)
      )),
    });
    const actionsDepthResult = actionsDepthCheckpoint.value;
    const copilotCheckpoint = await collectProgressively({
      collectorKey: 'copilot',
      initialState: createAssessmentCopilotSeatProgress(),
      collect: (state, saveProgress) => collectOptionalEvidence(() => (
        collectEnterpriseCopilotSeatsProgressively(async (page, perPage) => (
        await octokit.request(
          'GET /enterprises/{enterprise}/copilot/billing/seats',
          {
            enterprise: environment.enterprise_slug,
            page,
            per_page: perPage,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )
        ).data, state, saveProgress)
      )),
    });
    const copilotResult = copilotCheckpoint.value;
    const copilotDepthCheckpoint = await collectProgressively({
      collectorKey: 'copilotDepth',
      initialState: createAssessmentCopilotGovernanceProgress(),
      collect: (state, saveProgress) => collectOptionalEvidence(() => (
        collectCopilotGovernanceProgressively({
        getContentExclusion: () => requestWithStatus(() => octokit.request(
          'GET /enterprises/{enterprise}/copilot/content_exclusion',
          {
            enterprise: environment.enterprise_slug,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )),
        getOrganizationSettings: organizationLogin => requestWithStatus(
          () => octokit.request(
            'GET /orgs/{org}/copilot/billing',
            {
              org: organizationLogin,
              headers: { 'X-GitHub-Api-Version': '2026-03-10' },
            }
          )
        ),
        getCodingAgentPermissions: organizationLogin => requestWithStatus(
          () => octokit.request(
            'GET /orgs/{org}/copilot/coding-agent/permissions',
            {
              org: organizationLogin,
              headers: { 'X-GitHub-Api-Version': '2026-03-10' },
            }
          )
        ),
        }, organizationLogins, state, saveProgress)
      )),
    });
    const copilotDepthResult = copilotDepthCheckpoint.value;
    const billingCheckpoint = await collectProgressively({
      collectorKey: 'billing',
      initialState: createAssessmentBudgetProgress(),
      collect: (state, saveProgress) => collectOptionalEvidence(() => (
        collectEnterpriseBudgetsProgressively(async (page, perPage) => (
        await octokit.request(
          'GET /enterprises/{enterprise}/settings/billing/budgets',
          {
            enterprise: environment.enterprise_slug,
            page,
            per_page: perPage,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )
        ).data, state, saveProgress)
      )),
    });
    const billingResult = billingCheckpoint.value;
    const humanMemberLogins = identity.members
      .map(member => member.login)
      .filter(login => login.toLowerCase() !== `${environment.enterprise_slug}_admin`.toLowerCase());
    const billingDepthCheckpoint = await collectProgressively({
      collectorKey: 'billingDepth',
      initialState: createAssessmentBillingProgress(),
      collect: (state, saveProgress) => collectOptionalEvidence(() => (
        collectBillingGovernanceProgressively({
        getCostCenters: () => requestWithStatus(() => octokit.request(
          'GET /enterprises/{enterprise}/settings/billing/cost-centers',
          {
            enterprise: environment.enterprise_slug,
            state: 'active',
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )),
        getCostCenter: (costCenterId, page, perPage) => requestWithStatus(
          () => octokit.request(
            'GET /enterprises/{enterprise}/settings/billing/cost-centers/{cost_center_id}',
            {
              enterprise: environment.enterprise_slug,
              cost_center_id: costCenterId,
              page,
              per_page: perPage,
              headers: { 'X-GitHub-Api-Version': '2026-03-10' },
            }
          )
        ),
        getEffectiveBudget: (user, page, perPage) => requestWithStatus(
          () => octokit.request(
            'GET /enterprises/{enterprise}/settings/billing/budgets',
            {
              enterprise: environment.enterprise_slug,
              user,
              page,
              per_page: perPage,
              headers: { 'X-GitHub-Api-Version': '2026-03-10' },
            }
          )
        ),
        getBudgetUserStates: (budgetId, page, perPage) => requestWithStatus(
          () => octokit.request(
            'GET /enterprises/{enterprise}/settings/billing/budgets/{budget_id}/user-states',
            {
              enterprise: environment.enterprise_slug,
              budget_id: budgetId,
              page,
              per_page: perPage,
              headers: { 'X-GitHub-Api-Version': '2026-03-10' },
            }
          )
        ),
        getUsageSummary: () => requestWithStatus(() => octokit.request(
          'GET /enterprises/{enterprise}/settings/billing/usage/summary',
          {
            enterprise: environment.enterprise_slug,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
        )),
        }, billingResult.value ?? [], humanMemberLogins, state, saveProgress)
      )),
    });
    const billingDepthResult = billingDepthCheckpoint.value;
    const scimCheckpoint = await collectProgressively({
      collectorKey: 'scim',
      initialState: createAssessmentScimProgress(),
      collect: (state, saveProgress) => collectOptionalEvidence(() => (
        collectEnterpriseScimProgressively((startIndex, count) => requestWithStatus(
        () => octokit.request(
          'GET /scim/v2/enterprises/{enterprise}/Users',
          {
            enterprise: environment.enterprise_slug,
            startIndex,
            count,
            headers: { 'X-GitHub-Api-Version': '2026-03-10' },
          }
          )
        ), state, saveProgress)
      )),
    });
    const scimResult = scimCheckpoint.value;
    const evaluation = evaluateAssessmentBaseline({
      organizations,
      members: identity.members,
      ownerCount: identity.ownerLogins.length,
      repositories: repositoryResult.items,
      teams: teamResult.items,
      organizationAccess: organizationAccessResult.items,
      repositoryAccess: repositoryAccessResult.items,
      scim: scimResult.value,
      setupAccountLogin: `${environment.enterprise_slug}_admin`,
      securityDefaults: securityResult.value,
      repositorySecurity: repositorySecurityResult.items,
      repositoryRules: repositoryRulesResult.items,
      rulesets: rulesetDetailsResult.items,
      actionsPolicy: actionsResult.value,
      actionsEvidence: actionsDepthResult.value,
      copilotSeats: copilotResult.value,
      copilotEvidence: copilotDepthResult.value,
      budgets: billingResult.value,
      billingEvidence: billingDepthResult.value,
    });
    const completedCollectorDurations = [
      organizationDurationMs,
      identityDurationMs,
      repositoryDurationMs,
      organizationAccessDurationMs,
      repositoryAccessDurationMs,
      teamDurationMs,
      repositorySecurityDurationMs,
      repositoryRulesDurationMs,
      rulesetDetailsDurationMs,
      securityCheckpoint.durationMs,
      actionsCheckpoint.durationMs,
      actionsDepthCheckpoint.durationMs,
      copilotCheckpoint.durationMs,
      copilotDepthCheckpoint.durationMs,
      billingCheckpoint.durationMs,
      billingDepthCheckpoint.durationMs,
      scimCheckpoint.durationMs,
    ];
    if (completedCollectorDurations.length !== ASSESSMENT_COLLECTOR_KEYS.length) {
      throw new Error('Assessment collector duration accounting is incomplete');
    }
    const durationMs = completedCollectorDurations.reduce(
      (total, collectorDurationMs) => total + collectorDurationMs,
      0
    );
    persistApiUsage(requestGovernor.snapshot(), 'complete');
    completeAssessment({
      runId,
      durationMs,
      organizationCollector: { id: organizationCollectorId, durationMs: organizationDurationMs },
      identityCollector: { id: identityCollectorId, durationMs: identityDurationMs },
      organizationAccessCollector: {
        id: organizationAccessCollectorId,
        durationMs: organizationAccessDurationMs,
      },
      repositoryCollector: { id: repositoryCollectorId, durationMs: repositoryDurationMs },
      repositoryAccessCollector: {
        id: repositoryAccessCollectorId,
        durationMs: repositoryAccessDurationMs,
      },
      teamCollector: { id: teamCollectorId, durationMs: teamDurationMs },
      organizations,
      members: identity.members,
      ownerCount: identity.ownerLogins.length,
      repositories: repositoryResult.items,
      repositoryFailures: repositoryResult.failures,
      teams: teamResult.items,
      teamFailures: teamResult.failures,
      organizationAccess: organizationAccessResult.items,
      organizationAccessFailures: organizationAccessResult.failures,
      repositoryAccess: repositoryAccessResult.items,
      repositoryAccessFailures: repositoryAccessResult.failures,
      scim: scimResult.value,
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
      copilotDepthCollector: {
        id: copilotDepthCollectorId,
        durationMs: copilotDepthResult.durationMs,
        error: copilotDepthResult.error,
      },
      billingCollector: {
        id: billingCollectorId,
        durationMs: billingResult.durationMs,
        error: billingResult.error,
      },
      billingDepthCollector: {
        id: billingDepthCollectorId,
        durationMs: billingDepthResult.durationMs,
        error: billingDepthResult.error,
      },
      scimCollector: {
        id: scimCollectorId,
        durationMs: scimResult.durationMs,
        error: scimResult.error,
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
      copilotEvidence: copilotDepthResult.value,
      budgets: billingResult.value,
      billingEvidence: billingDepthResult.value,
      evaluation,
    });
    pruneAssessmentRuns(environmentId);
    return NextResponse.json(getAssessmentById(runId), { status: 201 });
  } catch (error: unknown) {
    const durationMs = Math.round(performance.now() - startedAt);
    if (requestGovernor) {
      persistApiUsage(requestGovernor.snapshot(), 'complete');
    }
    const message = error instanceof Error ? error.message : 'Organization collection failed';
    if (error instanceof AssessmentRunControlError) {
      if (error.reason === 'pause') {
        markAssessmentRunPaused(runId, leaseOwner);
        return NextResponse.json({
          success: true,
          state: 'paused',
          activeRun: getActiveAssessmentRun(environmentId),
        }, { status: 202 });
      }
      cancelAssessmentRun(runId);
      return NextResponse.json({
        success: true,
        state: 'cancelled',
        runId,
      });
    }
    if (error instanceof AssessmentCheckpointLeaseError) {
      return NextResponse.json({
        error: message,
        activeRun: getActiveAssessmentRun(environmentId),
      }, { status: 409 });
    }
    failAssessmentRun({
      runId,
      collectorResultId: collectorIds[activeCollector],
      durationMs,
      error: message,
      collectorKey: activeCollector,
    });
    pruneAssessmentRuns(environmentId);
    const status = readUpstreamStatus(error);
    return NextResponse.json(getAssessmentById(runId), { status });
  } finally {
    clearInterval(heartbeatInterval);
    releaseAssessmentRunLease(runId, leaseOwner);
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
    if (isFatalAssessmentRequestError(error)) throw error;
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
    if (isFatalAssessmentRequestError(error)) throw error;
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

function isGraphqlRequest(url: string): boolean {
  return /\/graphql(?:\?|$)/.test(url);
}

function readRateLimitBucket(
  value: unknown,
  resource: string
): AssessmentRateLimitBucket | null {
  const record = readObject(value);
  if (!record) return null;
  const limit = readNonNegativeInteger(record.limit);
  const remaining = readNonNegativeInteger(record.remaining);
  const reset = readNonNegativeInteger(record.reset);
  if (limit === null || remaining === null || reset === null) return null;
  return {
    resource,
    limit,
    remaining,
    used: readNonNegativeInteger(record.used) ?? Math.max(0, limit - remaining),
    reset,
    reserve: calculateAssessmentRateLimitReserve(limit),
  };
}

function readObject(value: unknown): Record<string, unknown> | null {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function mergeAssessmentCollection<Item, Failure>(
  current: { items: Item[]; failures: Failure[] },
  batch: { items: Item[]; failures: Failure[] }
): { items: Item[]; failures: Failure[] } {
  return {
    items: [...current.items, ...batch.items],
    failures: [...current.failures, ...batch.failures],
  };
}