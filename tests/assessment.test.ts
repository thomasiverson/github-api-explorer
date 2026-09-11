import assert from 'node:assert/strict';
import test from 'node:test';
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
} from '../src/lib/assessment';

test('collects and normalizes paginated enterprise organizations', async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    databaseId: index + 1,
    id: `ORG_${index + 1}`,
    login: `org-${index + 1}`,
    description: index === 0 ? 'Primary organization' : null,
  }));
  const requestedCursors: unknown[] = [];

  const organizations = await collectEnterpriseOrganizations(async (_query, variables) => {
    requestedCursors.push(variables.cursor);
    return {
      enterprise: {
        organizations: variables.cursor === null
          ? { nodes: firstPage, pageInfo: { hasNextPage: true, endCursor: 'next-page' } }
          : { nodes: [{ databaseId: 101, id: 'ORG_101', login: 'org-101', description: null }], pageInfo: { hasNextPage: false, endCursor: null } },
      },
    };
  }, 'acme');

  assert.equal(organizations.length, 101);
  assert.deepEqual(requestedCursors, [null, 'next-page']);
  assert.deepEqual(organizations[0], {
    githubId: 1,
    nodeId: 'ORG_1',
    login: 'org-1',
    description: 'Primary organization',
  });
});

test('rejects malformed organization inventory responses', async () => {
  await assert.rejects(
    () => collectEnterpriseOrganizations(async () => ({ enterprise: { organizations: [] } }), 'acme'),
    /invalid organization inventory response/
  );
  await assert.rejects(
    () => collectEnterpriseOrganizations(async () => ({
      enterprise: {
        organizations: {
          nodes: [{ id: 'ORG_1' }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    }), 'acme'),
    /incomplete organization record/
  );
});

test('collects paginated enterprise members and owners', async () => {
  const calls: Array<{ query: string; cursor: unknown }> = [];
  const identity = await collectEnterpriseIdentity(async (query, variables) => {
    calls.push({ query, cursor: variables.cursor });
    if (query.includes('EnterpriseMembers')) {
      return {
        enterprise: {
          members: variables.cursor === null
            ? {
                nodes: [{ login: 'member-one', name: 'Member One' }],
                pageInfo: { hasNextPage: true, endCursor: 'members-next' },
              }
            : {
                nodes: [{ login: 'OWNER-ONE', name: null }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
        },
      };
    }
    return {
      enterprise: {
        ownerInfo: {
          admins: {
            nodes: [{ login: 'owner-one' }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    };
  }, 'acme');

  assert.deepEqual(calls.map(call => call.cursor), [null, 'members-next', null]);
  assert.deepEqual(identity, {
    members: [
      { login: 'member-one', name: 'Member One', isOwner: false },
      { login: 'OWNER-ONE', name: null, isOwner: true },
    ],
    ownerLogins: ['owner-one'],
  });
});

test('rejects malformed enterprise identity responses', async () => {
  await assert.rejects(
    () => collectEnterpriseIdentity(async () => ({ enterprise: { members: null } }), 'acme'),
    /invalid member inventory response/
  );
});

test('collects repositories across organizations with pagination', async () => {
  const calls: Array<{ login: unknown; cursor: unknown }> = [];
  const result = await collectOrganizationRepositories(async (_query, variables) => {
    calls.push({ login: variables.login, cursor: variables.cursor });
    const hasNextPage = variables.login === 'org-one' && variables.cursor === null;
    return {
      organization: {
        repositories: {
          nodes: [{
            databaseId: calls.length,
            id: `REPO_${calls.length}`,
            nameWithOwner: `${variables.login}/repo-${calls.length}`,
            visibility: 'PRIVATE',
            isArchived: false,
            isFork: false,
            updatedAt: '2026-01-01T00:00:00Z',
          }],
          pageInfo: { hasNextPage, endCursor: hasNextPage ? 'repo-next' : null },
        },
      },
    };
  }, ['org-one', 'org-two']);

  assert.deepEqual(calls, [
    { login: 'org-one', cursor: null },
    { login: 'org-one', cursor: 'repo-next' },
    { login: 'org-two', cursor: null },
  ]);
  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].organizationLogin, 'org-one');
  assert.deepEqual(result.failures, []);
});

test('collects teams across organizations', async () => {
  const result = await collectOrganizationTeams(async () => ({
    organization: {
      teams: {
        nodes: [{
          databaseId: 42,
          id: 'TEAM_42',
          slug: 'platform',
          name: 'Platform',
          privacy: 'VISIBLE',
        }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  }), ['org-one']);

  assert.deepEqual(result, { items: [{
    githubId: 42,
    nodeId: 'TEAM_42',
    organizationLogin: 'org-one',
    slug: 'platform',
    name: 'Platform',
    privacy: 'VISIBLE',
  }], failures: [] });
});

test('records inaccessible organizations without discarding collected resources', async () => {
  const result = await collectOrganizationRepositories(async (_query, variables) => {
    if (variables.login === 'saml-protected') {
      throw new Error('Resource protected by organization SAML enforcement');
    }
    return {
      organization: {
        repositories: {
          nodes: [{
            databaseId: 1,
            id: 'REPO_1',
            nameWithOwner: 'accessible/repo',
            visibility: 'INTERNAL',
            isArchived: false,
            isFork: false,
            updatedAt: '2026-01-01T00:00:00Z',
          }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    };
  }, ['saml-protected', 'accessible']);

  assert.equal(result.items.length, 1);
  assert.deepEqual(result.failures, [{
    organizationLogin: 'saml-protected',
    error: 'Resource protected by organization SAML enforcement',
  }]);
});

test('collects enterprise security defaults and Actions policy', async () => {
  const securityDefaults = await collectEnterpriseSecurityDefaults(async () => [{
    default_for_new_repos: 'public',
    configuration: {
      id: 17,
      name: 'GitHub recommended',
      advanced_security: 'enabled',
      dependency_graph: 'enabled',
      dependabot_alerts: 'enabled',
      code_scanning_default_setup: 'enabled',
      secret_scanning: 'enabled',
      secret_scanning_push_protection: 'enabled',
      enforcement: 'unenforced',
    },
  }]);
  const actionsPolicy = await collectEnterpriseActionsPolicy(async () => ({
    enabled_organizations: 'all',
    allowed_actions: 'selected',
    sha_pinning_required: true,
  }));

  assert.deepEqual(securityDefaults, [{
    defaultForNewRepositories: 'public',
    configurationId: 17,
    configurationName: 'GitHub recommended',
    advancedSecurity: 'enabled',
    dependencyGraph: 'enabled',
    dependabotAlerts: 'enabled',
    codeScanningDefaultSetup: 'enabled',
    secretScanning: 'enabled',
    secretScanningPushProtection: 'enabled',
    enforcement: 'unenforced',
  }]);
  assert.deepEqual(actionsPolicy, {
    enabledOrganizations: 'all',
    allowedActions: 'selected',
    shaPinningRequired: true,
  });
});

test('rejects malformed security and Actions policy responses', async () => {
  await assert.rejects(
    () => collectEnterpriseSecurityDefaults(async () => ({ configuration: {} })),
    /invalid enterprise security defaults response/
  );
  await assert.rejects(
    () => collectEnterpriseActionsPolicy(async () => ({ allowed_actions: 'all' })),
    /incomplete enterprise Actions policy response/
  );
});

test('collects and deduplicates paginated enterprise Copilot seats', async () => {
  const requestedPages: number[] = [];
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    created_at: '2026-01-01T00:00:00Z',
    assignee: { login: `user-${index + 1}` },
    pending_cancellation_date: null,
    plan_type: 'business',
    last_authenticated_at: null,
    last_activity_at: index === 0 ? '2026-08-01T00:00:00Z' : null,
  }));

  const inventory = await collectEnterpriseCopilotSeats(async page => {
    requestedPages.push(page);
    return {
      total_seats: 100,
      seats: page === 1
        ? firstPage
        : [{
            ...firstPage[0],
            created_at: '2026-02-01T00:00:00Z',
            last_authenticated_at: '2026-09-01T00:00:00Z',
            last_activity_at: '2026-09-02T00:00:00Z',
          }],
    };
  });

  assert.deepEqual(requestedPages, [1, 2]);
  assert.equal(inventory.totalSeats, 100);
  assert.equal(inventory.rawAssignmentCount, 101);
  assert.equal(inventory.seats.length, 100);
  assert.deepEqual(inventory.seats.find(seat => seat.login === 'user-1'), {
    login: 'user-1',
    planType: 'business',
    createdAt: '2026-01-01T00:00:00Z',
    lastAuthenticatedAt: '2026-09-01T00:00:00Z',
    lastActivityAt: '2026-09-02T00:00:00Z',
    pendingCancellationDate: null,
    assignmentCount: 2,
  });
});

test('collects paginated enterprise budgets', async () => {
  const requestedPages: number[] = [];
  const budgets = await collectEnterpriseBudgets(async page => {
    requestedPages.push(page);
    return {
      budgets: [{
        id: `budget-${page}`,
        budget_type: 'BundlePricing',
        budget_product_sku: 'ai_credits',
        budget_scope: page === 1 ? 'enterprise' : 'user',
        budget_amount: page * 100,
        prevent_further_usage: true,
        budget_entity_name: page === 1 ? 'acme' : 'octocat',
        budget_alerting: {
          will_alert: page === 1,
          alert_recipients: page === 1 ? ['owner'] : [],
        },
        consumed_amount: page === 1 ? null : 12.5,
      }],
      has_next_page: page === 1,
      total_count: 2,
    };
  });

  assert.deepEqual(requestedPages, [1, 2]);
  assert.deepEqual(budgets, [
    {
      id: 'budget-1',
      budgetType: 'BundlePricing',
      productSku: 'ai_credits',
      scope: 'enterprise',
      amount: 100,
      consumedAmount: null,
      preventsFurtherUsage: true,
      alertingEnabled: true,
      alertRecipientCount: 1,
      entityName: 'acme',
      user: null,
      expiresAt: null,
    },
    {
      id: 'budget-2',
      budgetType: 'BundlePricing',
      productSku: 'ai_credits',
      scope: 'user',
      amount: 200,
      consumedAmount: 12.5,
      preventsFurtherUsage: true,
      alertingEnabled: false,
      alertRecipientCount: 0,
      entityName: 'octocat',
      user: null,
      expiresAt: null,
    },
  ]);
});

test('rejects malformed Copilot seat and budget responses', async () => {
  await assert.rejects(
    () => collectEnterpriseCopilotSeats(async () => ({ seats: [] })),
    /incomplete enterprise Copilot seats response/
  );
  await assert.rejects(
    () => collectEnterpriseBudgets(async () => ({ budgets: [] })),
    /incomplete enterprise budgets response/
  );
});

test('evaluates evidence-backed identity and repository baseline findings', () => {
  const evaluation = evaluateAssessmentBaseline({
    organizations: [
      { githubId: 1, nodeId: 'ORG_1', login: 'org-one', description: null },
    ],
    members: [
      { login: 'only-owner', name: null, isOwner: true },
    ],
    ownerCount: 1,
    repositories: [
      {
        githubId: 1,
        nodeId: 'REPO_1',
        organizationLogin: 'org-one',
        nameWithOwner: 'org-one/stale-public',
        visibility: 'PUBLIC',
        isArchived: false,
        isFork: false,
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        githubId: 2,
        nodeId: 'REPO_2',
        organizationLogin: 'org-one',
        nameWithOwner: 'org-one/archived',
        visibility: 'PRIVATE',
        isArchived: true,
        isFork: false,
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ],
    teams: [],
    now: new Date('2026-09-10T00:00:00Z'),
  });

  assert.equal(evaluation.healthScore, 65);
  assert.equal(evaluation.assessedDomainCount, 2);
  assert.deepEqual(
    evaluation.findings.map(finding => finding.ruleKey),
    [
      'enterprise-owner-single-point-of-failure',
      'stale-active-repositories',
      'public-repository-review',
    ]
  );
  assert.deepEqual(evaluation.metrics, {
    activeRepositories: 1,
    archivedRepositories: 1,
    forkRepositories: 0,
    internalRepositories: 0,
    privateRepositories: 1,
    publicRepositories: 1,
    staleActiveRepositories: 1,
  });
});

test('does not report baseline findings when collected evidence passes', () => {
  const evaluation = evaluateAssessmentBaseline({
    organizations: [],
    members: [
      { login: 'owner-one', name: null, isOwner: true },
      { login: 'owner-two', name: null, isOwner: true },
    ],
    ownerCount: 2,
    repositories: [{
      githubId: 1,
      nodeId: 'REPO_1',
      organizationLogin: 'org-one',
      nameWithOwner: 'org-one/current',
      visibility: 'PRIVATE',
      isArchived: false,
      isFork: false,
      updatedAt: '2026-09-01T00:00:00Z',
    }],
    teams: [],
    now: new Date('2026-09-10T00:00:00Z'),
  });

  assert.equal(evaluation.healthScore, 100);
  assert.deepEqual(evaluation.findings, []);
});

test('evaluates enterprise security defaults and Actions policy', () => {
  const evaluation = evaluateAssessmentBaseline({
    organizations: [],
    members: [
      { login: 'owner-one', name: null, isOwner: true },
      { login: 'owner-two', name: null, isOwner: true },
    ],
    ownerCount: 2,
    repositories: [],
    teams: [],
    securityDefaults: [{
      defaultForNewRepositories: 'public',
      configurationId: 17,
      configurationName: 'GitHub recommended',
      advancedSecurity: 'enabled',
      dependencyGraph: 'enabled',
      dependabotAlerts: 'enabled',
      codeScanningDefaultSetup: 'enabled',
      secretScanning: 'enabled',
      secretScanningPushProtection: 'enabled',
      enforcement: 'unenforced',
    }],
    actionsPolicy: {
      enabledOrganizations: 'all',
      allowedActions: 'all',
      shaPinningRequired: false,
    },
    now: new Date('2026-09-10T00:00:00Z'),
  });

  assert.equal(evaluation.assessedDomainCount, 4);
  assert.equal(evaluation.healthScore, 70);
  assert.deepEqual(
    evaluation.findings.map(finding => finding.ruleKey),
    [
      'security-defaults-incomplete-visibility-coverage',
      'actions-unrestricted-sources',
      'actions-sha-pinning-not-required',
    ]
  );
});

test('evaluates Copilot seat utilization and enterprise budget controls', () => {
  const evaluation = evaluateAssessmentBaseline({
    organizations: [],
    members: [
      { login: 'owner-one', name: null, isOwner: true },
      { login: 'owner-two', name: null, isOwner: true },
    ],
    ownerCount: 2,
    repositories: [],
    teams: [],
    copilotSeats: {
      totalSeats: 4,
      rawAssignmentCount: 5,
      seats: [
        {
          login: 'active-user',
          planType: 'business',
          createdAt: '2026-01-01T00:00:00Z',
          lastAuthenticatedAt: '2026-09-09T00:00:00Z',
          lastActivityAt: '2026-09-09T00:00:00Z',
          pendingCancellationDate: null,
          assignmentCount: 2,
        },
        {
          login: 'inactive-user',
          planType: 'business',
          createdAt: '2026-01-01T00:00:00Z',
          lastAuthenticatedAt: null,
          lastActivityAt: null,
          pendingCancellationDate: null,
          assignmentCount: 1,
        },
        {
          login: 'new-user',
          planType: 'business',
          createdAt: '2026-09-01T00:00:00Z',
          lastAuthenticatedAt: null,
          lastActivityAt: null,
          pendingCancellationDate: null,
          assignmentCount: 1,
        },
        {
          login: 'departing-user',
          planType: 'business',
          createdAt: '2026-01-01T00:00:00Z',
          lastAuthenticatedAt: null,
          lastActivityAt: null,
          pendingCancellationDate: '2026-09-30',
          assignmentCount: 1,
        },
      ],
    },
    budgets: [
      {
        id: 'enterprise-budget',
        budgetType: 'BundlePricing',
        productSku: 'ai_credits',
        scope: 'enterprise',
        amount: 5000,
        consumedAmount: null,
        preventsFurtherUsage: true,
        alertingEnabled: true,
        alertRecipientCount: 1,
        entityName: 'acme',
        user: null,
        expiresAt: null,
      },
      {
        id: 'unenforced-budget',
        budgetType: 'BundlePricing',
        productSku: 'ai_credits',
        scope: 'cost_center',
        amount: 500,
        consumedAmount: null,
        preventsFurtherUsage: false,
        alertingEnabled: true,
        alertRecipientCount: 1,
        entityName: 'research',
        user: null,
        expiresAt: null,
      },
      {
        id: 'unalerted-budget',
        budgetType: 'BundlePricing',
        productSku: 'ai_credits',
        scope: 'multi_user_customer',
        amount: 400,
        consumedAmount: null,
        preventsFurtherUsage: true,
        alertingEnabled: false,
        alertRecipientCount: 0,
        entityName: 'acme',
        user: null,
        expiresAt: null,
      },
      {
        id: 'user-budget',
        budgetType: 'BundlePricing',
        productSku: 'ai_credits',
        scope: 'user',
        amount: 100,
        consumedAmount: 10,
        preventsFurtherUsage: true,
        alertingEnabled: false,
        alertRecipientCount: 0,
        entityName: 'octocat',
        user: 'octocat',
        expiresAt: null,
      },
    ],
    now: new Date('2026-09-10T00:00:00Z'),
  });

  assert.equal(evaluation.assessedDomainCount, 4);
  assert.equal(evaluation.healthScore, 75);
  assert.deepEqual(
    evaluation.findings.map(finding => finding.ruleKey),
    [
      'copilot-inactive-seats',
      'billing-budget-enforcement-disabled',
      'billing-budget-alerting-disabled',
    ]
  );
  assert.equal(evaluation.metrics.copilotSeats, 4);
  assert.equal(evaluation.metrics.activeCopilotSeats, 1);
  assert.equal(evaluation.metrics.inactiveCopilotSeats, 1);
  assert.equal(evaluation.metrics.duplicateCopilotAssignments, 1);
  assert.equal(evaluation.metrics.budgets, 4);
  assert.equal(evaluation.metrics.enforcingBudgets, 3);
  assert.equal(evaluation.metrics.alertingBudgets, 2);
  assert.equal(evaluation.metrics.userLevelBudgets, 2);
});