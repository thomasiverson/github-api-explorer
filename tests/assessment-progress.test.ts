import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectBillingGovernanceProgressively,
  collectCopilotGovernanceProgressively,
  collectEnterpriseActionsEvidenceProgressively,
  collectEnterpriseBudgetsProgressively,
  collectEnterpriseCopilotSeatsProgressively,
  collectEnterpriseIdentityProgressively,
  collectEnterpriseScimProgressively,
  createAssessmentActionsProgress,
  createAssessmentBillingProgress,
  createAssessmentBudgetProgress,
  createAssessmentCopilotGovernanceProgress,
  createAssessmentCopilotSeatProgress,
  createAssessmentIdentityProgress,
  createAssessmentScimProgress,
  type AssessmentActionsProgress,
  type AssessmentBillingProgress,
  type AssessmentBudgetProgress,
  type AssessmentCopilotGovernanceProgress,
  type AssessmentCopilotSeatProgress,
  type AssessmentIdentityProgress,
  type AssessmentScimProgress,
} from '../src/lib/assessment';

function interruptAfterSave<State>(
  capture: (state: State) => void,
  shouldInterrupt: (state: State) => boolean
) {
  return (state: State) => {
    const saved = structuredClone(state);
    capture(saved);
    if (shouldInterrupt(saved)) throw new Error('Simulated interruption');
  };
}

test('resumes enterprise identity from the saved GraphQL cursor', async () => {
  let saved: AssessmentIdentityProgress | null = null;
  const calls: Array<{ query: string; cursor: unknown }> = [];
  const request = async (query: string, variables: Record<string, unknown>) => {
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
                nodes: [{ login: 'owner-one', name: null }],
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
  };

  await assert.rejects(
    collectEnterpriseIdentityProgressively(
      request,
      'acme',
      createAssessmentIdentityProgress(),
      interruptAfterSave(
        state => { saved = state; },
        state => state.cursor === 'members-next'
      )
    ),
    /Simulated interruption/
  );
  assert.ok(saved);
  const identity = await collectEnterpriseIdentityProgressively(
    request,
    'acme',
    saved,
    () => undefined
  );

  assert.deepEqual(calls.map(call => call.cursor), [null, 'members-next', null]);
  assert.deepEqual(identity, {
    members: [
      { login: 'member-one', name: 'Member One', isOwner: false },
      { login: 'owner-one', name: null, isOwner: true },
    ],
    ownerLogins: ['owner-one'],
  });
});

test('resumes SCIM and Copilot seat collection from their next REST pages', async () => {
  let savedScim: AssessmentScimProgress | null = null;
  const scimStarts: number[] = [];
  const scimRequest = async (startIndex: number) => {
    scimStarts.push(startIndex);
    return {
      status: 200,
      data: {
        totalResults: 2,
        Resources: [{
          id: `scim-${startIndex}`,
          userName: `user-${startIndex}@example.com`,
          active: true,
          roles: [],
        }],
      },
    };
  };
  await assert.rejects(
    collectEnterpriseScimProgressively(
      scimRequest,
      createAssessmentScimProgress(),
      interruptAfterSave(
        state => { savedScim = state; },
        state => state.startIndex === 2
      )
    ),
    /Simulated interruption/
  );
  assert.ok(savedScim);
  const scim = await collectEnterpriseScimProgressively(
    scimRequest,
    savedScim,
    () => undefined
  );
  assert.deepEqual(scimStarts, [1, 2]);
  assert.equal(scim.identities.length, 2);

  let savedSeats: AssessmentCopilotSeatProgress | null = null;
  const seatPages: number[] = [];
  const seatRequest = async (page: number) => {
    seatPages.push(page);
    return {
      total_seats: 101,
      seats: page === 1
        ? Array.from({ length: 100 }, (_, index) => ({
            assignee: { login: `user-${index}` },
            plan_type: 'business',
            created_at: '2026-01-01T00:00:00Z',
          }))
        : [{
            assignee: { login: 'user-100' },
            plan_type: 'business',
            created_at: '2026-01-01T00:00:00Z',
          }],
    };
  };
  await assert.rejects(
    collectEnterpriseCopilotSeatsProgressively(
      seatRequest,
      createAssessmentCopilotSeatProgress(),
      interruptAfterSave(
        state => { savedSeats = state; },
        state => state.page === 2
      )
    ),
    /Simulated interruption/
  );
  assert.ok(savedSeats);
  const seats = await collectEnterpriseCopilotSeatsProgressively(
    seatRequest,
    savedSeats,
    () => undefined
  );
  assert.deepEqual(seatPages, [1, 2]);
  assert.equal(seats.seats.length, 101);
});

test('resumes Actions runner inventory without replaying completed policy checks', async () => {
  let saved: AssessmentActionsProgress | null = null;
  const calls: string[] = [];
  const requests = {
    getSelectedActions: async () => {
      calls.push('selected');
      return {
        status: 200,
        data: { github_owned_allowed: true, verified_allowed: true, patterns_allowed: [] },
      };
    },
    getWorkflowPermissions: async () => {
      calls.push('workflow');
      return {
        status: 200,
        data: {
          default_workflow_permissions: 'read',
          can_approve_pull_request_reviews: false,
        },
      };
    },
    getForkPullRequestPolicy: async () => {
      calls.push('fork');
      return {
        status: 200,
        data: {
          run_workflows_from_fork_pull_requests: false,
          send_write_tokens_to_workflows: false,
          send_secrets_and_variables: false,
          require_approval_for_fork_pr_workflows: true,
        },
      };
    },
    getSelfHostedRunnerPolicy: async () => {
      calls.push('runner-policy');
      return {
        status: 200,
        data: { disable_self_hosted_runners_for_all_orgs: false },
      };
    },
    getRunnerGroups: async (page: number) => {
      calls.push(`groups-${page}`);
      return {
        status: 200,
        data: {
          total_count: 101,
          runner_groups: page === 1
            ? Array.from({ length: 100 }, (_, index) => ({
                id: index + 1,
                name: `Group ${index + 1}`,
                visibility: 'all',
                default: false,
                allows_public_repositories: false,
              }))
            : [{
                id: 101,
                name: 'Group 101',
                visibility: 'all',
                default: false,
                allows_public_repositories: false,
              }],
        },
      };
    },
    getRunners: async () => {
      calls.push('runners-1');
      return { status: 200, data: { total_count: 0, runners: [] } };
    },
  };

  await assert.rejects(
    collectEnterpriseActionsEvidenceProgressively(
      requests,
      createAssessmentActionsProgress('selected'),
      interruptAfterSave(
        state => { saved = state; },
        state => state.phase === 'runner-groups' && state.runnerGroupPage === 2
      )
    ),
    /Simulated interruption/
  );
  assert.ok(saved);
  const evidence = await collectEnterpriseActionsEvidenceProgressively(
    requests,
    saved,
    () => undefined
  );

  assert.deepEqual(calls, [
    'selected',
    'workflow',
    'fork',
    'runner-policy',
    'groups-1',
    'groups-2',
    'runners-1',
  ]);
  assert.equal(evidence.runnerGroups?.length, 101);
});

test('resumes Copilot governance at the unfinished organization sub-step', async () => {
  let saved: AssessmentCopilotGovernanceProgress | null = null;
  const calls: string[] = [];
  const requests = {
    getContentExclusion: async () => {
      calls.push('content');
      return { status: 200, data: {} };
    },
    getOrganizationSettings: async (organization: string) => {
      calls.push(`settings-${organization}`);
      return {
        status: 200,
        data: {
          seat_breakdown: {
            total: 1,
            added_this_cycle: 0,
            pending_cancellation: 0,
            pending_invitation: 0,
            active_this_cycle: 1,
            inactive_this_cycle: 0,
          },
          plan_type: 'enterprise',
          seat_management_setting: 'assign_selected',
          public_code_suggestions: 'block',
          ide_chat: 'enabled',
          platform_chat: 'enabled',
          cli: 'disabled',
        },
      };
    },
    getCodingAgentPermissions: async (organization: string) => {
      calls.push(`coding-${organization}`);
      return { status: 200, data: { enabled_repositories: 'selected' } };
    },
  };

  await assert.rejects(
    collectCopilotGovernanceProgressively(
      requests,
      ['org-one', 'org-two'],
      createAssessmentCopilotGovernanceProgress(),
      interruptAfterSave(
        state => { saved = state; },
        state => state.phase === 'coding-agent' && state.organizationIndex === 0
      )
    ),
    /Simulated interruption/
  );
  assert.ok(saved);
  const evidence = await collectCopilotGovernanceProgressively(
    requests,
    ['org-one', 'org-two'],
    saved,
    () => undefined
  );

  assert.deepEqual(calls, [
    'content',
    'settings-org-one',
    'coding-org-one',
    'settings-org-two',
    'coding-org-two',
  ]);
  assert.equal(evidence.organizations.length, 2);
});

test('resumes budget pages and billing cost-center details independently', async () => {
  let savedBudgets: AssessmentBudgetProgress | null = null;
  const budgetPages: number[] = [];
  const budgetRequest = async (page: number) => {
    budgetPages.push(page);
    return {
      budgets: [{
        id: `budget-${page}`,
        budget_type: 'ProductPricing',
        budget_product_sku: 'ai_credits',
        budget_scope: 'enterprise',
        budget_amount: 100,
        prevent_further_usage: true,
        budget_alerting: { will_alert: false, alert_recipients: [] },
      }],
      has_next_page: page === 1,
      total_count: 2,
    };
  };
  await assert.rejects(
    collectEnterpriseBudgetsProgressively(
      budgetRequest,
      createAssessmentBudgetProgress(),
      interruptAfterSave(
        state => { savedBudgets = state; },
        state => state.page === 2
      )
    ),
    /Simulated interruption/
  );
  assert.ok(savedBudgets);
  const budgets = await collectEnterpriseBudgetsProgressively(
    budgetRequest,
    savedBudgets,
    () => undefined
  );
  assert.deepEqual(budgetPages, [1, 2]);
  assert.equal(budgets.length, 2);

  let savedBilling: AssessmentBillingProgress | null = null;
  const calls: string[] = [];
  const requests = {
    getCostCenters: async () => {
      calls.push('centers');
      return {
        status: 200,
        data: {
          costCenters: [{
            id: 'center-1',
            name: 'Engineering',
            state: 'active',
            ai_credit_pool_enabled: false,
          }],
        },
      };
    },
    getCostCenter: async (_id: string, page: number) => {
      calls.push(`center-${page}`);
      return {
        status: 200,
        data: {
          id: 'center-1',
          name: 'Engineering',
          state: 'active',
          ai_credit_pool_enabled: false,
          resources: [{ type: 'User', name: `user-${page}` }],
          has_next_page: page === 1,
        },
      };
    },
    getEffectiveBudget: async (user: string) => {
      calls.push(`effective-${user}`);
      return {
        status: 200,
        data: { user, budgets: [], effective_budget: null, has_next_page: false },
      };
    },
    getBudgetUserStates: async () => {
      assert.fail('No multi-user budget should be requested');
    },
    getUsageSummary: async () => {
      calls.push('usage');
      return {
        status: 200,
        data: {
          timePeriod: { year: 2026, month: 9 },
          usageItems: [],
        },
      };
    },
  };
  await assert.rejects(
    collectBillingGovernanceProgressively(
      requests,
      [],
      ['octocat'],
      createAssessmentBillingProgress(),
      interruptAfterSave(
        state => { savedBilling = state; },
        state => state.currentCostCenter?.page === 2
      )
    ),
    /Simulated interruption/
  );
  assert.ok(savedBilling);
  const billing = await collectBillingGovernanceProgressively(
    requests,
    [],
    ['octocat'],
    savedBilling,
    () => undefined
  );

  assert.deepEqual(calls, ['centers', 'center-1', 'center-2', 'effective-octocat', 'usage']);
  assert.equal(billing.costCenters[0].resources?.length, 2);
});
