import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('persists and reloads repository security and Actions evidence', async () => {
  const originalWorkingDirectory = process.cwd();
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'github-api-explorer-assessment-'));
  let closeDatabase: (() => void) | null = null;

  try {
    process.chdir(temporaryDirectory);
    const {
      completeAssessment,
      createAssessmentRun,
      getAssessmentById,
      getDb,
    } = await import('../src/lib/db');
    const db = getDb();
    closeDatabase = () => db.close();
    db.prepare(`
      INSERT INTO environments (id, name, base_url, enterprise_slug, auth_method, is_active)
      VALUES ('environment-1', 'Test', 'https://api.github.com', 'acme', 'pat', 1)
    `).run();
    createAssessmentRun('run-1', 'environment-1');

    completeAssessment({
      runId: 'run-1',
      durationMs: 100,
      organizationCollector: { id: 'collector-organizations', durationMs: 1 },
      identityCollector: { id: 'collector-identity', durationMs: 1 },
      repositoryCollector: { id: 'collector-repositories', durationMs: 1 },
      teamCollector: { id: 'collector-teams', durationMs: 1 },
      securityCollector: { id: 'collector-security', durationMs: 1, error: null },
      repositorySecurityCollector: { id: 'collector-repository-security', durationMs: 1 },
      repositoryRulesCollector: { id: 'collector-repository-rules', durationMs: 1 },
      rulesetDetailsCollector: { id: 'collector-ruleset-details', durationMs: 1 },
      actionsCollector: { id: 'collector-actions', durationMs: 1, error: null },
      actionsDepthCollector: { id: 'collector-actions-depth', durationMs: 1, error: null },
      copilotCollector: { id: 'collector-copilot', durationMs: 1, error: null },
      billingCollector: { id: 'collector-billing', durationMs: 1, error: null },
      organizations: [],
      members: [],
      ownerCount: 0,
      repositories: [],
      repositoryFailures: [],
      teams: [],
      teamFailures: [],
      securityDefaults: [],
      repositorySecurity: [{
        nameWithOwner: 'acme/repository',
        visibility: 'PRIVATE',
        isArchived: false,
        isFork: false,
        defaultBranch: 'main',
        codeSecurity: 'enabled',
        codeScanningDefaultSetup: 'configured',
        secretScanning: 'enabled',
        secretScanningPushProtection: 'enabled',
        dependabotAlerts: 'enabled',
        dependabotSecurityUpdates: 'enabled',
        configurationStatus: 'enforced',
        configurationId: 17,
        configurationName: 'Enterprise baseline',
        configurationEnforcement: 'enforced',
      }],
      repositorySecurityFailures: [],
      repositoryRules: [{
        nameWithOwner: 'acme/repository',
        visibility: 'PRIVATE',
        isArchived: false,
        isFork: false,
        defaultBranch: 'main',
        branchExists: true,
        classicProtection: false,
        hasProtection: true,
        activeRulesetIds: [23],
        activeRulesetSources: ['Organization: acme'],
        activeRulesets: [{ githubId: 23, sourceType: 'Organization', source: 'acme' }],
        ruleTypes: ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks'],
        requiresPullRequest: true,
        requiredApprovingReviewCount: 2,
        requiresStatusChecks: true,
        blocksForcePushes: true,
        blocksDeletions: true,
        enforcesAdmins: null,
      }],
      repositoryRulesFailures: [{
        nameWithOwner: 'acme/repository',
        check: 'classic-protection',
        error: 'Classic protection returned HTTP 403',
      }],
      rulesets: [{
        githubId: 23,
        name: 'Default branch baseline',
        target: 'branch',
        sourceType: 'Organization',
        source: 'acme',
        enforcement: 'active',
        conditions: [{
          type: 'ref_name',
          include: ['~DEFAULT_BRANCH'],
          exclude: [],
        }],
        ruleTypes: ['pull_request', 'required_status_checks'],
        appliedRepositories: ['acme/repository'],
        bypassActors: [
          { actorId: null, actorType: 'OrganizationAdmin', bypassMode: 'always' },
          { actorId: 42, actorType: 'Team', bypassMode: 'pull_request' },
        ],
      }],
      rulesetDetailFailures: [{
        githubId: 99,
        sourceType: 'Repository',
        source: 'acme/partial',
        error: 'Ruleset detail returned HTTP 403',
      }],
      actionsPolicy: null,
      actionsEvidence: {
        selectedActions: null,
        workflowPermissions: {
          defaultWorkflowPermissions: 'read',
          canApprovePullRequestReviews: false,
        },
        forkPullRequestPolicy: {
          runWorkflowsFromForkPullRequests: false,
          sendWriteTokensToWorkflows: false,
          sendSecretsAndVariables: false,
          requireApprovalForForkPullRequestWorkflows: false,
        },
        selfHostedRunnerPolicy: {
          disabledForAllOrganizations: false,
        },
        runnerGroups: [{
          githubId: 1,
          name: 'Default',
          visibility: 'all',
          isDefault: true,
          allowsPublicRepositories: false,
          restrictedToWorkflows: false,
          selectedWorkflows: [],
        }],
        runners: [{
          githubId: 101,
          runnerGroupId: 1,
          name: 'runner-1',
          os: 'linux',
          status: 'online',
          busy: false,
          ephemeral: false,
          version: '2.329.0',
          labels: ['self-hosted', 'linux'],
        }],
        failures: [{
          check: 'selected-actions',
          error: 'Selected Actions policy returned HTTP 403',
        }],
      },
      copilotSeats: null,
      budgets: null,
      evaluation: {
        healthScore: 100,
        assessedDomainCount: 3,
        findings: [],
        metrics: {
          codeScanningDefaultSetupRepositories: 1,
          eligibleSecurityRepositories: 1,
          runnerGroupCount: 1,
          selfHostedRunnerCount: 1,
        },
      },
    });

    const snapshot = getAssessmentById('run-1');
    assert.ok(snapshot);
    assert.deepEqual(snapshot.repositorySecurity, [{
      nameWithOwner: 'acme/repository',
      visibility: 'PRIVATE',
      isArchived: false,
      isFork: false,
      defaultBranch: 'main',
      codeSecurity: 'enabled',
      codeScanningDefaultSetup: 'configured',
      secretScanning: 'enabled',
      secretScanningPushProtection: 'enabled',
      dependabotAlerts: 'enabled',
      dependabotSecurityUpdates: 'enabled',
      configurationStatus: 'enforced',
      configurationId: 17,
      configurationName: 'Enterprise baseline',
      configurationEnforcement: 'enforced',
    }]);
    assert.deepEqual(snapshot.repositoryRules, [{
      nameWithOwner: 'acme/repository',
      visibility: 'PRIVATE',
      isArchived: false,
      isFork: false,
      defaultBranch: 'main',
      branchExists: true,
      classicProtection: false,
      hasProtection: true,
      activeRulesetIds: [23],
      activeRulesetSources: ['Organization: acme'],
      activeRulesets: [{ githubId: 23, sourceType: 'Organization', source: 'acme' }],
      ruleTypes: ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks'],
      requiresPullRequest: true,
      requiredApprovingReviewCount: 2,
      requiresStatusChecks: true,
      blocksForcePushes: true,
      blocksDeletions: true,
      enforcesAdmins: null,
    }]);
    assert.deepEqual(snapshot.rulesets, [{
      githubId: 23,
      name: 'Default branch baseline',
      target: 'branch',
      sourceType: 'Organization',
      source: 'acme',
      enforcement: 'active',
      conditions: [{
        type: 'ref_name',
        include: ['~DEFAULT_BRANCH'],
        exclude: [],
      }],
      ruleTypes: ['pull_request', 'required_status_checks'],
      appliedRepositories: ['acme/repository'],
      bypassActors: [
        { actorId: null, actorType: 'OrganizationAdmin', bypassMode: 'always' },
        { actorId: 42, actorType: 'Team', bypassMode: 'pull_request' },
      ],
    }]);
    assert.equal(snapshot.metrics.codeScanningDefaultSetupRepositories, 1);
    assert.deepEqual(snapshot.actionsEvidence, {
      selectedActions: null,
      workflowPermissions: {
        defaultWorkflowPermissions: 'read',
        canApprovePullRequestReviews: false,
      },
      forkPullRequestPolicy: {
        runWorkflowsFromForkPullRequests: false,
        sendWriteTokensToWorkflows: false,
        sendSecretsAndVariables: false,
        requireApprovalForForkPullRequestWorkflows: false,
      },
      selfHostedRunnerPolicy: {
        disabledForAllOrganizations: false,
      },
      runnerGroups: [{
        githubId: 1,
        name: 'Default',
        visibility: 'all',
        isDefault: true,
        allowsPublicRepositories: false,
        restrictedToWorkflows: false,
        selectedWorkflows: [],
      }],
      runners: [{
        githubId: 101,
        runnerGroupId: 1,
        name: 'runner-1',
        os: 'linux',
        status: 'online',
        busy: false,
        ephemeral: false,
        version: '2.329.0',
        labels: ['self-hosted', 'linux'],
      }],
      failures: [{
        check: 'selected-actions',
        error: 'Selected Actions policy returned HTTP 403',
      }],
    });
    assert.deepEqual(snapshot.collectors.find(
      collector => collector.collector_key === 'repositorySecurity'
    ), {
      collector_key: 'repositorySecurity',
      status: 'completed',
      item_count: 1,
      duration_ms: 1,
      error: null,
    });
    assert.deepEqual(snapshot.collectors.find(
      collector => collector.collector_key === 'actionsDepth'
    ), {
      collector_key: 'actionsDepth',
      status: 'partial',
      item_count: 5,
      duration_ms: 1,
      error: 'selected-actions: Selected Actions policy returned HTTP 403',
    });
    assert.deepEqual(snapshot.collectors.find(
      collector => collector.collector_key === 'repositoryRules'
    ), {
      collector_key: 'repositoryRules',
      status: 'partial',
      item_count: 1,
      duration_ms: 1,
      error: 'acme/repository [classic-protection]: Classic protection returned HTTP 403',
    });
    assert.deepEqual(snapshot.collectors.find(
      collector => collector.collector_key === 'rulesetDetails'
    ), {
      collector_key: 'rulesetDetails',
      status: 'partial',
      item_count: 1,
      duration_ms: 1,
      error: 'Repository acme/partial [99]: Ruleset detail returned HTTP 403',
    });
  } finally {
    closeDatabase?.();
    process.chdir(originalWorkingDirectory);
    await rm(temporaryDirectory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});
