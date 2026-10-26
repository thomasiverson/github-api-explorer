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
      acquireAssessmentRunLease,
      assertAssessmentRunExecution,
      beginAssessmentCollector,
      cancelAssessmentRun,
      completeAssessment,
      createAssessmentRun,
      clearPreviousAssessmentRuns,
      deleteAssessmentRun,
      getActiveAssessmentRun,
      getAssessmentById,
      getAssessmentCheckpoints,
      getDb,
      listAssessmentRuns,
      pruneAssessmentRuns,
      markAssessmentRunPaused,
      requestAssessmentRunCancellation,
      requestAssessmentRunPause,
      renewAssessmentRunLease,
      saveAssessmentCheckpoint,
      setAssessmentRunProtection,
      updateAssessmentApiUsage,
    } = await import('../src/lib/db');
    const {
      getAssessmentFindingRemediation,
    } = await import('../src/lib/assessment');
    const db = getDb();
    const persistedRemediation = getAssessmentFindingRemediation(
      'repository-security-configuration-unassigned'
    );
    closeDatabase = () => db.close();
    db.prepare(`
      INSERT INTO environments (id, name, base_url, enterprise_slug, auth_method, is_active)
      VALUES ('environment-1', 'Test', 'https://api.github.com', 'acme', 'pat', 1)
    `).run();
    assert.equal(
      createAssessmentRun('run-1', 'environment-1', 'lease-1', 'measured'),
      true
    );
    assert.equal(createAssessmentRun('run-overlap', 'environment-1'), false);
    updateAssessmentApiUsage('run-1', {
      restRequests: 47,
      graphqlRequests: 6,
      retryCount: 2,
      throttleCount: 1,
      throttleWaitMs: 2_000,
      pacingWaitCount: 2,
      pacingWaitMs: 3_000,
      lastRequestAt: '2026-09-11T20:00:00.000Z',
      rateLimits: {
        core: {
          resource: 'core',
          limit: 5000,
          remaining: 4953,
          used: 47,
          reset: 1789164000,
          reserve: 500,
        },
      },
    });
    assert.equal(beginAssessmentCollector('run-1', 'lease-1', 'organizations'), true);
    assert.equal(saveAssessmentCheckpoint('run-1', 'lease-1', {
      collectorKey: 'organizations',
      output: [{ login: 'acme' }],
      durationMs: 25,
    }), true);
    assert.equal(renewAssessmentRunLease('run-1', 'lease-1'), true);
    assert.equal(
      acquireAssessmentRunLease('run-1', 'environment-1', 'lease-2'),
      false
    );
    const initiallyActive = getActiveAssessmentRun('environment-1');
    assert.deepEqual(initiallyActive, {
      id: 'run-1',
      environmentId: 'environment-1',
      status: 'running',
      startedAt: initiallyActive?.startedAt,
      apiUsage: {
        restRequests: 47,
        graphqlRequests: 6,
        retryCount: 2,
        throttleCount: 1,
        throttleWaitMs: 2_000,
        pacingWaitCount: 2,
        pacingWaitMs: 3_000,
        lastRequestAt: '2026-09-11T20:00:00.000Z',
        rateLimits: {
          core: {
            resource: 'core',
            limit: 5000,
            remaining: 4953,
            used: 47,
            reset: 1789164000,
            reserve: 500,
          },
        },
      },
      currentCollector: 'organizations',
      completedCollectorCount: 1,
      currentCheckpoint: null,
      lastHeartbeatAt: initiallyActive?.lastHeartbeatAt,
      resumeCount: 0,
      pacingProfile: 'measured',
      controlState: 'running',
      resumable: false,
    });
    assert.deepEqual(getAssessmentCheckpoints('run-1'), {
      organizations: {
        collectorKey: 'organizations',
        output: [{ login: 'acme' }],
        durationMs: 25,
        cursor: 0,
        totalItems: 0,
        completed: true,
        completedAt: getAssessmentCheckpoints('run-1').organizations.completedAt,
      },
    });
    assert.equal(requestAssessmentRunPause('environment-1', 'run-1'), 'requested');
    assert.throws(
      () => assertAssessmentRunExecution('run-1', 'lease-1'),
      /pause requested/i
    );
    assert.equal(markAssessmentRunPaused('run-1', 'lease-1'), true);
    assert.equal(getActiveAssessmentRun('environment-1')?.controlState, 'paused');
    assert.equal(getActiveAssessmentRun('environment-1')?.resumable, true);
    assert.equal(
      acquireAssessmentRunLease('run-1', 'environment-1', 'lease-2', 'overnight'),
      true
    );
    assert.equal(getActiveAssessmentRun('environment-1')?.resumeCount, 1);
    assert.equal(getActiveAssessmentRun('environment-1')?.pacingProfile, 'overnight');
    assert.equal(getActiveAssessmentRun('environment-1')?.controlState, 'running');
    assert.equal(beginAssessmentCollector('run-1', 'lease-2', 'repositories'), true);
    assert.equal(saveAssessmentCheckpoint('run-1', 'lease-2', {
      collectorKey: 'repositories',
      output: { items: [{ nameWithOwner: 'acme/one' }], failures: [] },
      durationMs: 50,
      cursor: 25,
      totalItems: 100,
      completed: false,
    }), true);
    assert.deepEqual(getAssessmentCheckpoints('run-1').repositories, {
      collectorKey: 'repositories',
      output: { items: [{ nameWithOwner: 'acme/one' }], failures: [] },
      durationMs: 50,
      cursor: 25,
      totalItems: 100,
      completed: false,
      completedAt: getAssessmentCheckpoints('run-1').repositories.completedAt,
    });
    assert.equal(getActiveAssessmentRun('environment-1')?.completedCollectorCount, 1);
    assert.deepEqual(getActiveAssessmentRun('environment-1')?.currentCheckpoint, {
      processedItems: 25,
      totalItems: 100,
    });

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
        healthScore: 98,
        assessedDomainCount: 3,
        domainScores: {
          identity: 100,
          repositories: 100,
          security: 95,
        },
        findings: [{
          ruleKey: 'repository-security-configuration-unassigned',
          domain: 'security',
          severity: 'low',
          title: 'Persisted evidence finding',
          summary: 'Observed state persisted with the assessment.',
          recommendation: 'Review the persisted evidence.',
          affectedResources: ['acme/repository'],
          expectedState: 'Expected state persisted with the assessment.',
          evidenceSources: [{
            collectorKey: 'repositorySecurity',
            label: 'Persisted evidence source',
            endpoint: 'REST GET /repos/{owner}/{repo}',
          }],
          remediation: persistedRemediation,
        }],
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
    assert.equal(getActiveAssessmentRun('environment-1'), null);
    assert.deepEqual(getAssessmentCheckpoints('run-1'), {});
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM assessment_run_state').get() as { count: number }).count,
      0
    );
    assert.deepEqual(snapshot.apiUsage, {
      restRequests: 47,
      graphqlRequests: 6,
      retryCount: 2,
      throttleCount: 1,
      throttleWaitMs: 2_000,
      pacingWaitCount: 2,
      pacingWaitMs: 3_000,
      lastRequestAt: '2026-09-11T20:00:00.000Z',
      rateLimits: {
        core: {
          resource: 'core',
          limit: 5000,
          remaining: 4953,
          used: 47,
          reset: 1789164000,
          reserve: 500,
        },
      },
    });
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
    assert.deepEqual(snapshot.domainScores, {
      identity: 100,
      repositories: 100,
      security: 95,
    });
    assert.deepEqual(snapshot.findings, [{
      ruleKey: 'repository-security-configuration-unassigned',
      domain: 'security',
      severity: 'low',
      title: 'Persisted evidence finding',
      summary: 'Observed state persisted with the assessment.',
      recommendation: 'Review the persisted evidence.',
      affectedResources: ['acme/repository'],
      expectedState: 'Expected state persisted with the assessment.',
      evidenceSources: [{
        collectorKey: 'repositorySecurity',
        label: 'Persisted evidence source',
        endpoint: 'REST GET /repos/{owner}/{repo}',
      }],
      remediation: persistedRemediation,
    }]);
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

    assert.equal(
      createAssessmentRun('run-cancel', 'environment-1', 'cancel-lease'),
      true
    );
    assert.equal(saveAssessmentCheckpoint('run-cancel', 'cancel-lease', {
      collectorKey: 'organizations',
      output: [{ login: 'partial' }],
      durationMs: 5,
      cursor: 1,
      totalItems: 2,
      completed: false,
    }), true);
    assert.equal(
      requestAssessmentRunCancellation('environment-1', 'run-cancel'),
      'requested'
    );
    assert.throws(
      () => assertAssessmentRunExecution('run-cancel', 'cancel-lease'),
      /cancellation requested/i
    );
    assert.equal(cancelAssessmentRun('run-cancel'), true);
    assert.equal(getActiveAssessmentRun('environment-1'), null);
    assert.deepEqual(
      db.prepare('SELECT COUNT(*) AS count FROM assessment_checkpoints WHERE run_id = ?')
        .get('run-cancel') as { count: number },
      { count: 0 }
    );

    assert.equal(createAssessmentRun('run-cancel-idle', 'environment-1'), true);
    assert.equal(
      requestAssessmentRunCancellation('environment-1', 'run-cancel-idle'),
      'cancelled'
    );
    assert.equal(getActiveAssessmentRun('environment-1'), null);

    createAssessmentRun('run-legacy', 'environment-1');
    db.prepare(`
      UPDATE assessment_runs
      SET status = 'completed', completed_at = datetime('now'), duration_ms = 1
      WHERE id = 'run-legacy'
    `).run();
    db.prepare(`
      INSERT INTO assessment_metrics (run_id, metric_key, value)
      VALUES
        ('run-legacy', 'healthScore', 80),
        ('run-legacy', 'assessedDomains', 2)
    `).run();
    db.prepare(`
      INSERT INTO assessment_findings
        (run_id, rule_key, domain, severity, title, summary, recommendation, affected_resources)
      VALUES
        ('run-legacy', 'default-branch-protection-missing', 'repositories', 'high',
         'Legacy repository finding', 'Legacy summary', 'Legacy recommendation', '[]')
    `).run();

    const legacySnapshot = getAssessmentById('run-legacy');
    assert.ok(legacySnapshot);
    assert.equal(legacySnapshot.metrics.healthScore, 90);
    assert.deepEqual(legacySnapshot.apiUsage, {
      restRequests: 0,
      graphqlRequests: 0,
      retryCount: 0,
      throttleCount: 0,
      throttleWaitMs: 0,
      pacingWaitCount: 0,
      pacingWaitMs: 0,
      lastRequestAt: null,
      rateLimits: {},
    });
    assert.deepEqual(legacySnapshot.domainScores, {
      identity: 100,
      repositories: 80,
    });
    assert.equal(
      legacySnapshot.findings[0].expectedState,
      'Every existing default branch is protected by active ruleset rules or classic branch protection.'
    );
    assert.deepEqual(legacySnapshot.findings[0].evidenceSources, [{
      collectorKey: 'repositoryRules',
      label: 'Effective default-branch controls',
      endpoint: 'REST GET /repos/{owner}/{repo}/rules/branches/{branch} and /branches/{branch}/protection',
    }]);
    assert.equal(legacySnapshot.findings[0].remediation.controlLevel, 'Multiple scopes');
    assert.equal(
      legacySnapshot.findings[0].remediation.settingsPath,
      'Enterprise or organization settings > Policies > Rulesets'
    );
    assert.match(
      legacySnapshot.findings[0].remediation.verification,
      /every existing default branch reports active protection/
    );

    db.prepare(`
      INSERT INTO environments (id, name, base_url, enterprise_slug, auth_method, is_active)
      VALUES ('environment-2', 'Other', 'https://api.github.com', 'other', 'pat', 0)
    `).run();
    createAssessmentRun('other-run', 'environment-2');
    db.prepare(`
      UPDATE assessment_runs
      SET status = 'completed', completed_at = datetime('now'), duration_ms = 1
      WHERE id = 'other-run'
    `).run();

    const runHistory = listAssessmentRuns('environment-1', 20);
    assert.deepEqual(runHistory.map(run => run.id), ['run-legacy', 'run-1']);
    assert.ok(runHistory.every(run => run.environmentId === 'environment-1'));
    assert.equal(runHistory[0].healthScore, 90);
    assert.equal(
      runHistory.find(run => run.id === 'run-1')?.apiUsage.restRequests,
      47
    );
    assert.deepEqual(listAssessmentRuns('environment-1', 1).map(run => run.id), ['run-legacy']);

    assert.equal(setAssessmentRunProtection('environment-1', 'run-1', true), true);
    assert.ok(listAssessmentRuns('environment-1', 20).find(run => run.id === 'run-1')?.protectedAt);
    assert.equal(deleteAssessmentRun('environment-1', 'run-1'), 'protected');

    createAssessmentRun('run-old', 'environment-1');
    db.prepare(`
      UPDATE assessment_runs
      SET status = 'completed', completed_at = datetime('now'), started_at = datetime('now', '-1 day')
      WHERE id = 'run-old'
    `).run();
    assert.equal(clearPreviousAssessmentRuns('environment-1'), 1);
    assert.equal(getAssessmentById('run-old'), null);
    assert.ok(getAssessmentById('run-legacy'));
    assert.ok(getAssessmentById('run-1'));

    db.prepare(`
      INSERT INTO environments (id, name, base_url, enterprise_slug, auth_method, is_active)
      VALUES ('environment-3', 'Retention', 'https://api.github.com', 'retention', 'pat', 0)
    `).run();
    const insertCompletedRun = db.prepare(`
      INSERT INTO assessment_runs
        (id, environment_id, status, started_at, completed_at, protected_at)
      VALUES (?, 'environment-3', 'completed', datetime('now', ?), datetime('now', ?), ?)
    `);
    for (let index = 0; index < 5; index += 1) {
      const age = `-${5 - index} hours`;
      insertCompletedRun.run(
        `retained-${index}`,
        age,
        age,
        index === 0 ? '2026-09-01 00:00:00' : null
      );
    }
    db.prepare(`
      INSERT INTO assessment_runs
        (id, environment_id, status, started_at, completed_at)
      VALUES
        ('failed-old', 'environment-3', 'failed', datetime('now', '-9 days'), datetime('now', '-8 days')),
        ('failed-recent', 'environment-3', 'failed', datetime('now', '-2 days'), datetime('now', '-1 day'))
    `).run();

    assert.deepEqual(pruneAssessmentRuns('environment-3', 3, 7), {
      completedDeleted: 1,
      failedDeleted: 1,
    });
    const retainedRunIds = db.prepare(`
      SELECT id FROM assessment_runs
      WHERE environment_id = 'environment-3'
      ORDER BY id
    `).all() as Array<{ id: string }>;
    assert.deepEqual(retainedRunIds.map(run => run.id), [
      'failed-recent',
      'retained-0',
      'retained-2',
      'retained-3',
      'retained-4',
    ]);

    assert.equal(setAssessmentRunProtection('environment-1', 'run-1', false), true);
    assert.equal(deleteAssessmentRun('environment-1', 'run-1'), 'deleted');
    assert.equal(getAssessmentById('run-1'), null);
    const deletedFindingCount = db.prepare(
      "SELECT COUNT(*) AS count FROM assessment_findings WHERE run_id = 'run-1'"
    ).get() as { count: number };
    assert.equal(
      deletedFindingCount.count,
      0
    );
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
