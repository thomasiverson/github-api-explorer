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
      organizationAccessCollector: { id: 'collector-organization-access', durationMs: 1 },
      repositoryCollector: { id: 'collector-repositories', durationMs: 1 },
      repositoryAccessCollector: { id: 'collector-repository-access', durationMs: 1 },
      teamCollector: { id: 'collector-teams', durationMs: 1 },
      securityCollector: { id: 'collector-security', durationMs: 1, error: null },
      repositorySecurityCollector: { id: 'collector-repository-security', durationMs: 1 },
      repositoryRulesCollector: { id: 'collector-repository-rules', durationMs: 1 },
      rulesetDetailsCollector: { id: 'collector-ruleset-details', durationMs: 1 },
      actionsCollector: { id: 'collector-actions', durationMs: 1, error: null },
      actionsDepthCollector: { id: 'collector-actions-depth', durationMs: 1, error: null },
      copilotCollector: { id: 'collector-copilot', durationMs: 1, error: null },
      copilotDepthCollector: { id: 'collector-copilot-depth', durationMs: 1, error: null },
      billingCollector: { id: 'collector-billing', durationMs: 1, error: null },
      billingDepthCollector: { id: 'collector-billing-depth', durationMs: 1, error: null },
      scimCollector: { id: 'collector-scim', durationMs: 1, error: null },
      organizations: [],
      members: [],
      ownerCount: 0,
      repositories: [],
      repositoryFailures: [],
      teams: [],
      teamFailures: [],
      organizationAccess: [{
        organizationLogin: 'acme',
        defaultRepositoryPermission: 'read',
        membersCanCreateRepositories: true,
        membersCanCreatePublicRepositories: false,
        membersCanCreatePrivateRepositories: true,
        membersCanCreateInternalRepositories: true,
        membersCanForkPrivateRepositories: false,
        twoFactorRequirementEnabled: false,
        adminLogins: ['owner-one'],
        outsideCollaboratorLogins: [],
      }],
      organizationAccessFailures: [{
        organizationLogin: 'acme',
        check: 'outside-collaborators',
        error: 'Outside collaborators returned HTTP 403',
      }],
      repositoryAccess: [{
        nameWithOwner: 'acme/repository',
        visibility: 'PRIVATE',
        isArchived: false,
        isFork: false,
        directCollaborators: [{
          login: 'developer-one',
          roleName: 'write',
          permission: 'write',
        }],
        teamGrants: [{
          slug: 'platform',
          name: 'Platform',
          permission: 'push',
        }],
      }],
      repositoryAccessFailures: [{
        nameWithOwner: 'acme/repository',
        check: 'team-grants',
        error: 'Team grants returned HTTP 403',
      }],
      scim: {
        totalResults: 1,
        identities: [{
          scimId: 'scim-1',
          userName: 'developer@example.com',
          displayName: 'Developer One',
          active: true,
          roles: ['user'],
        }],
      },
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
      copilotSeats: {
        totalSeats: 1,
        rawAssignmentCount: 1,
        seats: [{
          login: 'developer-one',
          planType: 'enterprise',
          createdAt: '2026-01-01T00:00:00Z',
          lastAuthenticatedAt: '2026-09-01T00:00:00Z',
          lastActivityAt: '2026-09-09T00:00:00Z',
          lastActivityEditor: 'vscode',
          pendingCancellationDate: null,
          assignmentCount: 1,
          assignmentSources: [{
            organization: 'acme',
            team: 'platform',
            teamType: 'organization',
          }],
        }],
      },
      copilotEvidence: {
        contentExclusionRuleCount: 2,
        organizations: [{
          organizationLogin: 'acme',
          seatTotal: 1,
          seatsAddedThisCycle: 0,
          seatsPendingCancellation: 0,
          seatsPendingInvitation: 0,
          activeSeatsThisCycle: 1,
          inactiveSeatsThisCycle: 0,
          planType: 'enterprise',
          seatManagementSetting: 'assign_selected',
          publicCodeSuggestions: 'block',
          ideChat: 'enabled',
          platformChat: 'enabled',
          cli: 'disabled',
          codingAgentRepositoryScope: 'selected',
        }],
        failures: [{
          scope: 'acme',
          check: 'coding-agent',
          error: 'Coding agent returned HTTP 403',
        }],
      },
      budgets: [{
        id: 'budget-1',
        budgetType: 'ProductPricing',
        productSku: 'ai_credits',
        scope: 'enterprise',
        amount: 1000,
        consumedAmount: 25,
        preventsFurtherUsage: true,
        alertingEnabled: true,
        alertRecipientCount: 1,
        alertRecipients: ['owner-one'],
        entityName: 'acme',
        user: null,
        expiresAt: null,
      }],
      billingEvidence: {
        costCenters: [{
          id: 'center-1',
          name: 'Engineering',
          state: 'active',
          azureSubscription: null,
          aiCreditPoolEnabled: false,
          aiCreditPoolTargetAmount: null,
          aiCreditPoolCurrentAmount: null,
          resources: [{ type: 'User', name: 'developer-one' }],
        }],
        effectiveBudgets: [{
          user: 'developer-one',
          budgetId: 'budget-1',
          amount: 1000,
          consumedAmount: 25,
          applicableBudgetIds: ['budget-1'],
        }],
        multiUserBudgetStates: [{
          budgetId: 'budget-1',
          user: 'developer-one',
          consumedAmount: 25,
          targetAmount: 1000,
          overrideBudgetId: null,
        }],
        usage: {
          year: 2026,
          month: 9,
          day: null,
          items: [{
            product: 'Copilot',
            sku: 'copilot_ai_unit',
            unitType: 'ai-units',
            grossQuantity: 3,
            grossAmount: 3,
            discountQuantity: 1,
            discountAmount: 1,
            netQuantity: 2,
            netAmount: 2,
          }],
        },
        failures: [{
          scope: 'Research',
          check: 'cost-center-resources',
          error: 'Cost center returned HTTP 403',
        }],
      },
      evaluation: {
        healthScore: 100,
        assessedDomainCount: 3,
        findings: [],
        metrics: {
          codeScanningDefaultSetupRepositories: 1,
          eligibleSecurityRepositories: 1,
          runnerGroupCount: 1,
          selfHostedRunnerCount: 1,
          copilotSeats: 1,
          budgets: 1,
        },
      },
    });

    const snapshot = getAssessmentById('run-1');
    assert.ok(snapshot);
    assert.deepEqual(snapshot.organizationAccess, [{
      organizationLogin: 'acme',
      defaultRepositoryPermission: 'read',
      membersCanCreateRepositories: true,
      membersCanCreatePublicRepositories: false,
      membersCanCreatePrivateRepositories: true,
      membersCanCreateInternalRepositories: true,
      membersCanForkPrivateRepositories: false,
      twoFactorRequirementEnabled: false,
      adminLogins: ['owner-one'],
      outsideCollaboratorLogins: [],
    }]);
    assert.deepEqual(snapshot.repositoryAccess, [{
      nameWithOwner: 'acme/repository',
      visibility: 'PRIVATE',
      isArchived: false,
      isFork: false,
      directCollaborators: [{
        login: 'developer-one',
        roleName: 'write',
        permission: 'write',
      }],
      teamGrants: [{
        slug: 'platform',
        name: 'Platform',
        permission: 'push',
      }],
    }]);
    assert.deepEqual(snapshot.scim, {
      totalResults: 1,
      identities: [{
        scimId: 'scim-1',
        userName: 'developer@example.com',
        displayName: 'Developer One',
        active: true,
        roles: ['user'],
      }],
    });
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
    assert.deepEqual(snapshot.copilotSeats, {
      totalSeats: 1,
      rawAssignmentCount: 1,
      seats: [{
        login: 'developer-one',
        planType: 'enterprise',
        createdAt: '2026-01-01T00:00:00Z',
        lastAuthenticatedAt: '2026-09-01T00:00:00Z',
        lastActivityAt: '2026-09-09T00:00:00Z',
        lastActivityEditor: 'vscode',
        pendingCancellationDate: null,
        assignmentCount: 1,
        assignmentSources: [{
          organization: 'acme',
          team: 'platform',
          teamType: 'organization',
        }],
      }],
    });
    assert.equal(snapshot.copilotEvidence?.contentExclusionRuleCount, 2);
    assert.equal(snapshot.copilotEvidence?.organizations[0].codingAgentRepositoryScope, 'selected');
    assert.deepEqual(snapshot.copilotEvidence?.failures, [{
      scope: 'acme',
      check: 'coding-agent',
      error: 'Coding agent returned HTTP 403',
    }]);
    assert.deepEqual(snapshot.budgets?.[0].alertRecipients, ['owner-one']);
    assert.deepEqual(snapshot.billingEvidence?.costCenters[0].resources, [{
      type: 'User',
      name: 'developer-one',
    }]);
    assert.equal(snapshot.billingEvidence?.effectiveBudgets[0].budgetId, 'budget-1');
    assert.equal(snapshot.billingEvidence?.multiUserBudgetStates[0].targetAmount, 1000);
    assert.equal(snapshot.billingEvidence?.usage?.items[0].netAmount, 2);
    assert.deepEqual(snapshot.billingEvidence?.failures, [{
      scope: 'Research',
      check: 'cost-center-resources',
      error: 'Cost center returned HTTP 403',
    }]);
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
      collector => collector.collector_key === 'copilotDepth'
    ), {
      collector_key: 'copilotDepth',
      status: 'partial',
      item_count: 3,
      duration_ms: 1,
      error: 'acme [coding-agent]: Coding agent returned HTTP 403',
    });
    assert.deepEqual(snapshot.collectors.find(
      collector => collector.collector_key === 'billingDepth'
    ), {
      collector_key: 'billingDepth',
      status: 'partial',
      item_count: 4,
      duration_ms: 1,
      error: 'Research [cost-center-resources]: Cost center returned HTTP 403',
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
