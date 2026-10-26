import type { AssessmentFindingRuleKey } from '@/lib/assessment';
import type { HttpMethod } from '@/lib/types';

export type AssessmentRemediationMode = 'executable' | 'api-explorer' | 'advisory';
export type AssessmentRemediationRisk = 'low' | 'moderate' | 'high';
export type GitHubProduct = 'ghec' | 'ghes';

export interface RemediationApiTarget {
  label: string;
  method: HttpMethod;
  path: string;
  body?: Record<string, unknown>;
}

export interface RemediationPreviewRecipe {
  execution: 'preview-only';
  targetType: 'organization';
  inspection: RemediationApiTarget;
  mutation: RemediationApiTarget;
  currentValuePath: string;
  proposedValue: string;
  verification: RemediationApiTarget;
  rollback: string;
  batchAllowed: false;
}

export interface AssessmentRemediationDefinition {
  mode: AssessmentRemediationMode;
  risk: AssessmentRemediationRisk;
  rationale: string;
  apiTargets: readonly RemediationApiTarget[];
  supportedProducts: readonly GitHubProduct[];
  apiVersion: string;
  lastReviewedOn: string;
  previewRecipe?: RemediationPreviewRecipe;
}

export interface RemediationHandoffContext {
  enterpriseSlug: string;
  defaultOrganization: string;
  affectedResource?: string;
}

export interface RemediationHandoffPayload {
  version: 1;
  ruleKey: AssessmentFindingRuleKey;
  method: HttpMethod;
  path: string;
  label: string;
  pathValues: Record<string, string>;
}

export type RemediationHandoffParseResult =
  | { ok: true; value: RemediationHandoffPayload & { body?: Record<string, unknown> } }
  | { ok: false; error: string };

const API_VERSION = '2022-11-28';
const LAST_REVIEWED_ON = '2026-09-13';
const ALL_PRODUCTS: readonly GitHubProduct[] = ['ghec', 'ghes'];
const GHEC_ONLY: readonly GitHubProduct[] = ['ghec'];

const GET_ORGANIZATION = {
  label: 'Inspect organization settings',
  method: 'GET',
  path: '/orgs/{org}',
} satisfies RemediationApiTarget;

const UPDATE_ORGANIZATION_BASE_PERMISSION = {
  label: 'Set organization base permission to read',
  method: 'PATCH',
  path: '/orgs/{org}',
  body: { default_repository_permission: 'read' },
} satisfies RemediationApiTarget;

function advisory(
  rationale: string,
  risk: AssessmentRemediationRisk = 'moderate'
): AssessmentRemediationDefinition {
  return {
    mode: 'advisory',
    risk,
    rationale,
    apiTargets: [],
    supportedProducts: ALL_PRODUCTS,
    apiVersion: API_VERSION,
    lastReviewedOn: LAST_REVIEWED_ON,
  };
}

function apiExplorer(
  risk: AssessmentRemediationRisk,
  rationale: string,
  apiTargets: readonly RemediationApiTarget[],
  supportedProducts: readonly GitHubProduct[] = ALL_PRODUCTS
): AssessmentRemediationDefinition {
  return {
    mode: 'api-explorer',
    risk,
    rationale,
    apiTargets,
    supportedProducts,
    apiVersion: API_VERSION,
    lastReviewedOn: LAST_REVIEWED_ON,
  };
}

const ENTERPRISE_OWNER_REMEDIATION = advisory(
  'Enterprise-owner assignment requires an intentional identity and separation-of-duties decision.'
);

const ORGANIZATION_BASE_PERMISSION_REMEDIATION: AssessmentRemediationDefinition = {
  mode: 'executable',
  risk: 'moderate',
  rationale: 'The organization base permission has a deterministic read, proposed mutation, verification read, and rollback value.',
  apiTargets: [UPDATE_ORGANIZATION_BASE_PERMISSION],
  supportedProducts: ALL_PRODUCTS,
  apiVersion: API_VERSION,
  lastReviewedOn: LAST_REVIEWED_ON,
  previewRecipe: {
    execution: 'preview-only',
    targetType: 'organization',
    inspection: GET_ORGANIZATION,
    mutation: UPDATE_ORGANIZATION_BASE_PERMISSION,
    currentValuePath: 'default_repository_permission',
    proposedValue: 'read',
    verification: GET_ORGANIZATION,
    rollback: 'Restore default_repository_permission to the value captured by the preflight inspection.',
    batchAllowed: false,
  },
};

const ORGANIZATION_SETTINGS_REMEDIATION = apiExplorer(
  'moderate',
  'The organization update API is available, but the correct request body depends on the organization policy decision.',
  [{
    label: 'Open organization settings request',
    method: 'PATCH',
    path: '/orgs/{org}',
  }]
);

const OUTSIDE_COLLABORATOR_REMEDIATION = apiExplorer(
  'high',
  'Removing a collaborator is reversible only through a new invitation and requires sponsor review.',
  [
    {
      label: 'List outside collaborators',
      method: 'GET',
      path: '/orgs/{org}/outside_collaborators',
    },
    {
      label: 'Prepare collaborator removal',
      method: 'DELETE',
      path: '/orgs/{org}/outside_collaborators/{username}',
    },
  ]
);

const REPOSITORY_COLLABORATOR_REMEDIATION = apiExplorer(
  'high',
  'Direct access removal requires a replacement-access decision and an explicit user target.',
  [{
    label: 'Prepare repository collaborator removal',
    method: 'DELETE',
    path: '/repos/{owner}/{repo}/collaborators/{username}',
  }]
);

const REPOSITORY_SETTINGS_REMEDIATION = apiExplorer(
  'moderate',
  'Repository archival and visibility changes require owner approval and a finding-specific request body.',
  [{
    label: 'Open repository settings request',
    method: 'PATCH',
    path: '/repos/{owner}/{repo}',
  }]
);

const RULESET_CREATE_REMEDIATION = apiExplorer(
  'high',
  'Ruleset creation requires a deliberate target selector, conditions, rules, enforcement mode, and bypass design.',
  [
    {
      label: 'Create an enterprise ruleset',
      method: 'POST',
      path: '/enterprises/{enterprise}/rulesets',
    },
    {
      label: 'Create an organization ruleset',
      method: 'POST',
      path: '/orgs/{org}/rulesets',
    },
  ]
);

const RULESET_UPDATE_REMEDIATION = apiExplorer(
  'high',
  'The governing ruleset and its complete current definition must be inspected before replacement.',
  [
    {
      label: 'Update an enterprise ruleset',
      method: 'PUT',
      path: '/enterprises/{enterprise}/rulesets/{ruleset_id}',
    },
    {
      label: 'Update an organization ruleset',
      method: 'PUT',
      path: '/orgs/{org}/rulesets/{ruleset_id}',
    },
    {
      label: 'Update a repository ruleset',
      method: 'PUT',
      path: '/repos/{owner}/{repo}/rulesets/{ruleset_id}',
    },
  ]
);

const SECURITY_DEFAULT_REMEDIATION = apiExplorer(
  'high',
  'Security configuration changes can affect broad repository populations and require feature and licensing review.',
  [
    {
      label: 'Create an enterprise security configuration',
      method: 'POST',
      path: '/enterprises/{enterprise}/code-security/configurations',
    },
    {
      label: 'Update an enterprise security configuration',
      method: 'PATCH',
      path: '/enterprises/{enterprise}/code-security/configurations/{configuration_id}',
    },
    {
      label: 'Set security configuration defaults',
      method: 'PUT',
      path: '/enterprises/{enterprise}/code-security/configurations/{configuration_id}/defaults',
    },
  ],
  GHEC_ONLY
);

const REPOSITORY_SECURITY_REMEDIATION = apiExplorer(
  'high',
  'Repository eligibility and the intended enterprise security configuration must be selected before attachment.',
  [{
    label: 'Attach an enterprise security configuration',
    method: 'POST',
    path: '/enterprises/{enterprise}/code-security/configurations/{configuration_id}/attach',
  }],
  GHEC_ONLY
);

const ACTIONS_SOURCE_REMEDIATION = apiExplorer(
  'high',
  'Enterprise Actions restrictions require an inventory of workflows and an approved source allowlist.',
  [
    {
      label: 'Update enterprise Actions permissions',
      method: 'PUT',
      path: '/enterprises/{enterprise}/actions/permissions',
    },
    {
      label: 'Update selected Actions and reusable workflows',
      method: 'PUT',
      path: '/enterprises/{enterprise}/actions/permissions/selected-actions',
    },
  ]
);

const ACTIONS_WORKFLOW_REMEDIATION = apiExplorer(
  'high',
  'Changing default workflow permissions can break workflows that rely on implicit write access.',
  [{
    label: 'Update enterprise workflow permissions',
    method: 'PUT',
    path: '/enterprises/{enterprise}/actions/permissions/workflow',
  }]
);

const ACTIONS_FORK_REMEDIATION = apiExplorer(
  'high',
  'Private-fork policy changes require review of trusted fork workflows and their required data.',
  [{
    label: 'Update private-fork workflow policy',
    method: 'PUT',
    path: '/enterprises/{enterprise}/actions/permissions/fork-pr-workflows-private-repos',
  }]
);

const ACTIONS_RUNNER_REMEDIATION = apiExplorer(
  'high',
  'Runner-group and runner changes require an explicit group or runner identifier and scheduling-impact review.',
  [
    {
      label: 'List enterprise runner groups',
      method: 'GET',
      path: '/enterprises/{enterprise}/actions/runner-groups',
    },
    {
      label: 'Update an enterprise runner group',
      method: 'PATCH',
      path: '/enterprises/{enterprise}/actions/runner-groups/{runner_group_id}',
    },
    {
      label: 'Remove an enterprise self-hosted runner',
      method: 'DELETE',
      path: '/enterprises/{enterprise}/actions/runners/{runner_id}',
    },
  ]
);

const COPILOT_SEAT_REMEDIATION = apiExplorer(
  'moderate',
  'Seat removal requires confirmation of the user identity, assignment source, and current business need.',
  [{
    label: 'Prepare enterprise Copilot seat removal',
    method: 'DELETE',
    path: '/enterprises/{enterprise}/copilot/billing/selected_users',
  }],
  GHEC_ONLY
);

const COPILOT_ASSIGNMENT_REMEDIATION = apiExplorer(
  'moderate',
  'Organization Copilot assignments require an explicit user or team selection.',
  [
    {
      label: 'Add organization Copilot users',
      method: 'POST',
      path: '/orgs/{org}/copilot/billing/selected_users',
    },
    {
      label: 'Remove organization Copilot users',
      method: 'DELETE',
      path: '/orgs/{org}/copilot/billing/selected_users',
    },
    {
      label: 'Add organization Copilot teams',
      method: 'POST',
      path: '/orgs/{org}/copilot/billing/selected_teams',
    },
    {
      label: 'Remove organization Copilot teams',
      method: 'DELETE',
      path: '/orgs/{org}/copilot/billing/selected_teams',
    },
  ],
  GHEC_ONLY
);

const COPILOT_PUBLIC_CODE_REMEDIATION = advisory(
  'Public-code suggestion policy changes require a legal, licensing, and developer-experience decision.'
);

const COPILOT_CODING_AGENT_REMEDIATION = apiExplorer(
  'high',
  'Coding-agent access requires an approved repository allowlist before the organization policy is narrowed.',
  [
    {
      label: 'Update organization coding-agent permissions',
      method: 'PUT',
      path: '/orgs/{org}/copilot/coding-agent/permissions',
    },
    {
      label: 'Update coding-agent repository access',
      method: 'PUT',
      path: '/orgs/{org}/copilot/coding-agent/permissions/repositories',
    },
  ],
  GHEC_ONLY
);

const BUDGET_CREATE_REMEDIATION = apiExplorer(
  'high',
  'A budget requires an owner-approved scope, amount, enforcement decision, and alert-recipient plan.',
  [{
    label: 'Create an enterprise budget',
    method: 'POST',
    path: '/enterprises/{enterprise}/settings/billing/budgets',
  }],
  GHEC_ONLY
);

const BUDGET_UPDATE_REMEDIATION = apiExplorer(
  'high',
  'Budget changes require the current budget identifier and a deliberate financial-control decision.',
  [{
    label: 'Update an enterprise budget',
    method: 'PATCH',
    path: '/enterprises/{enterprise}/settings/billing/budgets/{budget_id}',
  }],
  GHEC_ONLY
);

const COST_CENTER_REMEDIATION = apiExplorer(
  'high',
  'Cost-center resource changes require a confirmed cost center, resource type, and billing owner.',
  [
    {
      label: 'Add a cost-center resource',
      method: 'POST',
      path: '/enterprises/{enterprise}/settings/billing/cost-centers/{cost_center_id}/resource',
    },
    {
      label: 'Remove a cost-center resource',
      method: 'DELETE',
      path: '/enterprises/{enterprise}/settings/billing/cost-centers/{cost_center_id}/resource',
    },
  ],
  GHEC_ONLY
);

export const ASSESSMENT_REMEDIATION_REGISTRY = {
  'enterprise-owner-inventory-empty': ENTERPRISE_OWNER_REMEDIATION,
  'enterprise-owner-single-point-of-failure': ENTERPRISE_OWNER_REMEDIATION,
  'organization-default-repository-admin': ORGANIZATION_BASE_PERMISSION_REMEDIATION,
  'organization-default-repository-write': ORGANIZATION_BASE_PERMISSION_REMEDIATION,
  'organization-public-repository-creation-enabled': ORGANIZATION_SETTINGS_REMEDIATION,
  'outside-collaborator-review': OUTSIDE_COLLABORATOR_REMEDIATION,
  'outside-collaborator-privileged-repository-access': REPOSITORY_COLLABORATOR_REMEDIATION,
  'direct-privileged-repository-access': REPOSITORY_COLLABORATOR_REMEDIATION,
  'direct-write-repository-access-review': REPOSITORY_COLLABORATOR_REMEDIATION,
  'stale-active-repositories': REPOSITORY_SETTINGS_REMEDIATION,
  'public-repository-review': REPOSITORY_SETTINGS_REMEDIATION,
  'default-branch-protection-missing': RULESET_CREATE_REMEDIATION,
  'default-branch-review-controls-incomplete': RULESET_UPDATE_REMEDIATION,
  'default-branch-status-checks-missing': RULESET_UPDATE_REMEDIATION,
  'default-branch-history-controls-incomplete': RULESET_UPDATE_REMEDIATION,
  'ruleset-broad-unconditional-bypass': RULESET_UPDATE_REMEDIATION,
  'ruleset-scoped-unconditional-bypass-review': RULESET_UPDATE_REMEDIATION,
  'security-defaults-missing': SECURITY_DEFAULT_REMEDIATION,
  'security-defaults-incomplete-visibility-coverage': SECURITY_DEFAULT_REMEDIATION,
  'security-defaults-core-features-disabled': SECURITY_DEFAULT_REMEDIATION,
  'repository-security-core-features-disabled': REPOSITORY_SECURITY_REMEDIATION,
  'repository-security-configuration-unassigned': REPOSITORY_SECURITY_REMEDIATION,
  'actions-unrestricted-sources': ACTIONS_SOURCE_REMEDIATION,
  'actions-sha-pinning-not-required': ACTIONS_SOURCE_REMEDIATION,
  'actions-selected-policy-broad-patterns': ACTIONS_SOURCE_REMEDIATION,
  'actions-default-workflow-write-permissions': ACTIONS_WORKFLOW_REMEDIATION,
  'actions-workflows-can-approve-pull-requests': ACTIONS_WORKFLOW_REMEDIATION,
  'actions-private-fork-workflows-receive-privileged-data': ACTIONS_FORK_REMEDIATION,
  'actions-private-fork-workflows-run-without-approval': ACTIONS_FORK_REMEDIATION,
  'actions-runner-groups-allow-public-repositories': ACTIONS_RUNNER_REMEDIATION,
  'actions-runner-groups-broadly-accessible': ACTIONS_RUNNER_REMEDIATION,
  'actions-self-hosted-runners-offline': ACTIONS_RUNNER_REMEDIATION,
  'copilot-inactive-seats': COPILOT_SEAT_REMEDIATION,
  'copilot-assign-all-seat-management': COPILOT_ASSIGNMENT_REMEDIATION,
  'copilot-public-code-suggestions-review': COPILOT_PUBLIC_CODE_REMEDIATION,
  'copilot-coding-agent-all-repositories': COPILOT_CODING_AGENT_REMEDIATION,
  'billing-budgets-missing': BUDGET_CREATE_REMEDIATION,
  'billing-budget-enforcement-disabled': BUDGET_UPDATE_REMEDIATION,
  'billing-budget-alerting-disabled': BUDGET_UPDATE_REMEDIATION,
  'billing-budget-alert-recipients-missing': BUDGET_UPDATE_REMEDIATION,
  'billing-empty-active-cost-centers': COST_CENTER_REMEDIATION,
  'billing-budget-cost-center-not-found': BUDGET_UPDATE_REMEDIATION,
} satisfies Record<AssessmentFindingRuleKey, AssessmentRemediationDefinition>;

export function getAssessmentRemediationDefinition(
  ruleKey: string
): AssessmentRemediationDefinition | null {
  return isAssessmentFindingRuleKey(ruleKey)
    ? ASSESSMENT_REMEDIATION_REGISTRY[ruleKey]
    : null;
}

export function isAssessmentFindingRuleKey(
  ruleKey: string
): ruleKey is AssessmentFindingRuleKey {
  return Object.prototype.hasOwnProperty.call(ASSESSMENT_REMEDIATION_REGISTRY, ruleKey);
}

export function getGitHubProduct(baseUrl: string): GitHubProduct {
  return baseUrl.toLowerCase().includes('api.github.com') ? 'ghec' : 'ghes';
}

export function supportsRemediationProduct(
  definition: AssessmentRemediationDefinition,
  baseUrl: string
): boolean {
  return definition.supportedProducts.includes(getGitHubProduct(baseUrl));
}

export interface RemediationCatalogGap {
  method: HttpMethod;
  path: string;
  ruleKeys: AssessmentFindingRuleKey[];
}

export function findRemediationCatalogGaps(
  endpoints: readonly { method: string; path: string }[],
  product: GitHubProduct
): RemediationCatalogGap[] {
  const importedRoutes = new Set(
    endpoints.map(endpoint => `${endpoint.method.toUpperCase()} ${endpoint.path}`)
  );
  const expectedRoutes = new Map<string, RemediationCatalogGap>();

  for (const [ruleKey, definition] of Object.entries(ASSESSMENT_REMEDIATION_REGISTRY) as Array<
    [AssessmentFindingRuleKey, AssessmentRemediationDefinition]
  >) {
    if (!definition.supportedProducts.includes(product)) continue;

    for (const target of definition.apiTargets) {
      const routeKey = `${target.method} ${target.path}`;
      const existing = expectedRoutes.get(routeKey);
      if (existing) {
        existing.ruleKeys.push(ruleKey);
      } else {
        expectedRoutes.set(routeKey, {
          method: target.method,
          path: target.path,
          ruleKeys: [ruleKey],
        });
      }
    }
  }

  return [...expectedRoutes.entries()]
    .filter(([routeKey]) => !importedRoutes.has(routeKey))
    .map(([, gap]) => gap)
    .sort((left, right) => (
      left.path.localeCompare(right.path) || left.method.localeCompare(right.method)
    ));
}

export function resolveRemediationPathValues(
  path: string,
  context: RemediationHandoffContext
): Record<string, string> {
  const values: Record<string, string> = {};
  if (path.includes('{enterprise}') && context.enterpriseSlug) {
    values.enterprise = context.enterpriseSlug;
  }

  const resource = context.affectedResource?.trim() ?? '';
  const repositoryMatch = resource.match(/^([^/:]+)\/([^/:]+)$/);
  if (path.includes('{owner}') && repositoryMatch) {
    values.owner = repositoryMatch[1];
  }
  if (path.includes('{repo}') && repositoryMatch) {
    values.repo = repositoryMatch[2];
  }
  if (path.includes('{org}')) {
    if (resource && !resource.includes('/') && !resource.includes(':')) {
      values.org = resource;
    } else if (repositoryMatch) {
      values.org = repositoryMatch[1];
    } else if (context.defaultOrganization) {
      values.org = context.defaultOrganization;
    }
  }
  return values;
}

export function getUnresolvedRemediationParameters(
  path: string,
  pathValues: Record<string, string>
): string[] {
  const parameterNames = Array.from(path.matchAll(/\{([\w-]+)\}/g), match => match[1]);
  return parameterNames.filter(name => !pathValues[name]);
}

export function createRemediationHandoffUrl(
  ruleKey: string,
  target: RemediationApiTarget,
  context: RemediationHandoffContext
): string {
  if (!isAssessmentFindingRuleKey(ruleKey)) {
    throw new Error(`Unknown remediation rule ${ruleKey}`);
  }
  const definition = ASSESSMENT_REMEDIATION_REGISTRY[ruleKey];
  const registeredTarget = definition.apiTargets.find(candidate => (
    candidate.method === target.method && candidate.path === target.path
  ));
  if (!registeredTarget) {
    throw new Error(`API target is not registered for remediation rule ${ruleKey}`);
  }

  const payload: RemediationHandoffPayload = {
    version: 1,
    ruleKey,
    method: registeredTarget.method,
    path: registeredTarget.path,
    label: registeredTarget.label,
    pathValues: resolveRemediationPathValues(registeredTarget.path, context),
  };
  return `/?remediation=${encodeURIComponent(JSON.stringify(payload))}`;
}

export function parseRemediationHandoff(
  serialized: string
): RemediationHandoffParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return { ok: false, error: 'Remediation handoff is not valid JSON.' };
  }

  if (!isRecord(parsed) || parsed.version !== 1) {
    return { ok: false, error: 'Remediation handoff version is unsupported.' };
  }
  if (
    typeof parsed.ruleKey !== 'string'
    || typeof parsed.method !== 'string'
    || typeof parsed.path !== 'string'
    || typeof parsed.label !== 'string'
    || !isStringRecord(parsed.pathValues)
  ) {
    return { ok: false, error: 'Remediation handoff fields are invalid.' };
  }

  if (!isAssessmentFindingRuleKey(parsed.ruleKey)) {
    return { ok: false, error: 'Remediation handoff does not match a registered API target.' };
  }

  const definition = ASSESSMENT_REMEDIATION_REGISTRY[parsed.ruleKey];
  const target = definition.apiTargets.find(candidate => (
    candidate.method === parsed.method && candidate.path === parsed.path
  ));
  if (!target) {
    return { ok: false, error: 'Remediation handoff does not match a registered API target.' };
  }

  return {
    ok: true,
    value: {
      version: 1,
      ruleKey: parsed.ruleKey,
      method: target.method,
      path: target.path,
      label: target.label,
      pathValues: parsed.pathValues,
      body: target.body ? { ...target.body } : undefined,
    },
  };
}

export function readRemediationValue(body: unknown, fieldPath: string): unknown {
  let current = body;
  for (const segment of fieldPath.split('.')) {
    if (!isRecord(current) || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
}

export function formatRemediationValue(value: unknown): string {
  if (value === undefined) return 'Not returned';
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(entry => typeof entry === 'string');
}
