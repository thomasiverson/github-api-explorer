export interface AssessmentOrganization {
  githubId: number;
  nodeId: string;
  login: string;
  description: string | null;
}

export function formatScimRoleLabel(role: string): string {
  return SCIM_ROLE_LABELS[role.toLowerCase()] ?? role;
}

export interface AssessmentMember {
  login: string;
  name: string | null;
  isOwner: boolean;
}

export interface AssessmentIdentity {
  members: AssessmentMember[];
  ownerLogins: string[];
}

export interface AssessmentOrganizationAccess {
  organizationLogin: string;
  defaultRepositoryPermission: string | null;
  membersCanCreateRepositories: boolean | null;
  membersCanCreatePublicRepositories: boolean | null;
  membersCanCreatePrivateRepositories: boolean | null;
  membersCanCreateInternalRepositories: boolean | null;
  membersCanForkPrivateRepositories: boolean | null;
  twoFactorRequirementEnabled: boolean | null;
  adminLogins: string[] | null;
  outsideCollaboratorLogins: string[] | null;
}

export type AssessmentOrganizationAccessCheck =
  | 'settings'
  | 'administrators'
  | 'outside-collaborators';

export interface AssessmentOrganizationAccessFailure {
  organizationLogin: string;
  check: AssessmentOrganizationAccessCheck;
  error: string;
}

export interface AssessmentOrganizationAccessCollection {
  items: AssessmentOrganizationAccess[];
  failures: AssessmentOrganizationAccessFailure[];
}

export interface AssessmentDirectCollaborator {
  login: string;
  roleName: string;
  permission: 'admin' | 'maintain' | 'write' | 'triage' | 'read' | 'unknown';
}

export interface AssessmentRepositoryTeamGrant {
  slug: string;
  name: string;
  permission: string;
}

export interface AssessmentRepositoryAccess {
  nameWithOwner: string;
  visibility: string;
  isArchived: boolean;
  isFork: boolean;
  directCollaborators: AssessmentDirectCollaborator[] | null;
  teamGrants: AssessmentRepositoryTeamGrant[] | null;
}

export type AssessmentRepositoryAccessCheck = 'direct-collaborators' | 'team-grants';

export interface AssessmentRepositoryAccessFailure {
  nameWithOwner: string;
  check: AssessmentRepositoryAccessCheck;
  error: string;
}

export interface AssessmentRepositoryAccessCollection {
  items: AssessmentRepositoryAccess[];
  failures: AssessmentRepositoryAccessFailure[];
}

export interface AssessmentScimIdentity {
  scimId: string;
  userName: string;
  displayName: string | null;
  active: boolean;
  roles: string[];
}

export interface AssessmentScimInventory {
  totalResults: number;
  identities: AssessmentScimIdentity[];
}

export interface AssessmentRepository {
  githubId: number;
  nodeId: string;
  organizationLogin: string;
  nameWithOwner: string;
  visibility: string;
  isArchived: boolean;
  isFork: boolean;
  updatedAt: string;
}

export interface AssessmentTeam {
  githubId: number;
  nodeId: string;
  organizationLogin: string;
  slug: string;
  name: string;
  privacy: string;
}

export interface AssessmentCollectionFailure {
  organizationLogin: string;
  error: string;
}

export interface AssessmentResourceCollection<T> {
  items: T[];
  failures: AssessmentCollectionFailure[];
}

export interface AssessmentSecurityDefault {
  defaultForNewRepositories: string;
  configurationId: number;
  configurationName: string;
  advancedSecurity: string;
  dependencyGraph: string;
  dependabotAlerts: string;
  codeScanningDefaultSetup: string;
  secretScanning: string;
  secretScanningPushProtection: string;
  enforcement: string;
}

export type AssessmentRepositorySecurityCheck =
  | 'features'
  | 'code-scanning-default-setup'
  | 'dependabot-alerts'
  | 'configuration';

export interface AssessmentRepositorySecurity {
  nameWithOwner: string;
  visibility: string;
  isArchived: boolean;
  isFork: boolean;
  defaultBranch: string | null;
  codeSecurity: string | null;
  codeScanningDefaultSetup: string | null;
  secretScanning: string | null;
  secretScanningPushProtection: string | null;
  dependabotAlerts: string | null;
  dependabotSecurityUpdates: string | null;
  configurationStatus: string | null;
  configurationId: number | null;
  configurationName: string | null;
  configurationEnforcement: string | null;
}

export interface AssessmentRepositorySecurityFailure {
  nameWithOwner: string;
  check: AssessmentRepositorySecurityCheck;
  error: string;
}

export interface AssessmentRepositorySecurityCollection {
  items: AssessmentRepositorySecurity[];
  failures: AssessmentRepositorySecurityFailure[];
}

export type AssessmentRepositoryRulesCheck =
  | 'default-branch'
  | 'effective-rules'
  | 'classic-protection';

export interface AssessmentRepositoryRules {
  nameWithOwner: string;
  visibility: string;
  isArchived: boolean;
  isFork: boolean;
  defaultBranch: string | null;
  branchExists: boolean | null;
  classicProtection: boolean | null;
  hasProtection: boolean | null;
  activeRulesetIds: number[] | null;
  activeRulesetSources: string[] | null;
  activeRulesets: AssessmentRulesetReference[] | null;
  ruleTypes: string[] | null;
  requiresPullRequest: boolean | null;
  requiredApprovingReviewCount: number | null;
  requiresStatusChecks: boolean | null;
  blocksForcePushes: boolean | null;
  blocksDeletions: boolean | null;
  enforcesAdmins: boolean | null;
}

export interface AssessmentRepositoryRulesFailure {
  nameWithOwner: string;
  check: AssessmentRepositoryRulesCheck;
  error: string;
}

export interface AssessmentRepositoryRulesCollection {
  items: AssessmentRepositoryRules[];
  failures: AssessmentRepositoryRulesFailure[];
}

export interface AssessmentRepositoryRulesRequests {
  getEffectiveRules: (
    owner: string,
    repo: string,
    branch: string,
    page: number,
    perPage: number
  ) => Promise<AssessmentRestResponse>;
  getClassicProtection: (
    owner: string,
    repo: string,
    branch: string
  ) => Promise<AssessmentRestResponse>;
}

export interface AssessmentRulesetReference {
  githubId: number;
  sourceType: string;
  source: string;
}

export interface AssessmentRulesetCondition {
  type: string;
  include: string[];
  exclude: string[];
}

export interface AssessmentRulesetBypassActor {
  actorId: number | null;
  actorType: string;
  bypassMode: string;
}

export interface AssessmentRulesetDetail {
  githubId: number;
  name: string;
  target: string;
  sourceType: string;
  source: string;
  enforcement: string;
  conditions: AssessmentRulesetCondition[];
  ruleTypes: string[];
  appliedRepositories: string[];
  bypassActors: AssessmentRulesetBypassActor[];
}

export interface AssessmentRulesetDetailFailure extends AssessmentRulesetReference {
  error: string;
}

export interface AssessmentRulesetDetailCollection {
  items: AssessmentRulesetDetail[];
  failures: AssessmentRulesetDetailFailure[];
}

export type AssessmentRulesetDetailRequest = (
  reference: AssessmentRulesetReference
) => Promise<AssessmentRestResponse>;

export interface AssessmentActionsPolicy {
  enabledOrganizations: string;
  allowedActions: string;
  shaPinningRequired: boolean;
}

export interface AssessmentActionsSelectedPolicy {
  githubOwnedAllowed: boolean | null;
  verifiedAllowed: boolean | null;
  patternsAllowed: string[] | null;
}

export interface AssessmentActionsWorkflowPermissions {
  defaultWorkflowPermissions: string;
  canApprovePullRequestReviews: boolean;
}

export interface AssessmentActionsForkPullRequestPolicy {
  runWorkflowsFromForkPullRequests: boolean;
  sendWriteTokensToWorkflows: boolean;
  sendSecretsAndVariables: boolean;
  requireApprovalForForkPullRequestWorkflows: boolean;
}

export interface AssessmentSelfHostedRunnerPolicy {
  disabledForAllOrganizations: boolean;
}

export interface AssessmentRunnerGroup {
  githubId: number;
  name: string;
  visibility: string;
  isDefault: boolean;
  allowsPublicRepositories: boolean;
  restrictedToWorkflows: boolean | null;
  selectedWorkflows: string[] | null;
}

export interface AssessmentRunner {
  githubId: number;
  runnerGroupId: number | null;
  name: string;
  os: string;
  status: string;
  busy: boolean;
  ephemeral: boolean;
  version: string | null;
  labels: string[];
}

export type AssessmentActionsCheck =
  | 'selected-actions'
  | 'workflow-permissions'
  | 'fork-pull-request-workflows'
  | 'self-hosted-runner-policy'
  | 'runner-groups'
  | 'self-hosted-runners';

export interface AssessmentActionsFailure {
  check: AssessmentActionsCheck;
  error: string;
}

export interface AssessmentActionsEvidence {
  selectedActions: AssessmentActionsSelectedPolicy | null;
  workflowPermissions: AssessmentActionsWorkflowPermissions | null;
  forkPullRequestPolicy: AssessmentActionsForkPullRequestPolicy | null;
  selfHostedRunnerPolicy: AssessmentSelfHostedRunnerPolicy | null;
  runnerGroups: AssessmentRunnerGroup[] | null;
  runners: AssessmentRunner[] | null;
  failures: AssessmentActionsFailure[];
}

export interface AssessmentCopilotSeat {
  login: string;
  planType: string;
  createdAt: string;
  lastAuthenticatedAt: string | null;
  lastActivityAt: string | null;
  lastActivityEditor: string | null;
  pendingCancellationDate: string | null;
  assignmentCount: number;
  assignmentSources: AssessmentCopilotAssignmentSource[];
}

export interface AssessmentCopilotAssignmentSource {
  organization: string | null;
  team: string | null;
  teamType: string | null;
}

export interface AssessmentCopilotSeatInventory {
  totalSeats: number;
  rawAssignmentCount: number;
  seats: AssessmentCopilotSeat[];
}

export interface AssessmentCopilotOrganization {
  organizationLogin: string;
  seatTotal: number | null;
  seatsAddedThisCycle: number | null;
  seatsPendingCancellation: number | null;
  seatsPendingInvitation: number | null;
  activeSeatsThisCycle: number | null;
  inactiveSeatsThisCycle: number | null;
  planType: string | null;
  seatManagementSetting: string | null;
  publicCodeSuggestions: string | null;
  ideChat: string | null;
  platformChat: string | null;
  cli: string | null;
  codingAgentRepositoryScope: string | null;
}

export type AssessmentCopilotCheck =
  | 'content-exclusion'
  | 'organization-settings'
  | 'coding-agent';

export interface AssessmentCopilotFailure {
  scope: string;
  check: AssessmentCopilotCheck;
  error: string;
}

export interface AssessmentCopilotEvidence {
  contentExclusionRuleCount: number | null;
  organizations: AssessmentCopilotOrganization[];
  failures: AssessmentCopilotFailure[];
}

export interface AssessmentBudget {
  id: string;
  budgetType: string;
  productSku: string;
  scope: string;
  amount: number;
  consumedAmount: number | null;
  preventsFurtherUsage: boolean;
  alertingEnabled: boolean;
  alertRecipientCount: number;
  alertRecipients: string[];
  entityName: string | null;
  user: string | null;
  expiresAt: string | null;
}

export interface AssessmentCostCenterResource {
  type: string;
  name: string;
}

export interface AssessmentCostCenter {
  id: string;
  name: string;
  state: string;
  azureSubscription: string | null;
  aiCreditPoolEnabled: boolean;
  aiCreditPoolTargetAmount: number | null;
  aiCreditPoolCurrentAmount: number | null;
  resources: AssessmentCostCenterResource[] | null;
}

export interface AssessmentEffectiveBudget {
  user: string;
  budgetId: string | null;
  amount: number | null;
  consumedAmount: number | null;
  applicableBudgetIds: string[];
}

export interface AssessmentBudgetUserState {
  budgetId: string;
  user: string;
  consumedAmount: number;
  targetAmount: number;
  overrideBudgetId: string | null;
}

export interface AssessmentBillingUsageItem {
  product: string;
  sku: string;
  unitType: string;
  grossQuantity: number;
  grossAmount: number;
  discountQuantity: number;
  discountAmount: number;
  netQuantity: number;
  netAmount: number;
}

export interface AssessmentBillingUsage {
  year: number;
  month: number | null;
  day: number | null;
  items: AssessmentBillingUsageItem[];
}

export type AssessmentBillingCheck =
  | 'cost-centers'
  | 'cost-center-resources'
  | 'effective-budget'
  | 'multi-user-budget-states'
  | 'usage-summary';

export interface AssessmentBillingFailure {
  scope: string;
  check: AssessmentBillingCheck;
  error: string;
}

export interface AssessmentBillingEvidence {
  costCenters: AssessmentCostCenter[];
  effectiveBudgets: AssessmentEffectiveBudget[];
  multiUserBudgetStates: AssessmentBudgetUserState[];
  usage: AssessmentBillingUsage | null;
  failures: AssessmentBillingFailure[];
}

export type AssessmentSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AssessmentDomain =
  | 'identity'
  | 'repositories'
  | 'security'
  | 'actions'
  | 'copilot'
  | 'billing';
export type AssessmentDomainScores = Partial<Record<AssessmentDomain, number>>;

export interface AssessmentFindingEvidenceSource {
  collectorKey: string;
  label: string;
  endpoint: string;
}

export interface AssessmentFinding {
  ruleKey: string;
  domain: AssessmentDomain;
  severity: AssessmentSeverity;
  title: string;
  summary: string;
  recommendation: string;
  affectedResources: string[];
  expectedState: string;
  evidenceSources: AssessmentFindingEvidenceSource[];
}

export interface AssessmentEvaluation {
  healthScore: number;
  assessedDomainCount: number;
  domainScores: AssessmentDomainScores;
  findings: AssessmentFinding[];
  metrics: Record<string, number>;
}

export type AssessmentGraphqlRequest = (
  query: string,
  variables: Record<string, unknown>
) => Promise<unknown>;

export type AssessmentRestRequest = () => Promise<unknown>;
export type AssessmentPagedRestRequest = (page: number, perPage: number) => Promise<unknown>;
export interface AssessmentRestResponse {
  status: number;
  data: unknown;
}

export interface AssessmentOrganizationAccessRequests {
  getOrganization: (organizationLogin: string) => Promise<AssessmentRestResponse>;
  getAdministrators: (
    organizationLogin: string,
    page: number,
    perPage: number
  ) => Promise<AssessmentRestResponse>;
  getOutsideCollaborators: (
    organizationLogin: string,
    page: number,
    perPage: number
  ) => Promise<AssessmentRestResponse>;
}

export interface AssessmentRepositoryAccessRequests {
  getDirectCollaborators: (
    owner: string,
    repo: string,
    page: number,
    perPage: number
  ) => Promise<AssessmentRestResponse>;
  getTeamGrants: (
    owner: string,
    repo: string,
    page: number,
    perPage: number
  ) => Promise<AssessmentRestResponse>;
}

export type AssessmentScimRequest = (
  startIndex: number,
  count: number
) => Promise<AssessmentRestResponse>;

export interface AssessmentRepositorySecurityRequests {
  getRepository: (owner: string, repo: string) => Promise<AssessmentRestResponse>;
  getCodeScanningDefaultSetup: (owner: string, repo: string) => Promise<AssessmentRestResponse>;
  checkDependabotAlerts: (owner: string, repo: string) => Promise<AssessmentRestResponse>;
  getConfiguration: (owner: string, repo: string) => Promise<AssessmentRestResponse>;
}

export interface AssessmentActionsRequests {
  getSelectedActions: () => Promise<AssessmentRestResponse>;
  getWorkflowPermissions: () => Promise<AssessmentRestResponse>;
  getForkPullRequestPolicy: () => Promise<AssessmentRestResponse>;
  getSelfHostedRunnerPolicy: () => Promise<AssessmentRestResponse>;
  getRunnerGroups: (page: number, perPage: number) => Promise<AssessmentRestResponse>;
  getRunners: (page: number, perPage: number) => Promise<AssessmentRestResponse>;
}

export interface AssessmentCopilotRequests {
  getContentExclusion: () => Promise<AssessmentRestResponse>;
  getOrganizationSettings: (
    organizationLogin: string
  ) => Promise<AssessmentRestResponse>;
  getCodingAgentPermissions: (
    organizationLogin: string
  ) => Promise<AssessmentRestResponse>;
}

export interface AssessmentBillingRequests {
  getCostCenters: () => Promise<AssessmentRestResponse>;
  getCostCenter: (
    costCenterId: string,
    page: number,
    perPage: number
  ) => Promise<AssessmentRestResponse>;
  getEffectiveBudget: (
    user: string,
    page: number,
    perPage: number
  ) => Promise<AssessmentRestResponse>;
  getBudgetUserStates: (
    budgetId: string,
    page: number,
    perPage: number
  ) => Promise<AssessmentRestResponse>;
  getUsageSummary: () => Promise<AssessmentRestResponse>;
}

const STALE_REPOSITORY_DAYS = 365;
const COPILOT_ACTIVITY_DAYS = 30;
const REST_PAGE_SIZE = 100;
const SEVERITY_IMPACT: Record<AssessmentSeverity, number> = {
  critical: 30,
  high: 20,
  medium: 10,
  low: 5,
};

const EVIDENCE_SOURCES = {
  identity: {
    collectorKey: 'identity',
    label: 'Enterprise member and owner inventory',
    endpoint: 'GraphQL Enterprise.members',
  },
  repositories: {
    collectorKey: 'repositories',
    label: 'Organization repository inventory',
    endpoint: 'GraphQL Organization.repositories',
  },
  organizationAccess: {
    collectorKey: 'organizationAccess',
    label: 'Organization access settings and collaborators',
    endpoint: 'REST GET /orgs/{org}, /orgs/{org}/members, and /orgs/{org}/outside_collaborators',
  },
  repositoryAccess: {
    collectorKey: 'repositoryAccess',
    label: 'Repository collaborators and team grants',
    endpoint: 'REST GET /repos/{owner}/{repo}/collaborators and /repos/{owner}/{repo}/teams',
  },
  repositoryRules: {
    collectorKey: 'repositoryRules',
    label: 'Effective default-branch controls',
    endpoint: 'REST GET /repos/{owner}/{repo}/rules/branches/{branch} and /branches/{branch}/protection',
  },
  rulesetDetails: {
    collectorKey: 'rulesetDetails',
    label: 'Active ruleset details and bypass actors',
    endpoint: 'REST GET enterprise, organization, and repository ruleset details',
  },
  securityDefaults: {
    collectorKey: 'security',
    label: 'Enterprise security configuration defaults',
    endpoint: 'REST GET /enterprises/{enterprise}/code-security/configurations/defaults',
  },
  repositorySecurity: {
    collectorKey: 'repositorySecurity',
    label: 'Repository security features and configuration',
    endpoint: 'REST repository, code-scanning, vulnerability-alert, and code-security-configuration APIs',
  },
  actionsPolicy: {
    collectorKey: 'actions',
    label: 'Enterprise Actions policy',
    endpoint: 'REST GET /enterprises/{enterprise}/actions/permissions',
  },
  actionsSelected: {
    collectorKey: 'actionsDepth',
    label: 'Selected Actions allow list',
    endpoint: 'REST GET /enterprises/{enterprise}/actions/permissions/selected-actions',
  },
  actionsWorkflow: {
    collectorKey: 'actionsDepth',
    label: 'Workflow token policy',
    endpoint: 'REST GET /enterprises/{enterprise}/actions/permissions/workflow',
  },
  actionsForks: {
    collectorKey: 'actionsDepth',
    label: 'Private-fork workflow policy',
    endpoint: 'REST GET /enterprises/{enterprise}/actions/permissions/fork-pr-workflows-private-repos',
  },
  actionsRunners: {
    collectorKey: 'actionsDepth',
    label: 'Enterprise runner groups and self-hosted runners',
    endpoint: 'REST GET /enterprises/{enterprise}/actions/runner-groups and /actions/runners',
  },
  copilotSeats: {
    collectorKey: 'copilot',
    label: 'Enterprise Copilot seat activity',
    endpoint: 'REST GET /enterprises/{enterprise}/copilot/billing/seats',
  },
  copilotOrganization: {
    collectorKey: 'copilotDepth',
    label: 'Organization Copilot policy',
    endpoint: 'REST GET /orgs/{org}/copilot/billing',
  },
  copilotCodingAgent: {
    collectorKey: 'copilotDepth',
    label: 'Copilot coding-agent repository policy',
    endpoint: 'REST GET /orgs/{org}/copilot/coding-agent/permissions',
  },
  budgets: {
    collectorKey: 'billing',
    label: 'Enterprise budget inventory',
    endpoint: 'REST GET /enterprises/{enterprise}/settings/billing/budgets',
  },
  costCenters: {
    collectorKey: 'billingDepth',
    label: 'Active cost centers and assigned resources',
    endpoint: 'REST GET /enterprises/{enterprise}/settings/billing/cost-centers',
  },
} satisfies Record<string, AssessmentFindingEvidenceSource>;

interface AssessmentFindingEvidenceDefinition {
  expectedState: string;
  evidenceSources: AssessmentFindingEvidenceSource[];
}

const FINDING_EVIDENCE_DEFINITIONS: Record<string, AssessmentFindingEvidenceDefinition> = {
  'enterprise-owner-inventory-empty': {
    expectedState: 'At least two active enterprise owners are discoverable to the assessment credential.',
    evidenceSources: [EVIDENCE_SOURCES.identity],
  },
  'enterprise-owner-single-point-of-failure': {
    expectedState: 'At least two separately managed, active enterprise owners are assigned.',
    evidenceSources: [EVIDENCE_SOURCES.identity],
  },
  'organization-default-repository-admin': {
    expectedState: 'Organization base repository permission is read or none.',
    evidenceSources: [EVIDENCE_SOURCES.organizationAccess],
  },
  'organization-default-repository-write': {
    expectedState: 'Organization base repository permission is read or none.',
    evidenceSources: [EVIDENCE_SOURCES.organizationAccess],
  },
  'organization-public-repository-creation-enabled': {
    expectedState: 'Public repository creation is restricted or governed by a documented disclosure review.',
    evidenceSources: [EVIDENCE_SOURCES.organizationAccess],
  },
  'outside-collaborator-review': {
    expectedState: 'Every outside collaborator has a current sponsor, limited access, and a periodic review date.',
    evidenceSources: [EVIDENCE_SOURCES.organizationAccess],
  },
  'outside-collaborator-privileged-repository-access': {
    expectedState: 'Outside collaborators do not hold direct administrator or maintain repository access.',
    evidenceSources: [EVIDENCE_SOURCES.organizationAccess, EVIDENCE_SOURCES.repositoryAccess],
  },
  'direct-privileged-repository-access': {
    expectedState: 'Durable administrator and maintain access is granted through governed teams.',
    evidenceSources: [EVIDENCE_SOURCES.repositoryAccess],
  },
  'direct-write-repository-access-review': {
    expectedState: 'Durable write access is granted through governed teams rather than direct user grants.',
    evidenceSources: [EVIDENCE_SOURCES.repositoryAccess],
  },
  'stale-active-repositories': {
    expectedState: `Active repositories are updated within ${STALE_REPOSITORY_DAYS} days or have documented ownership and retention.`,
    evidenceSources: [EVIDENCE_SOURCES.repositories],
  },
  'public-repository-review': {
    expectedState: 'Every public repository has an active owner and documented approval for public disclosure.',
    evidenceSources: [EVIDENCE_SOURCES.repositories],
  },
  'default-branch-protection-missing': {
    expectedState: 'Every existing default branch is protected by active ruleset rules or classic branch protection.',
    evidenceSources: [EVIDENCE_SOURCES.repositoryRules],
  },
  'default-branch-review-controls-incomplete': {
    expectedState: 'Protected default branches require pull requests and at least one approving review.',
    evidenceSources: [EVIDENCE_SOURCES.repositoryRules],
  },
  'default-branch-status-checks-missing': {
    expectedState: 'Protected default branches require trusted build, test, and security status checks.',
    evidenceSources: [EVIDENCE_SOURCES.repositoryRules],
  },
  'default-branch-history-controls-incomplete': {
    expectedState: 'Protected default branches block force pushes and branch deletion.',
    evidenceSources: [EVIDENCE_SOURCES.repositoryRules],
  },
  'ruleset-broad-unconditional-bypass': {
    expectedState: 'Active rulesets do not grant broad roles an always or exempt bypass.',
    evidenceSources: [EVIDENCE_SOURCES.rulesetDetails],
  },
  'ruleset-scoped-unconditional-bypass-review': {
    expectedState: 'Every unconditional principal exception has a current business need and named owner.',
    evidenceSources: [EVIDENCE_SOURCES.rulesetDetails],
  },
  'security-defaults-missing': {
    expectedState: 'An enterprise code security configuration is the default for new repositories.',
    evidenceSources: [EVIDENCE_SOURCES.securityDefaults],
  },
  'security-defaults-incomplete-visibility-coverage': {
    expectedState: 'Default security configurations cover new public, private, and internal repositories.',
    evidenceSources: [EVIDENCE_SOURCES.securityDefaults],
  },
  'security-defaults-core-features-disabled': {
    expectedState: 'Default configurations enable dependency graph, Dependabot alerts, code scanning, secret scanning, and push protection.',
    evidenceSources: [EVIDENCE_SOURCES.securityDefaults],
  },
  'repository-security-core-features-disabled': {
    expectedState: 'Applicable core repository security features are enabled or covered by a documented exception.',
    evidenceSources: [EVIDENCE_SOURCES.repositorySecurity],
  },
  'repository-security-configuration-unassigned': {
    expectedState: 'Active non-fork repositories are governed by an approved code security configuration.',
    evidenceSources: [EVIDENCE_SOURCES.repositorySecurity],
  },
  'actions-unrestricted-sources': {
    expectedState: 'Actions are limited to enterprise-owned or explicitly approved sources.',
    evidenceSources: [EVIDENCE_SOURCES.actionsPolicy],
  },
  'actions-sha-pinning-not-required': {
    expectedState: 'Workflow dependencies are required to use full-length immutable commit SHA references.',
    evidenceSources: [EVIDENCE_SOURCES.actionsPolicy],
  },
  'actions-selected-policy-broad-patterns': {
    expectedState: 'The selected Actions allow list contains only explicitly approved, scoped patterns.',
    evidenceSources: [EVIDENCE_SOURCES.actionsSelected],
  },
  'actions-default-workflow-write-permissions': {
    expectedState: 'The default GITHUB_TOKEN permission is read, with write scopes granted explicitly.',
    evidenceSources: [EVIDENCE_SOURCES.actionsWorkflow],
  },
  'actions-workflows-can-approve-pull-requests': {
    expectedState: 'Workflows cannot approve pull requests unless a documented automation exception requires it.',
    evidenceSources: [EVIDENCE_SOURCES.actionsWorkflow],
  },
  'actions-private-fork-workflows-receive-privileged-data': {
    expectedState: 'Private-fork workflows do not receive write tokens, secrets, or variables.',
    evidenceSources: [EVIDENCE_SOURCES.actionsForks],
  },
  'actions-private-fork-workflows-run-without-approval': {
    expectedState: 'Private-fork pull-request workflows require approval before they run.',
    evidenceSources: [EVIDENCE_SOURCES.actionsForks],
  },
  'actions-runner-groups-allow-public-repositories': {
    expectedState: 'Self-hosted runner groups do not accept jobs from public repositories.',
    evidenceSources: [EVIDENCE_SOURCES.actionsRunners],
  },
  'actions-runner-groups-broadly-accessible': {
    expectedState: 'Runner groups are limited to approved organizations and trusted reusable workflows.',
    evidenceSources: [EVIDENCE_SOURCES.actionsRunners],
  },
  'actions-self-hosted-runners-offline': {
    expectedState: 'Persistent registered runners are online and monitored, or removed when retired.',
    evidenceSources: [EVIDENCE_SOURCES.actionsRunners],
  },
  'copilot-inactive-seats': {
    expectedState: `Billed Copilot seats show activity within ${COPILOT_ACTIVITY_DAYS} days after the adoption window or have a documented retention need.`,
    evidenceSources: [EVIDENCE_SOURCES.copilotSeats],
  },
  'copilot-assign-all-seat-management': {
    expectedState: 'Universal Copilot seat assignment is explicitly approved and periodically reviewed for cost effectiveness.',
    evidenceSources: [EVIDENCE_SOURCES.copilotOrganization],
  },
  'copilot-public-code-suggestions-review': {
    expectedState: 'The public-code suggestion policy matches documented legal and engineering guidance.',
    evidenceSources: [EVIDENCE_SOURCES.copilotOrganization],
  },
  'copilot-coding-agent-all-repositories': {
    expectedState: 'Coding-agent access is limited to approved repositories or universal access is explicitly accepted.',
    evidenceSources: [EVIDENCE_SOURCES.copilotCodingAgent],
  },
  'billing-budgets-missing': {
    expectedState: 'Material metered products and user populations have intentional budget controls.',
    evidenceSources: [EVIDENCE_SOURCES.budgets],
  },
  'billing-budget-enforcement-disabled': {
    expectedState: 'Budgets prevent further usage at the limit or have a documented exception.',
    evidenceSources: [EVIDENCE_SOURCES.budgets],
  },
  'billing-budget-alerting-disabled': {
    expectedState: 'Shared budgets that require advance notice have alerting enabled.',
    evidenceSources: [EVIDENCE_SOURCES.budgets],
  },
  'billing-budget-alert-recipients-missing': {
    expectedState: 'Every shared alerting budget has at least one accountable recipient.',
    evidenceSources: [EVIDENCE_SOURCES.budgets],
  },
  'billing-empty-active-cost-centers': {
    expectedState: 'Every active cost center has its intended users, teams, organizations, or repositories assigned.',
    evidenceSources: [EVIDENCE_SOURCES.costCenters],
  },
  'billing-budget-cost-center-not-found': {
    expectedState: 'Every cost-center budget references a cost center in the active inventory.',
    evidenceSources: [EVIDENCE_SOURCES.budgets, EVIDENCE_SOURCES.costCenters],
  },
};

const DEFAULT_FINDING_EXPECTED_STATE =
  'The observed condition is resolved or retained as a documented, approved exception.';

export function getAssessmentFindingEvidence(
  ruleKey: string
): AssessmentFindingEvidenceDefinition {
  const definition = FINDING_EVIDENCE_DEFINITIONS[ruleKey];
  return {
    expectedState: definition?.expectedState ?? DEFAULT_FINDING_EXPECTED_STATE,
    evidenceSources: (definition?.evidenceSources ?? []).map(source => ({ ...source })),
  };
}

export function calculateAssessmentScores(
  findings: ReadonlyArray<Pick<AssessmentFinding, 'domain' | 'severity'>>,
  assessedDomains: readonly AssessmentDomain[]
): { healthScore: number; domainScores: AssessmentDomainScores } {
  const uniqueDomains = [...new Set(assessedDomains)];
  const domainScores = Object.fromEntries(
    uniqueDomains.map(domain => {
      const deduction = findings
        .filter(finding => finding.domain === domain)
        .reduce((total, finding) => total + SEVERITY_IMPACT[finding.severity], 0);
      return [domain, Math.max(0, 100 - deduction)];
    })
  ) as AssessmentDomainScores;
  const healthScore = uniqueDomains.length === 0
    ? 100
    : Math.round(
      uniqueDomains.reduce((total, domain) => total + (domainScores[domain] ?? 0), 0)
        / uniqueDomains.length
    );
  return { healthScore, domainScores };
}

const SCIM_ROLE_LABELS: Readonly<Record<string, string>> = {
  user: 'User',
  '27d9891d-2c17-4f45-a262-781a0e55c80a': 'User',
  guest_collaborator: 'Guest collaborator',
  '1ebc4a02-e56c-43a6-92a5-02ee09b90824': 'Guest collaborator',
  enterprise_owner: 'Enterprise owner',
  '981df190-8801-4618-a08a-d91f6206c954': 'Enterprise owner',
  'ba4987ab-a1c3-412a-b58c-360fc407cb10': 'Enterprise owner',
  billing_manager: 'Billing manager',
  '0e338b8c-cc7f-498a-928d-ea3470d7e7e3': 'Billing manager',
  'e6be2762-e4ad-4108-b72d-1bbe884a0f91': 'Billing manager',
};

const ENTERPRISE_ORGANIZATIONS_QUERY = `query EnterpriseOrganizations($slug: String!, $cursor: String) {
  enterprise(slug: $slug) {
    organizations(first: 100, after: $cursor) {
      nodes {
        databaseId
        id
        login
        description
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}`;

const ENTERPRISE_MEMBERS_QUERY = `query EnterpriseMembers($slug: String!, $cursor: String) {
  enterprise(slug: $slug) {
    members(first: 100, after: $cursor) {
      nodes {
        ... on EnterpriseUserAccount {
          login
          name
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}`;

const ENTERPRISE_OWNERS_QUERY = `query EnterpriseOwners($slug: String!, $cursor: String) {
  enterprise(slug: $slug) {
    ownerInfo {
      admins(first: 100, after: $cursor) {
        nodes {
          login
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}`;

const ORGANIZATION_REPOSITORIES_QUERY = `query OrganizationRepositories($login: String!, $cursor: String) {
  organization(login: $login) {
    repositories(first: 100, after: $cursor) {
      nodes {
        databaseId
        id
        nameWithOwner
        visibility
        isArchived
        isFork
        updatedAt
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}`;

const ORGANIZATION_TEAMS_QUERY = `query OrganizationTeams($login: String!, $cursor: String) {
  organization(login: $login) {
    teams(first: 100, after: $cursor) {
      nodes {
        databaseId
        id
        slug
        name
        privacy
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}`;

export async function collectEnterpriseOrganizations(
  request: AssessmentGraphqlRequest,
  enterprise: string
): Promise<AssessmentOrganization[]> {
  const organizations: AssessmentOrganization[] = [];
  let cursor: string | null = null;

  while (true) {
    const response = await request(ENTERPRISE_ORGANIZATIONS_QUERY, {
      slug: enterprise,
      cursor,
    });
    const connection = readOrganizationConnection(response);
    const pageOrganizations = connection.nodes.map(normalizeOrganization);
    organizations.push(...pageOrganizations);

    if (!connection.pageInfo.hasNextPage) break;
    if (!connection.pageInfo.endCursor) {
      throw new Error('GitHub returned an invalid organization inventory response');
    }
    cursor = connection.pageInfo.endCursor;
  }

  return organizations;
}

export async function collectEnterpriseIdentity(
  request: AssessmentGraphqlRequest,
  enterprise: string
): Promise<AssessmentIdentity> {
  const memberRecords = await collectConnection(
    request,
    ENTERPRISE_MEMBERS_QUERY,
    enterprise,
    response => readNestedConnection(response, ['enterprise', 'members'], 'member inventory')
  );
  const ownerRecords = await collectConnection(
    request,
    ENTERPRISE_OWNERS_QUERY,
    enterprise,
    response => readNestedConnection(response, ['enterprise', 'ownerInfo', 'admins'], 'owner inventory')
  );
  const ownerLogins = ownerRecords.map(record => readLogin(record, 'owner'));
  const owners = new Set(ownerLogins.map(login => login.toLowerCase()));
  const members = memberRecords.map(value => {
    if (!value || typeof value !== 'object') {
      throw new Error('GitHub returned an invalid enterprise member record');
    }
    const member = value as Record<string, unknown>;
    if (typeof member.login !== 'string') {
      throw new Error('GitHub returned an incomplete enterprise member record');
    }
    return {
      login: member.login,
      name: typeof member.name === 'string' ? member.name : null,
      isOwner: owners.has(member.login.toLowerCase()),
    };
  });

  return { members, ownerLogins };
}

export async function collectOrganizationAccess(
  requests: AssessmentOrganizationAccessRequests,
  organizationLogins: string[]
): Promise<AssessmentOrganizationAccessCollection> {
  const items: AssessmentOrganizationAccess[] = [];
  const failures: AssessmentOrganizationAccessFailure[] = [];

  for (const organizationLogin of organizationLogins) {
    const item: AssessmentOrganizationAccess = {
      organizationLogin,
      defaultRepositoryPermission: null,
      membersCanCreateRepositories: null,
      membersCanCreatePublicRepositories: null,
      membersCanCreatePrivateRepositories: null,
      membersCanCreateInternalRepositories: null,
      membersCanForkPrivateRepositories: null,
      twoFactorRequirementEnabled: null,
      adminLogins: null,
      outsideCollaboratorLogins: null,
    };

    try {
      const response = await requests.getOrganization(organizationLogin);
      if (response.status !== 200) {
        throw new Error(describeRestFailure('organization settings', response));
      }
      Object.assign(item, normalizeOrganizationAccessSettings(response.data));
    } catch (error) {
      failures.push({
        organizationLogin,
        check: 'settings',
        error: normalizeAssessmentError(error),
      });
    }

    try {
      const administrators = await collectPagedRestArray(
        (page, perPage) => requests.getAdministrators(organizationLogin, page, perPage),
        'organization administrators'
      );
      item.adminLogins = normalizeLoginRecords(administrators);
    } catch (error) {
      failures.push({
        organizationLogin,
        check: 'administrators',
        error: normalizeAssessmentError(error),
      });
    }

    try {
      const outsideCollaborators = await collectPagedRestArray(
        (page, perPage) => requests.getOutsideCollaborators(
          organizationLogin,
          page,
          perPage
        ),
        'outside collaborators'
      );
      item.outsideCollaboratorLogins = normalizeLoginRecords(outsideCollaborators);
    } catch (error) {
      failures.push({
        organizationLogin,
        check: 'outside-collaborators',
        error: normalizeAssessmentError(error),
      });
    }

    items.push(item);
  }

  return { items, failures };
}

export async function collectRepositoryAccess(
  requests: AssessmentRepositoryAccessRequests,
  repositories: AssessmentRepository[]
): Promise<AssessmentRepositoryAccessCollection> {
  const items: AssessmentRepositoryAccess[] = [];
  const failures: AssessmentRepositoryAccessFailure[] = [];

  for (const repository of repositories) {
    const [owner, repo] = repository.nameWithOwner.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository name: ${repository.nameWithOwner}`);
    }
    const item: AssessmentRepositoryAccess = {
      nameWithOwner: repository.nameWithOwner,
      visibility: repository.visibility,
      isArchived: repository.isArchived,
      isFork: repository.isFork,
      directCollaborators: null,
      teamGrants: null,
    };

    try {
      const collaborators = await collectPagedRestArray(
        (page, perPage) => requests.getDirectCollaborators(owner, repo, page, perPage),
        'direct repository collaborators'
      );
      item.directCollaborators = collaborators.map(normalizeDirectCollaborator);
    } catch (error) {
      failures.push({
        nameWithOwner: repository.nameWithOwner,
        check: 'direct-collaborators',
        error: normalizeAssessmentError(error),
      });
    }

    try {
      const teams = await collectPagedRestArray(
        (page, perPage) => requests.getTeamGrants(owner, repo, page, perPage),
        'repository team grants'
      );
      item.teamGrants = teams.map(normalizeRepositoryTeamGrant);
    } catch (error) {
      failures.push({
        nameWithOwner: repository.nameWithOwner,
        check: 'team-grants',
        error: normalizeAssessmentError(error),
      });
    }

    items.push(item);
  }

  return { items, failures };
}

export async function collectEnterpriseScim(
  request: AssessmentScimRequest
): Promise<AssessmentScimInventory> {
  const identities = new Map<string, AssessmentScimIdentity>();
  let startIndex = 1;
  let totalResults: number | null = null;

  while (true) {
    const response = await request(startIndex, REST_PAGE_SIZE);
    if (response.status !== 200) {
      throw new Error(describeRestFailure('enterprise SCIM users', response));
    }
    const page = readAssessmentObject(response.data);
    if (
      !page
      || !Number.isInteger(page.totalResults)
      || !Array.isArray(page.Resources)
    ) {
      throw new Error('GitHub returned an invalid enterprise SCIM response');
    }
    if (totalResults !== null && totalResults !== page.totalResults) {
      throw new Error('GitHub returned inconsistent enterprise SCIM totals');
    }
    totalResults = page.totalResults as number;

    for (const value of page.Resources) {
      const identity = normalizeScimIdentity(value);
      if (identities.has(identity.scimId)) {
        throw new Error(`GitHub returned duplicate SCIM identity ${identity.scimId}`);
      }
      identities.set(identity.scimId, identity);
    }
    if (identities.size >= totalResults) break;
    if (page.Resources.length === 0) {
      throw new Error('GitHub returned an incomplete enterprise SCIM page');
    }
    startIndex += page.Resources.length;
  }

  return {
    totalResults: totalResults ?? 0,
    identities: [...identities.values()].sort(
      (left, right) => left.userName.localeCompare(right.userName)
    ),
  };
}

async function collectPagedRestArray(
  request: (page: number, perPage: number) => Promise<AssessmentRestResponse>,
  label: string
): Promise<unknown[]> {
  const items: unknown[] = [];
  let page = 1;
  while (true) {
    const response = await request(page, REST_PAGE_SIZE);
    if (response.status !== 200) {
      throw new Error(describeRestFailure(label, response));
    }
    if (!Array.isArray(response.data)) {
      throw new Error(`GitHub returned an invalid ${label} response`);
    }
    items.push(...response.data);
    if (response.data.length < REST_PAGE_SIZE) break;
    page += 1;
  }
  return items;
}

function normalizeOrganizationAccessSettings(value: unknown): Partial<AssessmentOrganizationAccess> {
  const settings = readAssessmentObject(value);
  if (!settings || typeof settings.default_repository_permission !== 'string') {
    throw new Error('GitHub returned invalid organization access settings');
  }
  return {
    defaultRepositoryPermission: settings.default_repository_permission,
    membersCanCreateRepositories: readOptionalBoolean(
      settings.members_can_create_repositories,
      'members_can_create_repositories'
    ),
    membersCanCreatePublicRepositories: readOptionalBoolean(
      settings.members_can_create_public_repositories,
      'members_can_create_public_repositories'
    ),
    membersCanCreatePrivateRepositories: readOptionalBoolean(
      settings.members_can_create_private_repositories,
      'members_can_create_private_repositories'
    ),
    membersCanCreateInternalRepositories: readOptionalBoolean(
      settings.members_can_create_internal_repositories,
      'members_can_create_internal_repositories'
    ),
    membersCanForkPrivateRepositories: readOptionalBoolean(
      settings.members_can_fork_private_repositories,
      'members_can_fork_private_repositories'
    ),
    twoFactorRequirementEnabled: readOptionalBoolean(
      settings.two_factor_requirement_enabled,
      'two_factor_requirement_enabled'
    ),
  };
}

function readOptionalBoolean(value: unknown, field: string): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') {
    throw new Error(`GitHub returned an invalid ${field} setting`);
  }
  return value;
}

function normalizeLoginRecords(values: unknown[]): string[] {
  const logins = values.map(value => {
    const record = readAssessmentObject(value);
    if (!record || typeof record.login !== 'string') {
      throw new Error('GitHub returned an invalid user record');
    }
    return record.login;
  });
  return [...new Set(logins)].sort((left, right) => left.localeCompare(right));
}

function normalizeDirectCollaborator(value: unknown): AssessmentDirectCollaborator {
  const collaborator = readAssessmentObject(value);
  if (
    !collaborator
    || typeof collaborator.login !== 'string'
    || typeof collaborator.role_name !== 'string'
  ) {
    throw new Error('GitHub returned an invalid direct collaborator');
  }
  return {
    login: collaborator.login,
    roleName: collaborator.role_name,
    permission: normalizeCollaboratorPermission(collaborator),
  };
}

function normalizeCollaboratorPermission(
  collaborator: Record<string, unknown>
): AssessmentDirectCollaborator['permission'] {
  const permissions = readAssessmentObject(collaborator.permissions);
  if (permissions) {
    if (permissions.admin === true) return 'admin';
    if (permissions.maintain === true) return 'maintain';
    if (permissions.push === true) return 'write';
    if (permissions.triage === true) return 'triage';
    if (permissions.pull === true) return 'read';
  }
  const roleName = collaborator.role_name;
  if (
    roleName === 'admin'
    || roleName === 'maintain'
    || roleName === 'write'
    || roleName === 'triage'
    || roleName === 'read'
  ) {
    return roleName;
  }
  return 'unknown';
}

function normalizeRepositoryTeamGrant(value: unknown): AssessmentRepositoryTeamGrant {
  const team = readAssessmentObject(value);
  if (
    !team
    || typeof team.slug !== 'string'
    || typeof team.name !== 'string'
    || typeof team.permission !== 'string'
  ) {
    throw new Error('GitHub returned an invalid repository team grant');
  }
  return {
    slug: team.slug,
    name: team.name,
    permission: team.permission,
  };
}

function normalizeScimIdentity(value: unknown): AssessmentScimIdentity {
  const identity = readAssessmentObject(value);
  if (
    !identity
    || typeof identity.id !== 'string'
    || typeof identity.userName !== 'string'
    || typeof identity.active !== 'boolean'
    || !Array.isArray(identity.roles)
  ) {
    throw new Error('GitHub returned an invalid enterprise SCIM identity');
  }
  const roles = identity.roles.map(roleValue => {
    const role = readAssessmentObject(roleValue);
    if (!role || typeof role.value !== 'string') {
      throw new Error('GitHub returned an invalid enterprise SCIM role');
    }
    return role.value;
  });
  return {
    scimId: identity.id,
    userName: identity.userName,
    displayName: typeof identity.displayName === 'string' ? identity.displayName : null,
    active: identity.active,
    roles,
  };
}

export async function collectOrganizationRepositories(
  request: AssessmentGraphqlRequest,
  organizationLogins: string[]
): Promise<AssessmentResourceCollection<AssessmentRepository>> {
  const repositories: AssessmentRepository[] = [];
  const failures: AssessmentCollectionFailure[] = [];
  for (const organizationLogin of organizationLogins) {
    try {
      const records = await collectConnection(
        request,
        ORGANIZATION_REPOSITORIES_QUERY,
        organizationLogin,
        response => readNestedConnection(response, ['organization', 'repositories'], 'repository inventory'),
        'login'
      );
      repositories.push(...records.map(value => normalizeRepository(value, organizationLogin)));
    } catch (error) {
      failures.push({
        organizationLogin,
        error: error instanceof Error ? error.message : 'Repository collection failed',
      });
    }
  }
  return { items: repositories, failures };
}

export async function collectOrganizationTeams(
  request: AssessmentGraphqlRequest,
  organizationLogins: string[]
): Promise<AssessmentResourceCollection<AssessmentTeam>> {
  const teams: AssessmentTeam[] = [];
  const failures: AssessmentCollectionFailure[] = [];
  for (const organizationLogin of organizationLogins) {
    try {
      const records = await collectConnection(
        request,
        ORGANIZATION_TEAMS_QUERY,
        organizationLogin,
        response => readNestedConnection(response, ['organization', 'teams'], 'team inventory'),
        'login'
      );
      teams.push(...records.map(value => normalizeTeam(value, organizationLogin)));
    } catch (error) {
      failures.push({
        organizationLogin,
        error: error instanceof Error ? error.message : 'Team collection failed',
      });
    }
  }
  return { items: teams, failures };
}

export async function collectEnterpriseSecurityDefaults(
  request: AssessmentRestRequest
): Promise<AssessmentSecurityDefault[]> {
  const response = await request();
  if (!Array.isArray(response)) {
    throw new Error('GitHub returned an invalid enterprise security defaults response');
  }
  return response.map(normalizeSecurityDefault);
}

export async function collectEnterpriseActionsPolicy(
  request: AssessmentRestRequest
): Promise<AssessmentActionsPolicy> {
  const response = await request();
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('GitHub returned an invalid enterprise Actions policy response');
  }
  const policy = response as Record<string, unknown>;
  if (
    typeof policy.enabled_organizations !== 'string'
    || typeof policy.allowed_actions !== 'string'
    || typeof policy.sha_pinning_required !== 'boolean'
  ) {
    throw new Error('GitHub returned an incomplete enterprise Actions policy response');
  }
  return {
    enabledOrganizations: policy.enabled_organizations,
    allowedActions: policy.allowed_actions,
    shaPinningRequired: policy.sha_pinning_required,
  };
}

function normalizeAssessmentError(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string' ? error : 'Assessment collection failed';
  return message.replace(/\s+/g, ' ').trim();
}

function readAssessmentObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function requireAssessmentString(
  data: Record<string, unknown>,
  key: string,
  context: string
): string {
  const value = data[key];
  if (typeof value !== 'string') {
    throw new Error(`${context} did not include a valid ${key}`);
  }
  return value;
}

function requireAssessmentBoolean(
  data: Record<string, unknown>,
  key: string,
  context: string
): boolean {
  const value = data[key];
  if (typeof value !== 'boolean') {
    throw new Error(`${context} did not include a valid ${key}`);
  }
  return value;
}

function readOptionalAssessmentBoolean(
  data: Record<string, unknown>,
  key: string,
  context: string
): boolean | null {
  const value = data[key];
  if (value === undefined) return null;
  if (typeof value !== 'boolean') {
    throw new Error(`${context} did not include a valid ${key}`);
  }
  return value;
}

function requireSuccessfulAssessmentResponse(
  response: AssessmentRestResponse,
  context: string
): Record<string, unknown> {
  const data = readAssessmentObject(response.data);
  if (response.status < 200 || response.status >= 300) {
    const message =
      typeof data?.message === 'string' ? `: ${normalizeAssessmentError(data.message)}` : '';
    throw new Error(`${context} returned HTTP ${response.status}${message}`);
  }
  if (!data) {
    throw new Error(`${context} returned an invalid response`);
  }
  return data;
}

async function collectPagedActionsResources<T>(
  request: (page: number, perPage: number) => Promise<AssessmentRestResponse>,
  arrayKey: 'runner_groups' | 'runners',
  context: string,
  normalize: (item: Record<string, unknown>) => T
): Promise<T[]> {
  const resources: T[] = [];
  let page = 1;
  let expectedTotal: number | null = null;

  while (true) {
    const data = requireSuccessfulAssessmentResponse(
      await request(page, REST_PAGE_SIZE),
      context
    );
    const totalCount = data.total_count;
    const items = data[arrayKey];
    if (!Number.isInteger(totalCount) || (totalCount as number) < 0 || !Array.isArray(items)) {
      throw new Error(`${context} returned an invalid paginated response`);
    }

    if (expectedTotal === null) {
      expectedTotal = totalCount as number;
    } else if (totalCount !== expectedTotal) {
      throw new Error(`${context} total_count changed while paging`);
    }

    resources.push(...items.map(item => {
      const object = readAssessmentObject(item);
      if (!object) {
        throw new Error(`${context} returned an invalid resource`);
      }
      return normalize(object);
    }));

    if (resources.length >= expectedTotal || items.length < REST_PAGE_SIZE) {
      break;
    }
    page += 1;
  }

  return resources;
}

export async function collectEnterpriseActionsEvidence(
  requests: AssessmentActionsRequests,
  allowedActions: string | null
): Promise<AssessmentActionsEvidence> {
  const failures: AssessmentActionsFailure[] = [];

  const collectCheck = async <T>(
    check: AssessmentActionsCheck,
    request: () => Promise<AssessmentRestResponse>,
    context: string,
    normalize: (data: Record<string, unknown>) => T
  ): Promise<T | null> => {
    try {
      return normalize(requireSuccessfulAssessmentResponse(await request(), context));
    } catch (error) {
      failures.push({ check, error: normalizeAssessmentError(error) });
      return null;
    }
  };

  const selectedActions =
    allowedActions === 'selected'
      ? await collectCheck(
          'selected-actions',
          requests.getSelectedActions,
          'Selected Actions policy',
          data => {
            const patternsAllowed = data.patterns_allowed;
            if (
              patternsAllowed !== undefined
              && (
                !Array.isArray(patternsAllowed)
                || patternsAllowed.some(item => typeof item !== 'string')
              )
            ) {
              throw new Error('Selected Actions policy did not include valid patterns_allowed');
            }
            return {
              githubOwnedAllowed: readOptionalAssessmentBoolean(
                data,
                'github_owned_allowed',
                'Selected Actions policy'
              ),
              verifiedAllowed: readOptionalAssessmentBoolean(
                data,
                'verified_allowed',
                'Selected Actions policy'
              ),
              patternsAllowed: (patternsAllowed as string[] | undefined) ?? null,
            };
          }
        )
      : null;

  const workflowPermissions = await collectCheck(
    'workflow-permissions',
    requests.getWorkflowPermissions,
    'Workflow permissions policy',
    data => ({
      defaultWorkflowPermissions: requireAssessmentString(
        data,
        'default_workflow_permissions',
        'Workflow permissions policy'
      ),
      canApprovePullRequestReviews: requireAssessmentBoolean(
        data,
        'can_approve_pull_request_reviews',
        'Workflow permissions policy'
      ),
    })
  );

  const forkPullRequestPolicy = await collectCheck(
    'fork-pull-request-workflows',
    requests.getForkPullRequestPolicy,
    'Private fork pull-request policy',
    data => ({
      runWorkflowsFromForkPullRequests: requireAssessmentBoolean(
        data,
        'run_workflows_from_fork_pull_requests',
        'Private fork pull-request policy'
      ),
      sendWriteTokensToWorkflows: requireAssessmentBoolean(
        data,
        'send_write_tokens_to_workflows',
        'Private fork pull-request policy'
      ),
      sendSecretsAndVariables: requireAssessmentBoolean(
        data,
        'send_secrets_and_variables',
        'Private fork pull-request policy'
      ),
      requireApprovalForForkPullRequestWorkflows: requireAssessmentBoolean(
        data,
        'require_approval_for_fork_pr_workflows',
        'Private fork pull-request policy'
      ),
    })
  );

  const selfHostedRunnerPolicy = await collectCheck(
    'self-hosted-runner-policy',
    requests.getSelfHostedRunnerPolicy,
    'Self-hosted runner policy',
    data => ({
      disabledForAllOrganizations: requireAssessmentBoolean(
        data,
        'disable_self_hosted_runners_for_all_orgs',
        'Self-hosted runner policy'
      ),
    })
  );

  let runnerGroups: AssessmentRunnerGroup[] | null = null;
  try {
    runnerGroups = await collectPagedActionsResources(
      requests.getRunnerGroups,
      'runner_groups',
      'Runner groups',
      data => {
        const selectedWorkflows = data.selected_workflows;
        if (
          selectedWorkflows !== undefined
          && (
            !Array.isArray(selectedWorkflows)
            || selectedWorkflows.some(item => typeof item !== 'string')
          )
        ) {
          throw new Error('Runner group included invalid selected_workflows');
        }
        if (!Number.isInteger(data.id)) {
          throw new Error('Runner group did not include a valid id');
        }
        return {
          githubId: data.id as number,
          name: requireAssessmentString(data, 'name', 'Runner group'),
          visibility: requireAssessmentString(data, 'visibility', 'Runner group'),
          isDefault: requireAssessmentBoolean(data, 'default', 'Runner group'),
          allowsPublicRepositories: requireAssessmentBoolean(
            data,
            'allows_public_repositories',
            'Runner group'
          ),
          restrictedToWorkflows: readOptionalAssessmentBoolean(
            data,
            'restricted_to_workflows',
            'Runner group'
          ),
          selectedWorkflows: (selectedWorkflows as string[] | undefined) ?? null,
        };
      }
    );
  } catch (error) {
    failures.push({ check: 'runner-groups', error: normalizeAssessmentError(error) });
  }

  let runners: AssessmentRunner[] | null = null;
  try {
    runners = await collectPagedActionsResources(
      requests.getRunners,
      'runners',
      'Self-hosted runners',
      data => {
        if (!Number.isInteger(data.id)) {
          throw new Error('Self-hosted runner did not include a valid id');
        }
        if (
          data.runner_group_id !== undefined
          && data.runner_group_id !== null
          && !Number.isInteger(data.runner_group_id)
        ) {
          throw new Error('Self-hosted runner included an invalid runner_group_id');
        }
        if (!Array.isArray(data.labels)) {
          throw new Error('Self-hosted runner did not include valid labels');
        }
        const labels = data.labels.map(label => {
          const object = readAssessmentObject(label);
          if (!object || typeof object.name !== 'string') {
            throw new Error('Self-hosted runner included an invalid label');
          }
          return object.name;
        });
        return {
          githubId: data.id as number,
          runnerGroupId: (data.runner_group_id as number | null) ?? null,
          name: requireAssessmentString(data, 'name', 'Self-hosted runner'),
          os: requireAssessmentString(data, 'os', 'Self-hosted runner'),
          status: requireAssessmentString(data, 'status', 'Self-hosted runner'),
          busy: requireAssessmentBoolean(data, 'busy', 'Self-hosted runner'),
          ephemeral: data.ephemeral === true,
          version: typeof data.version === 'string' ? data.version : null,
          labels,
        };
      }
    );
  } catch (error) {
    failures.push({ check: 'self-hosted-runners', error: normalizeAssessmentError(error) });
  }

  return {
    selectedActions,
    workflowPermissions,
    forkPullRequestPolicy,
    selfHostedRunnerPolicy,
    runnerGroups,
    runners,
    failures,
  };
}

export async function collectRepositorySecurity(
  requests: AssessmentRepositorySecurityRequests,
  repositories: AssessmentRepository[]
): Promise<AssessmentRepositorySecurityCollection> {
  const items: AssessmentRepositorySecurity[] = [];
  const failures: AssessmentRepositorySecurityFailure[] = [];

  for (const repository of repositories) {
    const [owner, repo] = repository.nameWithOwner.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository name: ${repository.nameWithOwner}`);
    }
    const item: AssessmentRepositorySecurity = {
      nameWithOwner: repository.nameWithOwner,
      visibility: repository.visibility,
      isArchived: repository.isArchived,
      isFork: repository.isFork,
      defaultBranch: null,
      codeSecurity: null,
      codeScanningDefaultSetup: null,
      secretScanning: null,
      secretScanningPushProtection: null,
      dependabotAlerts: null,
      dependabotSecurityUpdates: null,
      configurationStatus: null,
      configurationId: null,
      configurationName: null,
      configurationEnforcement: null,
    };

    try {
      const response = await requests.getRepository(owner, repo);
      if (response.status !== 200) {
        throw new Error(describeRestFailure('repository security features', response));
      }
      const details = readAssessmentObject(response.data);
      item.defaultBranch = typeof details?.default_branch === 'string'
        ? details.default_branch
        : null;
      Object.assign(item, normalizeRepositorySecurityFeatures(response.data));
    } catch (error) {
      failures.push({
        nameWithOwner: repository.nameWithOwner,
        check: 'features',
        error: error instanceof Error ? error.message : 'Repository security feature collection failed',
      });
    }

    try {
      const response = await requests.getCodeScanningDefaultSetup(owner, repo);
      if (response.status === 200) {
        item.codeScanningDefaultSetup = normalizeCodeScanningDefaultSetup(response.data);
      } else if (
        response.status === 403
        && readRestMessage(response.data).toLowerCase().includes(
          'code security must be enabled for this repository'
        )
      ) {
        item.codeScanningDefaultSetup = 'unavailable';
      } else {
        throw new Error(describeRestFailure('code scanning default setup', response));
      }
    } catch (error) {
      failures.push({
        nameWithOwner: repository.nameWithOwner,
        check: 'code-scanning-default-setup',
        error: error instanceof Error ? error.message : 'Code scanning default setup collection failed',
      });
    }

    try {
      const response = await requests.checkDependabotAlerts(owner, repo);
      if (response.status === 204) {
        item.dependabotAlerts = 'enabled';
      } else if (
        response.status === 404
        && readRestMessage(response.data).toLowerCase().includes('vulnerability alerts are disabled')
      ) {
        item.dependabotAlerts = 'disabled';
      } else {
        throw new Error(describeRestFailure('Dependabot alert status', response));
      }
    } catch (error) {
      failures.push({
        nameWithOwner: repository.nameWithOwner,
        check: 'dependabot-alerts',
        error: error instanceof Error ? error.message : 'Dependabot alert status collection failed',
      });
    }

    try {
      const response = await requests.getConfiguration(owner, repo);
      if (response.status === 204) {
        item.configurationStatus = 'none';
      } else if (response.status === 200) {
        Object.assign(item, normalizeRepositorySecurityConfiguration(response.data));
      } else {
        throw new Error(describeRestFailure('code security configuration', response));
      }
    } catch (error) {
      failures.push({
        nameWithOwner: repository.nameWithOwner,
        check: 'configuration',
        error: error instanceof Error ? error.message : 'Code security configuration collection failed',
      });
    }

    items.push(item);
  }

  return { items, failures };
}

interface NormalizedClassicProtection {
  requiresPullRequest: boolean;
  requiredApprovingReviewCount: number | null;
  requiresStatusChecks: boolean;
  blocksForcePushes: boolean | null;
  blocksDeletions: boolean | null;
  enforcesAdmins: boolean | null;
}

interface NormalizedEffectiveRule {
  type: string;
  rulesetId: number | null;
  rulesetSourceType: string | null;
  rulesetSourceName: string | null;
  rulesetSource: string | null;
  requiredApprovingReviewCount: number | null;
}

export async function collectRepositoryRules(
  requests: AssessmentRepositoryRulesRequests,
  repositories: AssessmentRepositorySecurity[]
): Promise<AssessmentRepositoryRulesCollection> {
  const items: AssessmentRepositoryRules[] = [];
  const failures: AssessmentRepositoryRulesFailure[] = [];

  for (const repository of repositories) {
    const [owner, repo] = repository.nameWithOwner.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository name: ${repository.nameWithOwner}`);
    }

    const item: AssessmentRepositoryRules = {
      nameWithOwner: repository.nameWithOwner,
      visibility: repository.visibility,
      isArchived: repository.isArchived,
      isFork: repository.isFork,
      defaultBranch: repository.defaultBranch,
      branchExists: null,
      classicProtection: null,
      hasProtection: null,
      activeRulesetIds: null,
      activeRulesetSources: null,
      activeRulesets: null,
      ruleTypes: null,
      requiresPullRequest: null,
      requiredApprovingReviewCount: null,
      requiresStatusChecks: null,
      blocksForcePushes: null,
      blocksDeletions: null,
      enforcesAdmins: null,
    };
    items.push(item);

    if (repository.isArchived || repository.isFork) continue;
    if (!repository.defaultBranch) {
      failures.push({
        nameWithOwner: repository.nameWithOwner,
        check: 'default-branch',
        error: 'GitHub did not return a default branch',
      });
      continue;
    }

    let effectiveRules: NormalizedEffectiveRule[] | null = null;
    try {
      effectiveRules = await collectEffectiveBranchRules(
        requests,
        owner,
        repo,
        repository.defaultBranch
      );
      item.ruleTypes = [...new Set(effectiveRules.map(rule => rule.type))].sort();
      item.activeRulesetIds = [...new Set(
        effectiveRules
          .map(rule => rule.rulesetId)
          .filter((rulesetId): rulesetId is number => rulesetId !== null)
      )].sort((left, right) => left - right);
      item.activeRulesetSources = [...new Set(
        effectiveRules
          .map(rule => rule.rulesetSource)
          .filter((source): source is string => source !== null)
      )].sort();
      item.activeRulesets = uniqueRulesetReferences(effectiveRules);
    } catch (error) {
      failures.push({
        nameWithOwner: repository.nameWithOwner,
        check: 'effective-rules',
        error: normalizeAssessmentError(error),
      });
    }

    let classic: NormalizedClassicProtection | null = null;
    try {
      const response = await requests.getClassicProtection(
        owner,
        repo,
        repository.defaultBranch
      );
      if (response.status === 200) {
        item.branchExists = true;
        item.classicProtection = true;
        classic = normalizeClassicProtection(response.data);
      } else if (response.status === 404) {
        const message = readRestMessage(response.data).toLowerCase();
        if (message.includes('branch not protected')) {
          item.branchExists = true;
          item.classicProtection = false;
          classic = {
            requiresPullRequest: false,
            requiredApprovingReviewCount: null,
            requiresStatusChecks: false,
            blocksForcePushes: false,
            blocksDeletions: false,
            enforcesAdmins: false,
          };
        } else if (message.includes('branch not found')) {
          item.branchExists = false;
          item.classicProtection = false;
        } else {
          throw new Error(describeRestFailure('classic branch protection', response));
        }
      } else {
        throw new Error(describeRestFailure('classic branch protection', response));
      }
    } catch (error) {
      failures.push({
        nameWithOwner: repository.nameWithOwner,
        check: 'classic-protection',
        error: normalizeAssessmentError(error),
      });
    }

    if (item.branchExists === false) continue;
    const rulesKnown = effectiveRules !== null;
    const classicKnown = item.classicProtection !== null;
    const ruleTypes = item.ruleTypes ?? [];
    const rulesetProtection = rulesKnown && ruleTypes.length > 0;

    if (rulesetProtection || item.classicProtection === true) {
      item.hasProtection = true;
    } else if (rulesKnown && classicKnown) {
      item.hasProtection = false;
    }

    if (item.hasProtection === false) {
      item.requiresPullRequest = false;
      item.requiresStatusChecks = false;
      item.blocksForcePushes = false;
      item.blocksDeletions = false;
      item.enforcesAdmins = false;
      continue;
    }
    if (item.hasProtection !== true) continue;

    item.requiresPullRequest = combineProtectionControl(
      rulesKnown,
      ruleTypes.includes('pull_request'),
      classic?.requiresPullRequest ?? null
    );
    item.requiresStatusChecks = combineProtectionControl(
      rulesKnown,
      ruleTypes.includes('required_status_checks'),
      classic?.requiresStatusChecks ?? null
    );
    item.blocksForcePushes = combineProtectionControl(
      rulesKnown,
      ruleTypes.includes('non_fast_forward'),
      classic?.blocksForcePushes ?? null
    );
    item.blocksDeletions = combineProtectionControl(
      rulesKnown,
      ruleTypes.includes('deletion'),
      classic?.blocksDeletions ?? null
    );
    item.enforcesAdmins = classic?.enforcesAdmins ?? null;

    const reviewCounts = [
      classic?.requiredApprovingReviewCount,
      ...(effectiveRules ?? []).map(rule => rule.requiredApprovingReviewCount),
    ].filter((count): count is number => count !== null && count !== undefined);
    item.requiredApprovingReviewCount = reviewCounts.length > 0
      ? Math.max(...reviewCounts)
      : null;
  }

  return { items, failures };
}

async function collectEffectiveBranchRules(
  requests: AssessmentRepositoryRulesRequests,
  owner: string,
  repo: string,
  branch: string
): Promise<NormalizedEffectiveRule[]> {
  const rules: NormalizedEffectiveRule[] = [];
  let page = 1;

  while (true) {
    const response = await requests.getEffectiveRules(
      owner,
      repo,
      branch,
      page,
      REST_PAGE_SIZE
    );
    if (response.status !== 200) {
      throw new Error(describeRestFailure('effective branch rules', response));
    }
    if (!Array.isArray(response.data)) {
      throw new Error('GitHub returned an invalid effective branch rules response');
    }
    rules.push(...response.data.map(normalizeEffectiveBranchRule));
    if (response.data.length < REST_PAGE_SIZE) break;
    page += 1;
  }

  return rules;
}

function normalizeEffectiveBranchRule(value: unknown): NormalizedEffectiveRule {
  const rule = readAssessmentObject(value);
  if (!rule || typeof rule.type !== 'string') {
    throw new Error('GitHub returned an invalid effective branch rule');
  }
  const parameters = readAssessmentObject(rule.parameters);
  const requiredApprovingReviewCount = parameters?.required_approving_review_count;
  if (
    requiredApprovingReviewCount !== undefined
    && (!Number.isInteger(requiredApprovingReviewCount) || (requiredApprovingReviewCount as number) < 0)
  ) {
    throw new Error('GitHub returned an invalid required approving review count');
  }
  const sourceType = typeof rule.ruleset_source_type === 'string'
    ? rule.ruleset_source_type
    : null;
  const source = typeof rule.ruleset_source === 'string' ? rule.ruleset_source : null;
  return {
    type: rule.type,
    rulesetId: Number.isInteger(rule.ruleset_id) ? rule.ruleset_id as number : null,
    rulesetSourceType: sourceType,
    rulesetSourceName: source,
    rulesetSource: sourceType && source ? `${sourceType}: ${source}` : source,
    requiredApprovingReviewCount:
      typeof requiredApprovingReviewCount === 'number'
        ? requiredApprovingReviewCount
        : null,
  };
}

function uniqueRulesetReferences(rules: NormalizedEffectiveRule[]): AssessmentRulesetReference[] {
  const references = new Map<number, AssessmentRulesetReference>();
  for (const rule of rules) {
    if (
      rule.rulesetId === null
      || rule.rulesetSourceType === null
      || rule.rulesetSourceName === null
    ) {
      continue;
    }
    const existing = references.get(rule.rulesetId);
    const reference = {
      githubId: rule.rulesetId,
      sourceType: rule.rulesetSourceType,
      source: rule.rulesetSourceName,
    };
    if (
      existing
      && (existing.sourceType !== reference.sourceType || existing.source !== reference.source)
    ) {
      throw new Error(`GitHub returned conflicting sources for ruleset ${rule.rulesetId}`);
    }
    references.set(rule.rulesetId, reference);
  }
  return [...references.values()].sort((left, right) => left.githubId - right.githubId);
}

export async function collectRulesetDetails(
  request: AssessmentRulesetDetailRequest,
  repositories: AssessmentRepositoryRules[]
): Promise<AssessmentRulesetDetailCollection> {
  const references = new Map<number, {
    reference: AssessmentRulesetReference;
    repositories: Set<string>;
  }>();
  const failures: AssessmentRulesetDetailFailure[] = [];
  const missingReferences = new Set<number>();
  const conflictingReferences = new Set<number>();

  for (const repository of repositories) {
    if (
      (repository.ruleTypes?.length ?? 0) > 0
      && (repository.activeRulesetIds?.length ?? 0) === 0
    ) {
      failures.push({
        githubId: 0,
        sourceType: 'Unknown',
        source: repository.nameWithOwner,
        error: 'Effective rules did not include a ruleset identifier',
      });
    }
    for (const rulesetId of repository.activeRulesetIds ?? []) {
      if (conflictingReferences.has(rulesetId)) continue;
      const reference = repository.activeRulesets?.find(
        candidate => candidate.githubId === rulesetId
      );
      if (!reference) {
        if (!missingReferences.has(rulesetId)) {
          failures.push({
            githubId: rulesetId,
            sourceType: 'Unknown',
            source: repository.nameWithOwner,
            error: 'Effective rule evidence did not include the ruleset source',
          });
          missingReferences.add(rulesetId);
        }
        continue;
      }

      const existing = references.get(rulesetId);
      if (
        existing
        && (
          existing.reference.sourceType !== reference.sourceType
          || existing.reference.source !== reference.source
        )
      ) {
        failures.push({
          ...reference,
          error: `Ruleset ${rulesetId} was returned with conflicting sources`,
        });
        references.delete(rulesetId);
        conflictingReferences.add(rulesetId);
        continue;
      }
      if (existing) {
        existing.repositories.add(repository.nameWithOwner);
      } else {
        references.set(rulesetId, {
          reference,
          repositories: new Set([repository.nameWithOwner]),
        });
      }
    }
  }

  const items: AssessmentRulesetDetail[] = [];
  for (const { reference, repositories: appliedRepositories } of references.values()) {
    try {
      const response = await request(reference);
      if (response.status !== 200) {
        throw new Error(describeRestFailure('ruleset details', response));
      }
      items.push(normalizeRulesetDetail(
        response.data,
        reference,
        [...appliedRepositories].sort()
      ));
    } catch (error) {
      failures.push({
        ...reference,
        error: normalizeAssessmentError(error),
      });
    }
  }

  return {
    items: items.sort((left, right) => left.name.localeCompare(right.name)),
    failures,
  };
}

function normalizeRulesetDetail(
  value: unknown,
  reference: AssessmentRulesetReference,
  appliedRepositories: string[]
): AssessmentRulesetDetail {
  const ruleset = readAssessmentObject(value);
  if (
    !ruleset
    || !Number.isInteger(ruleset.id)
    || typeof ruleset.name !== 'string'
    || typeof ruleset.target !== 'string'
    || typeof ruleset.source_type !== 'string'
    || typeof ruleset.source !== 'string'
    || typeof ruleset.enforcement !== 'string'
    || !Array.isArray(ruleset.rules)
    || !Array.isArray(ruleset.bypass_actors)
  ) {
    throw new Error('GitHub returned an invalid ruleset detail response');
  }
  if (ruleset.id !== reference.githubId) {
    throw new Error(`GitHub returned ruleset ${ruleset.id} instead of ${reference.githubId}`);
  }
  if (
    ruleset.source_type !== reference.sourceType
    || ruleset.source !== reference.source
  ) {
    throw new Error(`GitHub returned a conflicting source for ruleset ${reference.githubId}`);
  }

  return {
    githubId: ruleset.id as number,
    name: ruleset.name,
    target: ruleset.target,
    sourceType: ruleset.source_type,
    source: ruleset.source,
    enforcement: ruleset.enforcement,
    conditions: normalizeRulesetConditions(ruleset.conditions),
    ruleTypes: ruleset.rules.map(ruleValue => {
      const rule = readAssessmentObject(ruleValue);
      if (!rule || typeof rule.type !== 'string') {
        throw new Error('GitHub returned an invalid rule in ruleset details');
      }
      return rule.type;
    }),
    appliedRepositories,
    bypassActors: ruleset.bypass_actors.map(normalizeRulesetBypassActor),
  };
}

function normalizeRulesetConditions(value: unknown): AssessmentRulesetCondition[] {
  if (value === undefined || value === null) return [];
  const conditions = readAssessmentObject(value);
  if (!conditions) {
    throw new Error('GitHub returned invalid ruleset conditions');
  }

  return Object.entries(conditions).map(([type, conditionValue]) => {
    const condition = readAssessmentObject(conditionValue);
    if (!condition || !Array.isArray(condition.include) || !Array.isArray(condition.exclude)) {
      throw new Error(`GitHub returned invalid ${type} ruleset conditions`);
    }
    if (
      condition.include.some(entry => typeof entry !== 'string')
      || condition.exclude.some(entry => typeof entry !== 'string')
    ) {
      throw new Error(`GitHub returned non-string ${type} ruleset conditions`);
    }
    return {
      type,
      include: condition.include as string[],
      exclude: condition.exclude as string[],
    };
  });
}

function normalizeRulesetBypassActor(value: unknown): AssessmentRulesetBypassActor {
  const actor = readAssessmentObject(value);
  if (
    !actor
    || (
      actor.actor_id !== null
      && actor.actor_id !== undefined
      && !Number.isInteger(actor.actor_id)
    )
    || typeof actor.actor_type !== 'string'
    || typeof actor.bypass_mode !== 'string'
  ) {
    throw new Error('GitHub returned an invalid ruleset bypass actor');
  }
  return {
    actorId: typeof actor.actor_id === 'number' ? actor.actor_id : null,
    actorType: actor.actor_type,
    bypassMode: actor.bypass_mode,
  };
}

function normalizeClassicProtection(data: unknown): NormalizedClassicProtection {
  const protection = readAssessmentObject(data);
  if (!protection) {
    throw new Error('GitHub returned an invalid classic branch protection response');
  }
  const reviews = readAssessmentObject(protection.required_pull_request_reviews);
  const reviewCount = reviews?.required_approving_review_count;
  if (reviewCount !== undefined && (!Number.isInteger(reviewCount) || (reviewCount as number) < 0)) {
    throw new Error('GitHub returned an invalid classic required approving review count');
  }
  return {
    requiresPullRequest: reviews !== null,
    requiredApprovingReviewCount: typeof reviewCount === 'number' ? reviewCount : null,
    requiresStatusChecks: readAssessmentObject(protection.required_status_checks) !== null,
    blocksForcePushes: invertOptionalEnabled(protection.allow_force_pushes),
    blocksDeletions: invertOptionalEnabled(protection.allow_deletions),
    enforcesAdmins: readOptionalEnabled(protection.enforce_admins),
  };
}

function readOptionalEnabled(value: unknown): boolean | null {
  if (value === undefined || value === null) return null;
  const setting = readAssessmentObject(value);
  if (!setting || typeof setting.enabled !== 'boolean') {
    throw new Error('GitHub returned an invalid branch protection setting');
  }
  return setting.enabled;
}

function invertOptionalEnabled(value: unknown): boolean | null {
  const enabled = readOptionalEnabled(value);
  return enabled === null ? null : !enabled;
}

function combineProtectionControl(
  rulesKnown: boolean,
  rulesetEnabled: boolean,
  classicEnabled: boolean | null
): boolean | null {
  if (rulesetEnabled || classicEnabled === true) return true;
  if (rulesKnown && classicEnabled === false) return false;
  return null;
}

export async function collectEnterpriseCopilotSeats(
  request: AssessmentPagedRestRequest
): Promise<AssessmentCopilotSeatInventory> {
  const assignments: AssessmentCopilotSeat[] = [];
  let page = 1;
  let totalSeats: number | null = null;

  while (true) {
    const response = await request(page, REST_PAGE_SIZE);
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
      throw new Error('GitHub returned an invalid enterprise Copilot seats response');
    }
    const result = response as Record<string, unknown>;
    if (!Number.isInteger(result.total_seats) || !Array.isArray(result.seats)) {
      throw new Error('GitHub returned an incomplete enterprise Copilot seats response');
    }
    if (totalSeats !== null && totalSeats !== result.total_seats) {
      throw new Error('GitHub returned inconsistent enterprise Copilot seat totals');
    }
    totalSeats = result.total_seats as number;
    assignments.push(...result.seats.map(normalizeCopilotSeat));
    if (result.seats.length < REST_PAGE_SIZE) break;
    page += 1;
  }

  const seatsByLogin = new Map<string, AssessmentCopilotSeat>();
  for (const assignment of assignments) {
    const key = assignment.login.toLowerCase();
    const existing = seatsByLogin.get(key);
    if (!existing) {
      seatsByLogin.set(key, assignment);
      continue;
    }
    if (existing.planType !== assignment.planType) {
      throw new Error(`GitHub returned inconsistent Copilot plans for ${assignment.login}`);
    }
    const assignmentHasLaterActivity = isLaterTimestamp(
      assignment.lastActivityAt,
      existing.lastActivityAt
    );
    seatsByLogin.set(key, {
      ...existing,
      createdAt: earlierTimestamp(existing.createdAt, assignment.createdAt),
      lastAuthenticatedAt: laterNullableTimestamp(
        existing.lastAuthenticatedAt,
        assignment.lastAuthenticatedAt
      ),
      lastActivityAt: laterNullableTimestamp(existing.lastActivityAt, assignment.lastActivityAt),
      lastActivityEditor: assignmentHasLaterActivity
        ? assignment.lastActivityEditor
        : existing.lastActivityEditor,
      pendingCancellationDate: earlierNullableTimestamp(
        existing.pendingCancellationDate,
        assignment.pendingCancellationDate
      ),
      assignmentCount: existing.assignmentCount + 1,
      assignmentSources: mergeCopilotAssignmentSources(
        existing.assignmentSources,
        assignment.assignmentSources
      ),
    });
  }

  return {
    totalSeats: totalSeats ?? 0,
    rawAssignmentCount: assignments.length,
    seats: [...seatsByLogin.values()].sort((left, right) => left.login.localeCompare(right.login)),
  };
}

export async function collectEnterpriseBudgets(
  request: AssessmentPagedRestRequest
): Promise<AssessmentBudget[]> {
  const budgetsById = new Map<string, AssessmentBudget>();
  let page = 1;

  while (true) {
    const response = await request(page, REST_PAGE_SIZE);
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
      throw new Error('GitHub returned an invalid enterprise budgets response');
    }
    const result = response as Record<string, unknown>;
    if (!Array.isArray(result.budgets) || typeof result.has_next_page !== 'boolean') {
      throw new Error('GitHub returned an incomplete enterprise budgets response');
    }
    for (const value of result.budgets) {
      const budget = normalizeBudget(value);
      if (budgetsById.has(budget.id)) {
        throw new Error(`GitHub returned duplicate enterprise budget ${budget.id}`);
      }
      budgetsById.set(budget.id, budget);
    }
    if (!result.has_next_page) break;
    page += 1;
  }

  return [...budgetsById.values()];
}

export async function collectCopilotGovernance(
  requests: AssessmentCopilotRequests,
  organizationLogins: string[]
): Promise<AssessmentCopilotEvidence> {
  const failures: AssessmentCopilotFailure[] = [];
  let contentExclusionRuleCount: number | null = null;

  try {
    const response = await requests.getContentExclusion();
    if (response.status !== 200) {
      throw new Error(describeRestFailure('enterprise Copilot content exclusion', response));
    }
    contentExclusionRuleCount = countCopilotContentExclusionRules(response.data);
  } catch (error) {
    failures.push({
      scope: 'enterprise',
      check: 'content-exclusion',
      error: normalizeAssessmentError(error),
    });
  }

  const organizations: AssessmentCopilotOrganization[] = [];
  for (const organizationLogin of organizationLogins) {
    const organization: AssessmentCopilotOrganization = {
      organizationLogin,
      seatTotal: null,
      seatsAddedThisCycle: null,
      seatsPendingCancellation: null,
      seatsPendingInvitation: null,
      activeSeatsThisCycle: null,
      inactiveSeatsThisCycle: null,
      planType: null,
      seatManagementSetting: null,
      publicCodeSuggestions: null,
      ideChat: null,
      platformChat: null,
      cli: null,
      codingAgentRepositoryScope: null,
    };

    try {
      const response = await requests.getOrganizationSettings(organizationLogin);
      if (response.status !== 200) {
        throw new Error(describeRestFailure('organization Copilot settings', response));
      }
      Object.assign(organization, normalizeCopilotOrganization(response.data));
    } catch (error) {
      failures.push({
        scope: organizationLogin,
        check: 'organization-settings',
        error: normalizeAssessmentError(error),
      });
    }

    try {
      const response = await requests.getCodingAgentPermissions(organizationLogin);
      if (response.status !== 200) {
        throw new Error(describeRestFailure('organization Copilot coding agent policy', response));
      }
      const permissions = readAssessmentObject(response.data);
      if (!permissions || typeof permissions.enabled_repositories !== 'string') {
        throw new Error('GitHub returned invalid organization Copilot coding agent policy');
      }
      organization.codingAgentRepositoryScope = permissions.enabled_repositories;
    } catch (error) {
      failures.push({
        scope: organizationLogin,
        check: 'coding-agent',
        error: normalizeAssessmentError(error),
      });
    }

    organizations.push(organization);
  }

  return { contentExclusionRuleCount, organizations, failures };
}

export async function collectBillingGovernance(
  requests: AssessmentBillingRequests,
  budgets: AssessmentBudget[],
  userLogins: string[]
): Promise<AssessmentBillingEvidence> {
  const failures: AssessmentBillingFailure[] = [];
  const costCenters: AssessmentCostCenter[] = [];

  try {
    const response = await requests.getCostCenters();
    if (response.status !== 200) {
      throw new Error(describeRestFailure('enterprise billing cost centers', response));
    }
    const result = readAssessmentObject(response.data);
    if (!result || !Array.isArray(result.costCenters)) {
      throw new Error('GitHub returned invalid enterprise billing cost centers');
    }

    for (const value of result.costCenters) {
      const summary = normalizeCostCenter(value, null);
      try {
        const details = await collectCostCenterDetails(requests, summary.id);
        costCenters.push(details);
      } catch (error) {
        failures.push({
          scope: summary.name,
          check: 'cost-center-resources',
          error: normalizeAssessmentError(error),
        });
        costCenters.push({ ...summary, resources: null });
      }
    }
  } catch (error) {
    failures.push({
      scope: 'enterprise',
      check: 'cost-centers',
      error: normalizeAssessmentError(error),
    });
  }

  const effectiveBudgets: AssessmentEffectiveBudget[] = [];
  for (const user of uniqueSortedStrings(userLogins)) {
    try {
      effectiveBudgets.push(await collectEffectiveBudget(requests, user));
    } catch (error) {
      failures.push({
        scope: user,
        check: 'effective-budget',
        error: normalizeAssessmentError(error),
      });
    }
  }

  const multiUserBudgetStates: AssessmentBudgetUserState[] = [];
  for (const budget of budgets.filter(
    value => value.scope === 'multi_user_customer' || value.scope === 'multi_user_cost_center'
  )) {
    try {
      multiUserBudgetStates.push(...await collectBudgetUserStates(requests, budget.id));
    } catch (error) {
      failures.push({
        scope: formatBudgetResource(budget),
        check: 'multi-user-budget-states',
        error: normalizeAssessmentError(error),
      });
    }
  }

  let usage: AssessmentBillingUsage | null = null;
  try {
    const response = await requests.getUsageSummary();
    if (response.status !== 200) {
      throw new Error(describeRestFailure('enterprise billing usage summary', response));
    }
    usage = normalizeBillingUsage(response.data);
  } catch (error) {
    failures.push({
      scope: 'enterprise',
      check: 'usage-summary',
      error: normalizeAssessmentError(error),
    });
  }

  return {
    costCenters: costCenters.sort((left, right) => left.name.localeCompare(right.name)),
    effectiveBudgets,
    multiUserBudgetStates: multiUserBudgetStates.sort(
      (left, right) => left.user.localeCompare(right.user)
    ),
    usage,
    failures,
  };
}

export function evaluateAssessmentBaseline(input: {
  organizations: AssessmentOrganization[];
  members: AssessmentMember[];
  ownerCount: number;
  repositories: AssessmentRepository[];
  teams: AssessmentTeam[];
  organizationAccess?: AssessmentOrganizationAccess[] | null;
  repositoryAccess?: AssessmentRepositoryAccess[] | null;
  scim?: AssessmentScimInventory | null;
  setupAccountLogin?: string;
  securityDefaults?: AssessmentSecurityDefault[] | null;
  repositorySecurity?: AssessmentRepositorySecurity[] | null;
  repositoryRules?: AssessmentRepositoryRules[] | null;
  rulesets?: AssessmentRulesetDetail[] | null;
  actionsPolicy?: AssessmentActionsPolicy | null;
  actionsEvidence?: AssessmentActionsEvidence | null;
  copilotSeats?: AssessmentCopilotSeatInventory | null;
  copilotEvidence?: AssessmentCopilotEvidence | null;
  budgets?: AssessmentBudget[] | null;
  billingEvidence?: AssessmentBillingEvidence | null;
  now?: Date;
}): AssessmentEvaluation {
  const findings: Array<Omit<AssessmentFinding, 'expectedState' | 'evidenceSources'>> = [];
  const now = input.now ?? new Date();
  const staleThreshold = now.getTime() - STALE_REPOSITORY_DAYS * 24 * 60 * 60 * 1000;
  const activeRepositories = input.repositories.filter(repository => !repository.isArchived);
  const staleRepositories = activeRepositories.filter(repository => {
    const updatedAt = new Date(repository.updatedAt).getTime();
    return Number.isFinite(updatedAt) && updatedAt < staleThreshold;
  });
  const publicRepositories = input.repositories.filter(repository => repository.visibility === 'PUBLIC');
  let organizationsWithAccessSettings = 0;
  let organizationsWithPublicRepositoryCreation = 0;
  let outsideCollaboratorCount = 0;
  let directRepositoryGrantCount = 0;
  let teamRepositoryGrantCount = 0;
  let activeScimIdentities = 0;
  let inactiveScimIdentities = 0;
  const humanEnterpriseMembers = input.members.filter(
    member => member.login.toLowerCase() !== input.setupAccountLogin?.toLowerCase()
  ).length;

  if (input.ownerCount === 0) {
    findings.push({
      ruleKey: 'enterprise-owner-inventory-empty',
      domain: 'identity',
      severity: 'high',
      title: 'No enterprise owners were discovered',
      summary: 'The owner inventory returned no accounts. This may indicate an access limitation or an enterprise administration gap.',
      recommendation: 'Verify the assessment credential can view enterprise owners, then confirm at least two active owners are assigned.',
      affectedResources: [],
    });
  } else if (input.ownerCount === 1) {
    findings.push({
      ruleKey: 'enterprise-owner-single-point-of-failure',
      domain: 'identity',
      severity: 'high',
      title: 'Enterprise ownership has a single point of failure',
      summary: 'Only one enterprise owner was discovered. Loss of that account could delay critical administration and recovery work.',
      recommendation: 'Assign and validate at least one additional enterprise owner using a separately managed account.',
      affectedResources: input.members.filter(member => member.isOwner).map(member => member.login),
    });
  }

  if (input.organizationAccess) {
    const broadAdminAccess = input.organizationAccess.filter(
      organization => organization.defaultRepositoryPermission === 'admin'
    );
    const broadWriteAccess = input.organizationAccess.filter(
      organization => organization.defaultRepositoryPermission === 'write'
    );
    const publicCreationEnabled = input.organizationAccess.filter(
      organization => organization.membersCanCreatePublicRepositories === true
    );
    const outsideCollaborators = input.organizationAccess.flatMap(organization => (
      (organization.outsideCollaboratorLogins ?? []).map(login => ({
        organizationLogin: organization.organizationLogin,
        login,
      }))
    ));

    organizationsWithAccessSettings = input.organizationAccess.filter(
      organization => organization.defaultRepositoryPermission !== null
    ).length;
    organizationsWithPublicRepositoryCreation = publicCreationEnabled.length;
    outsideCollaboratorCount = outsideCollaborators.length;

    if (broadAdminAccess.length > 0) {
      findings.push({
        ruleKey: 'organization-default-repository-admin',
        domain: 'identity',
        severity: 'high',
        title: 'Organization members receive repository administration by default',
        summary: `${broadAdminAccess.length} ${broadAdminAccess.length === 1 ? 'organization grants' : 'organizations grant'} all members administrator access to repositories by default.`,
        recommendation: 'Set the organization base permission to read or none, then grant elevated access through governed teams.',
        affectedResources: broadAdminAccess.map(organization => organization.organizationLogin),
      });
    }
    if (broadWriteAccess.length > 0) {
      findings.push({
        ruleKey: 'organization-default-repository-write',
        domain: 'identity',
        severity: 'medium',
        title: 'Organization members receive repository write access by default',
        summary: `${broadWriteAccess.length} ${broadWriteAccess.length === 1 ? 'organization grants' : 'organizations grant'} all members write access to repositories by default.`,
        recommendation: 'Reduce the organization base permission to read or none, then grant write access through governed teams.',
        affectedResources: broadWriteAccess.map(organization => organization.organizationLogin),
      });
    }
    if (publicCreationEnabled.length > 0) {
      findings.push({
        ruleKey: 'organization-public-repository-creation-enabled',
        domain: 'identity',
        severity: 'medium',
        title: 'Members can create public repositories',
        summary: `${publicCreationEnabled.length} ${publicCreationEnabled.length === 1 ? 'organization allows' : 'organizations allow'} members to create public repositories.`,
        recommendation: 'Restrict public repository creation to approved administrators or document the review process that governs public disclosure.',
        affectedResources: publicCreationEnabled.map(organization => organization.organizationLogin),
      });
    }
    if (outsideCollaborators.length > 0) {
      findings.push({
        ruleKey: 'outside-collaborator-review',
        domain: 'identity',
        severity: 'low',
        title: 'Outside collaborator access requires periodic review',
        summary: `${outsideCollaborators.length} outside collaborator ${outsideCollaborators.length === 1 ? 'grant was' : 'grants were'} discovered across the enterprise organizations.`,
        recommendation: 'Confirm that each outside collaborator has a current sponsor, an expiration or review date, and only the repository access required.',
        affectedResources: outsideCollaborators.map(
          collaborator => `${collaborator.organizationLogin}/${collaborator.login}`
        ),
      });
    }
  }

  if (input.repositoryAccess) {
    const enterpriseMemberLogins = new Set(
      input.members.map(member => member.login.toLowerCase())
    );
    const outsideCollaboratorsByOrganization = new Map(
      (input.organizationAccess ?? []).map(organization => [
        organization.organizationLogin.toLowerCase(),
        new Set(
          (organization.outsideCollaboratorLogins ?? []).map(login => login.toLowerCase())
        ),
      ])
    );
    const activeAccess = input.repositoryAccess.filter(
      repository => !repository.isArchived && !repository.isFork
    );
    const directGrants = activeAccess.flatMap(repository => (
      (repository.directCollaborators ?? []).map(collaborator => ({
        repository,
        collaborator,
      }))
    ));
    const teamGrants = activeAccess.flatMap(repository => (
      (repository.teamGrants ?? []).map(team => ({ repository, team }))
    ));
    const privilegedOutsideGrants = directGrants.filter(({ repository, collaborator }) => {
      const organization = repository.nameWithOwner.split('/')[0].toLowerCase();
      return (
        (collaborator.permission === 'admin' || collaborator.permission === 'maintain')
        && outsideCollaboratorsByOrganization.get(organization)?.has(
          collaborator.login.toLowerCase()
        )
      );
    });
    const outsideGrantKeys = new Set(
      privilegedOutsideGrants.map(
        ({ repository, collaborator }) => (
          `${repository.nameWithOwner.toLowerCase()}:${collaborator.login.toLowerCase()}`
        )
      )
    );
    const privilegedDirectGrants = directGrants.filter(({ repository, collaborator }) => (
      (collaborator.permission === 'admin' || collaborator.permission === 'maintain')
      && enterpriseMemberLogins.has(collaborator.login.toLowerCase())
      && !outsideGrantKeys.has(
        `${repository.nameWithOwner.toLowerCase()}:${collaborator.login.toLowerCase()}`
      )
    ));
    const writeDirectGrants = directGrants.filter(({ repository, collaborator }) => (
      collaborator.permission === 'write'
      && enterpriseMemberLogins.has(collaborator.login.toLowerCase())
      && !outsideCollaboratorsByOrganization
        .get(repository.nameWithOwner.split('/')[0].toLowerCase())
        ?.has(collaborator.login.toLowerCase())
    ));

    directRepositoryGrantCount = directGrants.length;
    teamRepositoryGrantCount = teamGrants.length;

    if (privilegedOutsideGrants.length > 0) {
      findings.push({
        ruleKey: 'outside-collaborator-privileged-repository-access',
        domain: 'identity',
        severity: 'high',
        title: 'Outside collaborators hold privileged repository access',
        summary: `${privilegedOutsideGrants.length} direct outside-collaborator ${privilegedOutsideGrants.length === 1 ? 'grant provides' : 'grants provide'} administrator or maintain access.`,
        recommendation: 'Remove privileged outside access where possible and use a narrowly scoped team or lower repository role for approved external contributors.',
        affectedResources: privilegedOutsideGrants.map(
          ({ repository, collaborator }) => (
            `${repository.nameWithOwner}:${collaborator.login} (${collaborator.permission})`
          )
        ),
      });
    }
    if (privilegedDirectGrants.length > 0) {
      findings.push({
        ruleKey: 'direct-privileged-repository-access',
        domain: 'identity',
        severity: 'medium',
        title: 'Repositories have direct privileged grants',
        summary: `${privilegedDirectGrants.length} direct ${privilegedDirectGrants.length === 1 ? 'grant provides' : 'grants provide'} administrator or maintain access outside team governance.`,
        recommendation: 'Move durable privileged access into governed teams and retain direct grants only for documented exceptions.',
        affectedResources: privilegedDirectGrants.map(
          ({ repository, collaborator }) => (
            `${repository.nameWithOwner}:${collaborator.login} (${collaborator.permission})`
          )
        ),
      });
    }
    if (writeDirectGrants.length > 0) {
      findings.push({
        ruleKey: 'direct-write-repository-access-review',
        domain: 'identity',
        severity: 'low',
        title: 'Repositories have direct write grants',
        summary: `${writeDirectGrants.length} direct ${writeDirectGrants.length === 1 ? 'grant provides' : 'grants provide'} write access outside team governance.`,
        recommendation: 'Review direct write grants and move durable access into governed teams.',
        affectedResources: writeDirectGrants.map(
          ({ repository, collaborator }) => (
            `${repository.nameWithOwner}:${collaborator.login} (${collaborator.permission})`
          )
        ),
      });
    }
  }

  if (input.scim) {
    activeScimIdentities = input.scim.identities.filter(identity => identity.active).length;
    inactiveScimIdentities = input.scim.identities.length - activeScimIdentities;
  }

  if (staleRepositories.length > 0) {
    findings.push({
      ruleKey: 'stale-active-repositories',
      domain: 'repositories',
      severity: 'medium',
      title: 'Active repositories show no recent repository updates',
      summary: `${staleRepositories.length} non-archived ${staleRepositories.length === 1 ? 'repository has' : 'repositories have'} not been updated in at least ${STALE_REPOSITORY_DAYS} days.`,
      recommendation: 'Confirm whether these repositories are still needed, then archive, transfer, or document ownership for those that remain active.',
      affectedResources: staleRepositories.map(repository => repository.nameWithOwner),
    });
  }

  if (publicRepositories.length > 0) {
    findings.push({
      ruleKey: 'public-repository-review',
      domain: 'repositories',
      severity: 'low',
      title: 'Public repository visibility requires periodic review',
      summary: `${publicRepositories.length} ${publicRepositories.length === 1 ? 'repository is' : 'repositories are'} publicly visible. Public visibility may be intentional, but should be explicitly reviewed.`,
      recommendation: 'Verify that each public repository has an active owner and is approved for public disclosure.',
      affectedResources: publicRepositories.map(repository => repository.nameWithOwner),
    });
  }

  let defaultBranchRepositories = 0;
  let protectedDefaultBranches = 0;
  let rulesetProtectedDefaultBranches = 0;
  let classicProtectedDefaultBranches = 0;
  let defaultBranchesRequiringPullRequests = 0;
  let defaultBranchesRequiringStatusChecks = 0;
  let defaultBranchProtectionUnknownRepositories = 0;
  let repositoriesWithoutDefaultBranches = 0;
  if (input.repositoryRules) {
    const eligibleRepositories = input.repositoryRules.filter(
      repository => !repository.isArchived && !repository.isFork
    );
    const repositoriesWithBranches = eligibleRepositories.filter(
      repository => repository.branchExists === true
    );
    const unprotectedRepositories = repositoriesWithBranches.filter(
      repository => repository.hasProtection === false
    );
    const reviewControlGaps = repositoriesWithBranches.filter(repository => (
      repository.hasProtection === true
      && (
        repository.requiresPullRequest === false
        || repository.requiredApprovingReviewCount === 0
      )
    ));
    const statusCheckGaps = repositoriesWithBranches.filter(repository => (
      repository.hasProtection === true
      && repository.requiresStatusChecks === false
    ));
    const historyControlGaps = repositoriesWithBranches.filter(repository => (
      repository.hasProtection === true
      && (
        repository.blocksForcePushes === false
        || repository.blocksDeletions === false
      )
    ));

    defaultBranchRepositories = repositoriesWithBranches.length;
    protectedDefaultBranches = repositoriesWithBranches.filter(
      repository => repository.hasProtection === true
    ).length;
    rulesetProtectedDefaultBranches = repositoriesWithBranches.filter(
      repository => (repository.activeRulesetIds?.length ?? 0) > 0
    ).length;
    classicProtectedDefaultBranches = repositoriesWithBranches.filter(
      repository => repository.classicProtection === true
    ).length;
    defaultBranchesRequiringPullRequests = repositoriesWithBranches.filter(
      repository => repository.requiresPullRequest === true
    ).length;
    defaultBranchesRequiringStatusChecks = repositoriesWithBranches.filter(
      repository => repository.requiresStatusChecks === true
    ).length;
    defaultBranchProtectionUnknownRepositories = eligibleRepositories.filter(repository => (
      repository.branchExists === null
      || (repository.branchExists === true && repository.hasProtection === null)
    )).length;
    repositoriesWithoutDefaultBranches = eligibleRepositories.filter(
      repository => repository.branchExists === false
    ).length;

    if (unprotectedRepositories.length > 0) {
      findings.push({
        ruleKey: 'default-branch-protection-missing',
        domain: 'repositories',
        severity: 'high',
        title: 'Default branches have no active protection',
        summary: `${unprotectedRepositories.length} active, non-fork ${unprotectedRepositories.length === 1 ? 'repository has' : 'repositories have'} neither classic branch protection nor active ruleset rules on the default branch.`,
        recommendation: 'Apply an enforced organization or enterprise ruleset that requires pull requests and blocks destructive history changes on default branches.',
        affectedResources: unprotectedRepositories.map(repository => repository.nameWithOwner),
      });
    }
    if (reviewControlGaps.length > 0) {
      findings.push({
        ruleKey: 'default-branch-review-controls-incomplete',
        domain: 'repositories',
        severity: 'medium',
        title: 'Protected default branches have incomplete review gates',
        summary: `${reviewControlGaps.length} protected default ${reviewControlGaps.length === 1 ? 'branch does' : 'branches do'} not require pull requests with at least one approving review.`,
        recommendation: 'Require pull requests and at least one approving review for each affected default branch.',
        affectedResources: reviewControlGaps.map(repository => repository.nameWithOwner),
      });
    }
    if (statusCheckGaps.length > 0) {
      findings.push({
        ruleKey: 'default-branch-status-checks-missing',
        domain: 'repositories',
        severity: 'low',
        title: 'Protected default branches do not require status checks',
        summary: `${statusCheckGaps.length} protected default ${statusCheckGaps.length === 1 ? 'branch has' : 'branches have'} no required status-check rule.`,
        recommendation: 'Require the minimum trusted build, test, and security checks that must pass before changes merge.',
        affectedResources: statusCheckGaps.map(repository => repository.nameWithOwner),
      });
    }
    if (historyControlGaps.length > 0) {
      findings.push({
        ruleKey: 'default-branch-history-controls-incomplete',
        domain: 'repositories',
        severity: 'medium',
        title: 'Protected default branches allow destructive history changes',
        summary: `${historyControlGaps.length} protected default ${historyControlGaps.length === 1 ? 'branch does' : 'branches do'} not block both force pushes and branch deletion.`,
        recommendation: 'Block force pushes and branch deletion through classic protection or active ruleset controls.',
        affectedResources: historyControlGaps.map(repository => repository.nameWithOwner),
      });
    }
  }

  let activeRulesetCount = 0;
  let rulesetsWithBypassActors = 0;
  let rulesetBypassActorCount = 0;
  let unconditionalBypassActorCount = 0;
  let pullRequestBypassActorCount = 0;
  if (input.rulesets) {
    const activeRulesets = input.rulesets.filter(ruleset => ruleset.enforcement === 'active');
    const bypassActors = activeRulesets.flatMap(ruleset => (
      ruleset.bypassActors.map(actor => ({ ruleset, actor }))
    ));
    const unconditionalActors = bypassActors.filter(
      ({ actor }) => actor.bypassMode === 'always' || actor.bypassMode === 'exempt'
    );
    const broadActorTypes = new Set([
      'EnterpriseOwner',
      'OrganizationAdmin',
      'RepositoryRole',
    ]);
    const broadUnconditionalActors = unconditionalActors.filter(
      ({ actor }) => broadActorTypes.has(actor.actorType)
    );
    const scopedUnconditionalActors = unconditionalActors.filter(
      ({ actor }) => !broadActorTypes.has(actor.actorType)
    );

    activeRulesetCount = activeRulesets.length;
    rulesetsWithBypassActors = activeRulesets.filter(
      ruleset => ruleset.bypassActors.length > 0
    ).length;
    rulesetBypassActorCount = bypassActors.length;
    unconditionalBypassActorCount = unconditionalActors.length;
    pullRequestBypassActorCount = bypassActors.filter(
      ({ actor }) => actor.bypassMode === 'pull_request'
    ).length;

    if (broadUnconditionalActors.length > 0) {
      findings.push({
        ruleKey: 'ruleset-broad-unconditional-bypass',
        domain: 'repositories',
        severity: 'medium',
        title: 'Active rulesets allow broad unconditional bypass',
        summary: `${broadUnconditionalActors.length} broad ruleset ${broadUnconditionalActors.length === 1 ? 'actor can' : 'actors can'} bypass active protections outside the pull-request path.`,
        recommendation: 'Remove broad bypass roles where possible or limit exceptions to pull requests that remain reviewable and auditable.',
        affectedResources: broadUnconditionalActors.map(formatRulesetBypassResource),
      });
    }
    if (scopedUnconditionalActors.length > 0) {
      findings.push({
        ruleKey: 'ruleset-scoped-unconditional-bypass-review',
        domain: 'repositories',
        severity: 'low',
        title: 'Active rulesets include unconditional principal exceptions',
        summary: `${scopedUnconditionalActors.length} scoped ruleset ${scopedUnconditionalActors.length === 1 ? 'principal has' : 'principals have'} an always or exempt bypass mode.`,
        recommendation: 'Verify each team, user, integration, or deploy-key exception is still required and has a named owner.',
        affectedResources: scopedUnconditionalActors.map(formatRulesetBypassResource),
      });
    }
  }

  if (input.securityDefaults) {
    const defaultScopes = new Set(
      input.securityDefaults.map(configuration => configuration.defaultForNewRepositories)
    );
    const coversAllRepositoryVisibilities = (
      defaultScopes.has('all')
      || (
        defaultScopes.has('public')
        && (
          defaultScopes.has('private_and_internal')
          || (defaultScopes.has('private') && defaultScopes.has('internal'))
        )
      )
    );
    if (input.securityDefaults.length === 0) {
      findings.push({
        ruleKey: 'security-defaults-missing',
        domain: 'security',
        severity: 'high',
        title: 'No enterprise security configuration defaults were discovered',
        summary: 'New repositories do not inherit an enterprise code security configuration by default.',
        recommendation: 'Assign an enterprise security configuration as the default for new repositories.',
        affectedResources: [],
      });
    } else if (!coversAllRepositoryVisibilities) {
      findings.push({
        ruleKey: 'security-defaults-incomplete-visibility-coverage',
        domain: 'security',
        severity: 'medium',
        title: 'Security defaults do not cover every repository visibility',
        summary: `Enterprise security defaults currently cover: ${[...defaultScopes].join(', ')}.`,
        recommendation: 'Apply a code security configuration by default to new public, private, and internal repositories.',
        affectedResources: input.securityDefaults.map(configuration => configuration.configurationName),
      });
    }

    const incompleteConfigurations = input.securityDefaults.filter(configuration => (
      configuration.dependencyGraph !== 'enabled'
      || configuration.dependabotAlerts !== 'enabled'
      || configuration.codeScanningDefaultSetup !== 'enabled'
      || configuration.secretScanning !== 'enabled'
      || configuration.secretScanningPushProtection !== 'enabled'
    ));
    if (incompleteConfigurations.length > 0) {
      findings.push({
        ruleKey: 'security-defaults-core-features-disabled',
        domain: 'security',
        severity: 'high',
        title: 'Security defaults leave core protections disabled',
        summary: `${incompleteConfigurations.length} default ${incompleteConfigurations.length === 1 ? 'configuration does' : 'configurations do'} not enable dependency graph, Dependabot alerts, code scanning default setup, secret scanning, and push protection together.`,
        recommendation: 'Enable each core protection in the affected default security configurations, or document the approved exception.',
        affectedResources: incompleteConfigurations.map(configuration => configuration.configurationName),
      });
    }
  }

  let eligibleSecurityRepositories = 0;
  let repositorySecurityEvidence = 0;
  let codeSecurityEnabledRepositories = 0;
  let codeScanningDefaultSetupRepositories = 0;
  let secretScanningEnabledRepositories = 0;
  let pushProtectionEnabledRepositories = 0;
  let dependabotAlertsEnabledRepositories = 0;
  let dependabotSecurityUpdatesEnabledRepositories = 0;
  let securityConfigurationAppliedRepositories = 0;
  let repositorySecurityUnknownRepositories = 0;
  if (input.repositorySecurity) {
    const eligibleRepositories = input.repositorySecurity.filter(
      repository => !repository.isArchived && !repository.isFork
    );
    const repositoriesWithDisabledProtections = eligibleRepositories.filter(repository => (
      repository.codeSecurity === 'disabled'
      || repository.secretScanning === 'disabled'
      || repository.secretScanningPushProtection === 'disabled'
      || repository.dependabotAlerts === 'disabled'
    ));
    const repositoriesWithoutConfiguration = eligibleRepositories.filter(repository => (
      repository.configurationStatus === 'none'
      || repository.configurationStatus === 'detached'
      || repository.configurationStatus === 'removed'
      || repository.configurationStatus === 'removed_by_enterprise'
      || repository.configurationStatus === 'failed'
    ));

    eligibleSecurityRepositories = eligibleRepositories.length;
    repositorySecurityEvidence = eligibleRepositories.filter(repository => (
      repository.codeSecurity !== null
      || repository.secretScanning !== null
      || repository.secretScanningPushProtection !== null
      || repository.dependabotAlerts !== null
    )).length;
    codeSecurityEnabledRepositories = eligibleRepositories.filter(
      repository => repository.codeSecurity === 'enabled'
    ).length;
    codeScanningDefaultSetupRepositories = eligibleRepositories.filter(
      repository => repository.codeScanningDefaultSetup === 'configured'
    ).length;
    secretScanningEnabledRepositories = eligibleRepositories.filter(
      repository => repository.secretScanning === 'enabled'
    ).length;
    pushProtectionEnabledRepositories = eligibleRepositories.filter(
      repository => repository.secretScanningPushProtection === 'enabled'
    ).length;
    dependabotAlertsEnabledRepositories = eligibleRepositories.filter(
      repository => repository.dependabotAlerts === 'enabled'
    ).length;
    dependabotSecurityUpdatesEnabledRepositories = eligibleRepositories.filter(
      repository => repository.dependabotSecurityUpdates === 'enabled'
    ).length;
    securityConfigurationAppliedRepositories = eligibleRepositories.filter(repository => (
      repository.configurationStatus === 'attached'
      || repository.configurationStatus === 'enforced'
    )).length;
    repositorySecurityUnknownRepositories = eligibleRepositories.filter(repository => (
      repository.codeSecurity === null
      || repository.secretScanning === null
      || repository.secretScanningPushProtection === null
      || repository.dependabotAlerts === null
    )).length;

    if (repositoriesWithDisabledProtections.length > 0) {
      findings.push({
        ruleKey: 'repository-security-core-features-disabled',
        domain: 'security',
        severity: 'medium',
        title: 'Repository security coverage is incomplete',
        summary: `${repositoriesWithDisabledProtections.length} active, non-fork ${repositoriesWithDisabledProtections.length === 1 ? 'repository has' : 'repositories have'} at least one explicitly disabled core protection among code security, secret scanning, push protection, and Dependabot alerts.`,
        recommendation: 'Review each affected repository, enable the applicable protections, and document approved exceptions for repositories where a control does not apply.',
        affectedResources: repositoriesWithDisabledProtections.map(repository => repository.nameWithOwner),
      });
    }
    if (repositoriesWithoutConfiguration.length > 0) {
      findings.push({
        ruleKey: 'repository-security-configuration-unassigned',
        domain: 'security',
        severity: 'low',
        title: 'Repositories are not governed by a code security configuration',
        summary: `${repositoriesWithoutConfiguration.length} active, non-fork ${repositoriesWithoutConfiguration.length === 1 ? 'repository is' : 'repositories are'} not currently attached to an enterprise or organization code security configuration.`,
        recommendation: 'Attach an approved code security configuration to reduce repository-level drift, or document why manual security settings are required.',
        affectedResources: repositoriesWithoutConfiguration.map(repository => repository.nameWithOwner),
      });
    }
  }

  if (input.actionsPolicy) {
    if (input.actionsPolicy.allowedActions === 'all') {
      findings.push({
        ruleKey: 'actions-unrestricted-sources',
        domain: 'actions',
        severity: 'medium',
        title: 'GitHub Actions can run from unrestricted sources',
        summary: 'The enterprise Actions policy allows all actions and reusable workflows.',
        recommendation: 'Restrict Actions to enterprise-owned sources or an approved allow list where operationally feasible.',
        affectedResources: [],
      });
    }
    if (!input.actionsPolicy.shaPinningRequired) {
      findings.push({
        ruleKey: 'actions-sha-pinning-not-required',
        domain: 'actions',
        severity: 'medium',
        title: 'Actions are not required to use full commit SHA references',
        summary: 'Workflow dependencies may use mutable tags or branches instead of immutable commit references.',
        recommendation: 'Require full-length commit SHA pinning and establish a process for reviewing dependency updates.',
        affectedResources: [],
      });
    }
  }

  let selfHostedRunnerCount = 0;
  let offlineSelfHostedRunnerCount = 0;
  let runnerGroupCount = 0;
  let publicRepositoryRunnerGroupCount = 0;
  let broadlyAccessibleRunnerGroupCount = 0;
  if (input.actionsEvidence) {
    const evidence = input.actionsEvidence;
    if (evidence.selectedActions?.patternsAllowed?.some(pattern => {
      const normalized = pattern.trim();
      return normalized === '*' || normalized === '*/*';
    })) {
      findings.push({
        ruleKey: 'actions-selected-policy-broad-patterns',
        domain: 'actions',
        severity: 'medium',
        title: 'The selected Actions allow list contains a global wildcard',
        summary: 'The selected Actions policy includes a pattern that permits actions or reusable workflows from any source.',
        recommendation: 'Replace global wildcards with the minimum approved organization, repository, and action patterns.',
        affectedResources: evidence.selectedActions.patternsAllowed,
      });
    }

    if (evidence.workflowPermissions?.defaultWorkflowPermissions === 'write') {
      findings.push({
        ruleKey: 'actions-default-workflow-write-permissions',
        domain: 'actions',
        severity: 'high',
        title: 'Workflows receive write permissions by default',
        summary: 'The enterprise default grants write access to the GITHUB_TOKEN unless a workflow reduces its permissions.',
        recommendation: 'Set the enterprise default workflow permission to read, then grant write scopes explicitly in reviewed workflows.',
        affectedResources: [],
      });
    }
    if (evidence.workflowPermissions?.canApprovePullRequestReviews) {
      findings.push({
        ruleKey: 'actions-workflows-can-approve-pull-requests',
        domain: 'actions',
        severity: 'medium',
        title: 'Workflows can approve pull requests',
        summary: 'GitHub Actions workflows are allowed to create approving pull-request reviews.',
        recommendation: 'Disable workflow pull-request approvals unless an approved automation scenario requires them.',
        affectedResources: [],
      });
    }

    const forkPolicy = evidence.forkPullRequestPolicy;
    if (
      forkPolicy?.runWorkflowsFromForkPullRequests
      && (forkPolicy.sendWriteTokensToWorkflows || forkPolicy.sendSecretsAndVariables)
    ) {
      findings.push({
        ruleKey: 'actions-private-fork-workflows-receive-privileged-data',
        domain: 'actions',
        severity: 'high',
        title: 'Private fork workflows can receive privileged data',
        summary: 'Workflows triggered from private repository forks can receive write tokens, secrets, or variables.',
        recommendation: 'Disable write-token and secret access for fork pull-request workflows, then use narrowly scoped trusted workflows for privileged operations.',
        affectedResources: [],
      });
    } else if (
      forkPolicy?.runWorkflowsFromForkPullRequests
      && !forkPolicy.requireApprovalForForkPullRequestWorkflows
    ) {
      findings.push({
        ruleKey: 'actions-private-fork-workflows-run-without-approval',
        domain: 'actions',
        severity: 'medium',
        title: 'Private fork workflows can run without approval',
        summary: 'Pull requests from private repository forks can start workflows without an approval gate.',
        recommendation: 'Require approval before running fork pull-request workflows, or disable those workflows if they are not needed.',
        affectedResources: [],
      });
    }

    const runners = evidence.runners ?? [];
    const runnerGroups = evidence.runnerGroups ?? [];
    selfHostedRunnerCount = runners.length;
    offlineSelfHostedRunnerCount = runners.filter(
      runner => !runner.ephemeral && runner.status !== 'online'
    ).length;
    runnerGroupCount = runnerGroups.length;
    publicRepositoryRunnerGroupCount = runnerGroups.filter(
      group => group.allowsPublicRepositories
    ).length;

    const runnerGroupIdsWithRunners = new Set(
      runners
        .map(runner => runner.runnerGroupId)
        .filter((groupId): groupId is number => groupId !== null)
    );
    const publicRepositoryRunnerGroups = runnerGroups.filter(
      group => group.allowsPublicRepositories
    );
    const broadlyAccessibleRunnerGroups = runnerGroups.filter(
      group =>
        runnerGroupIdsWithRunners.has(group.githubId)
        && group.visibility === 'all'
        && group.restrictedToWorkflows === false
    );
    broadlyAccessibleRunnerGroupCount = broadlyAccessibleRunnerGroups.length;

    if (publicRepositoryRunnerGroups.length > 0) {
      findings.push({
        ruleKey: 'actions-runner-groups-allow-public-repositories',
        domain: 'actions',
        severity: 'high',
        title: 'Self-hosted runner groups allow public repositories',
        summary: `${publicRepositoryRunnerGroups.length} ${publicRepositoryRunnerGroups.length === 1 ? 'runner group permits' : 'runner groups permit'} public repositories to schedule jobs.`,
        recommendation: 'Disable public repository access for self-hosted runner groups and use GitHub-hosted runners for untrusted public workflows.',
        affectedResources: publicRepositoryRunnerGroups.map(group => group.name),
      });
    }
    if (broadlyAccessibleRunnerGroups.length > 0) {
      findings.push({
        ruleKey: 'actions-runner-groups-broadly-accessible',
        domain: 'actions',
        severity: 'medium',
        title: 'Runner groups with active capacity have broad workflow access',
        summary: `${broadlyAccessibleRunnerGroups.length} ${broadlyAccessibleRunnerGroups.length === 1 ? 'runner group is' : 'runner groups are'} available to all organizations without a selected-workflow restriction.`,
        recommendation: 'Limit self-hosted runner groups to the organizations and reusable workflows that require their trust boundary.',
        affectedResources: broadlyAccessibleRunnerGroups.map(group => group.name),
      });
    }

    const offlineRunners = runners.filter(
      runner => !runner.ephemeral && runner.status !== 'online'
    );
    if (offlineRunners.length > 0) {
      findings.push({
        ruleKey: 'actions-self-hosted-runners-offline',
        domain: 'actions',
        severity: 'low',
        title: 'Persistent self-hosted runners are offline',
        summary: `${offlineRunners.length} non-ephemeral self-hosted ${offlineRunners.length === 1 ? 'runner is' : 'runners are'} not online.`,
        recommendation: 'Remove retired runners or restore and monitor the runner services that should remain available.',
        affectedResources: offlineRunners.map(runner => runner.name),
      });
    }
  }

  let activeCopilotSeats = 0;
  let inactiveCopilotSeats = 0;
  let pendingCopilotSeatCancellations = 0;
  let duplicateCopilotAssignments = 0;
  if (input.copilotSeats) {
    const activityThreshold = now.getTime() - COPILOT_ACTIVITY_DAYS * 24 * 60 * 60 * 1000;
    const inactiveSeats = input.copilotSeats.seats.filter(seat => {
      if (seat.pendingCancellationDate) return false;
      const createdAt = new Date(seat.createdAt).getTime();
      const lastActivityAt = seat.lastActivityAt
        ? new Date(seat.lastActivityAt).getTime()
        : null;
      return createdAt < activityThreshold
        && (lastActivityAt === null || lastActivityAt < activityThreshold);
    });
    activeCopilotSeats = input.copilotSeats.seats.filter(seat => {
      if (!seat.lastActivityAt) return false;
      return new Date(seat.lastActivityAt).getTime() >= activityThreshold;
    }).length;
    inactiveCopilotSeats = inactiveSeats.length;
    pendingCopilotSeatCancellations = input.copilotSeats.seats.filter(
      seat => seat.pendingCancellationDate !== null
    ).length;
    duplicateCopilotAssignments = Math.max(
      0,
      input.copilotSeats.rawAssignmentCount - input.copilotSeats.seats.length
    );
    if (inactiveSeats.length > 0) {
      findings.push({
        ruleKey: 'copilot-inactive-seats',
        domain: 'copilot',
        severity: 'medium',
        title: 'Billed Copilot seats show no recent activity',
        summary: `${inactiveSeats.length} ${inactiveSeats.length === 1 ? 'seat has' : 'seats have'} no recorded Copilot activity in the last ${COPILOT_ACTIVITY_DAYS} days after a ${COPILOT_ACTIVITY_DAYS}-day adoption window.`,
        recommendation: 'Confirm whether these users still need Copilot, then reassign or cancel unused seats and follow up on adoption barriers.',
        affectedResources: inactiveSeats.map(seat => seat.login),
      });
    }
  }

  let copilotOrganizationsMeasured = 0;
  let copilotOrganizationsWithSeats = 0;
  let copilotOrganizationsAllowingPublicCode = 0;
  let copilotOrganizationsAssigningAllSeats = 0;
  let copilotOrganizationsWithBroadCodingAgentAccess = 0;
  let copilotContentExclusionRules = 0;
  if (input.copilotEvidence) {
    const measuredOrganizations = input.copilotEvidence.organizations.filter(
      organization => organization.seatTotal !== null
    );
    const licensedOrganizations = measuredOrganizations.filter(
      organization => (organization.seatTotal ?? 0) > 0
    );
    const assigningAllSeats = licensedOrganizations.filter(
      organization => organization.seatManagementSetting === 'assign_all'
    );
    const allowingPublicCode = licensedOrganizations.filter(
      organization => organization.publicCodeSuggestions === 'allow'
    );
    const broadCodingAgentAccess = licensedOrganizations.filter(
      organization => organization.codingAgentRepositoryScope === 'all'
    );

    copilotOrganizationsMeasured = measuredOrganizations.length;
    copilotOrganizationsWithSeats = licensedOrganizations.length;
    copilotOrganizationsAllowingPublicCode = allowingPublicCode.length;
    copilotOrganizationsAssigningAllSeats = assigningAllSeats.length;
    copilotOrganizationsWithBroadCodingAgentAccess = broadCodingAgentAccess.length;
    copilotContentExclusionRules = input.copilotEvidence.contentExclusionRuleCount ?? 0;

    if (assigningAllSeats.length > 0) {
      findings.push({
        ruleKey: 'copilot-assign-all-seat-management',
        domain: 'copilot',
        severity: 'medium',
        title: 'Copilot seats are assigned to all organization members',
        summary: `${assigningAllSeats.length} licensed ${assigningAllSeats.length === 1 ? 'organization assigns' : 'organizations assign'} Copilot seats automatically to every member.`,
        recommendation: 'Confirm that universal assignment is intentional and cost-effective, or change seat management to selected users and teams.',
        affectedResources: assigningAllSeats.map(organization => organization.organizationLogin),
      });
    }
    if (allowingPublicCode.length > 0) {
      findings.push({
        ruleKey: 'copilot-public-code-suggestions-review',
        domain: 'copilot',
        severity: 'low',
        title: 'Suggestions matching public code are allowed',
        summary: `${allowingPublicCode.length} licensed ${allowingPublicCode.length === 1 ? 'organization allows' : 'organizations allow'} Copilot suggestions that may match public code.`,
        recommendation: 'Confirm that the public-code suggestion policy matches legal and engineering guidance, and document the approved position.',
        affectedResources: allowingPublicCode.map(organization => organization.organizationLogin),
      });
    }
    if (broadCodingAgentAccess.length > 0) {
      findings.push({
        ruleKey: 'copilot-coding-agent-all-repositories',
        domain: 'copilot',
        severity: 'low',
        title: 'Copilot coding agent is enabled for all repositories',
        summary: `${broadCodingAgentAccess.length} licensed ${broadCodingAgentAccess.length === 1 ? 'organization enables' : 'organizations enable'} the coding agent across every repository.`,
        recommendation: 'Review whether coding-agent access should be limited to explicitly approved repositories.',
        affectedResources: broadCodingAgentAccess.map(
          organization => organization.organizationLogin
        ),
      });
    }
  }

  let enforcingBudgets = 0;
  let alertingBudgets = 0;
  let userLevelBudgets = 0;
  if (input.budgets) {
    const budgetsWithoutEnforcement = input.budgets.filter(budget => !budget.preventsFurtherUsage);
    const budgetsWithoutAlerting = input.budgets.filter(
      budget => budget.scope !== 'user' && !budget.alertingEnabled
    );
    enforcingBudgets = input.budgets.filter(budget => budget.preventsFurtherUsage).length;
    alertingBudgets = input.budgets.filter(
      budget => budget.scope !== 'user' && budget.alertingEnabled
    ).length;
    userLevelBudgets = input.budgets.filter(
      budget => budget.scope === 'user'
        || budget.scope === 'multi_user_customer'
        || budget.scope === 'multi_user_cost_center'
    ).length;

    if (input.budgets.length === 0) {
      findings.push({
        ruleKey: 'billing-budgets-missing',
        domain: 'billing',
        severity: 'medium',
        title: 'No enterprise budgets were discovered',
        summary: 'The enterprise has no budget controls for metered products or user-level allowances.',
        recommendation: 'Define budgets for material metered products and user populations, with intentional enforcement and alerting settings.',
        affectedResources: [],
      });
    }
    if (budgetsWithoutEnforcement.length > 0) {
      findings.push({
        ruleKey: 'billing-budget-enforcement-disabled',
        domain: 'billing',
        severity: 'medium',
        title: 'Some budgets do not prevent further usage',
        summary: `${budgetsWithoutEnforcement.length} ${budgetsWithoutEnforcement.length === 1 ? 'budget allows' : 'budgets allow'} usage to continue after the configured amount is reached.`,
        recommendation: 'Confirm that continued usage is intentional, then enable usage prevention or document the approved exception.',
        affectedResources: budgetsWithoutEnforcement.map(formatBudgetResource),
      });
    }
    if (budgetsWithoutAlerting.length > 0) {
      findings.push({
        ruleKey: 'billing-budget-alerting-disabled',
        domain: 'billing',
        severity: 'low',
        title: 'Some shared budgets do not send alerts',
        summary: `${budgetsWithoutAlerting.length} non-user ${budgetsWithoutAlerting.length === 1 ? 'budget has' : 'budgets have'} alerting disabled. GitHub does not support alerts for individual user-scope budgets, so those are excluded.`,
        recommendation: 'Enable alerting and assign accountable recipients for shared budgets that require advance notice before enforcement.',
        affectedResources: budgetsWithoutAlerting.map(formatBudgetResource),
      });
    }
    const alertingWithoutRecipients = input.budgets.filter(
      budget => budget.alertingEnabled && budget.alertRecipientCount === 0
    );
    if (alertingWithoutRecipients.length > 0) {
      findings.push({
        ruleKey: 'billing-budget-alert-recipients-missing',
        domain: 'billing',
        severity: 'low',
        title: 'Budget alerting has no accountable recipient',
        summary: `${alertingWithoutRecipients.length} ${alertingWithoutRecipients.length === 1 ? 'budget enables' : 'budgets enable'} alerting without a reported recipient.`,
        recommendation: 'Assign at least one accountable recipient to every shared budget with alerting enabled.',
        affectedResources: alertingWithoutRecipients.map(formatBudgetResource),
      });
    }
  }

  let activeCostCenters = 0;
  let emptyActiveCostCenters = 0;
  let costCenterResources = 0;
  let costCenterUserMemberships = 0;
  let effectiveUserBudgets = 0;
  let usersWithoutEffectiveBudgets = 0;
  let multiUserBudgetStates = 0;
  let billingUsageItems = 0;
  let billingNetAmount = 0;
  let sharedCostCenterBudgets = 0;
  let perUserCostCenterBudgets = 0;
  if (input.billingEvidence) {
    const costCenterInventoryKnown = !input.billingEvidence.failures.some(
      failure => failure.check === 'cost-centers'
    );
    const activeCenters = input.billingEvidence.costCenters.filter(
      costCenter => costCenter.state === 'active'
    );
    const emptyCenters = activeCenters.filter(
      costCenter => costCenter.resources !== null && costCenter.resources.length === 0
    );
    activeCostCenters = activeCenters.length;
    emptyActiveCostCenters = emptyCenters.length;
    costCenterResources = activeCenters.reduce(
      (total, costCenter) => total + (costCenter.resources?.length ?? 0),
      0
    );
    costCenterUserMemberships = activeCenters.reduce(
      (total, costCenter) => total + (costCenter.resources?.filter(
        resource => resource.type.toLowerCase() === 'user'
      ).length ?? 0),
      0
    );
    effectiveUserBudgets = input.billingEvidence.effectiveBudgets.filter(
      budget => budget.budgetId !== null
    ).length;
    usersWithoutEffectiveBudgets = input.billingEvidence.effectiveBudgets.length
      - effectiveUserBudgets;
    multiUserBudgetStates = input.billingEvidence.multiUserBudgetStates.length;
    billingUsageItems = input.billingEvidence.usage?.items.length ?? 0;
    billingNetAmount = input.billingEvidence.usage?.items.reduce(
      (total, item) => total + item.netAmount,
      0
    ) ?? 0;
    sharedCostCenterBudgets = input.budgets?.filter(
      budget => budget.scope === 'cost_center'
    ).length ?? 0;
    perUserCostCenterBudgets = input.budgets?.filter(
      budget => budget.scope === 'multi_user_cost_center'
    ).length ?? 0;

    if (emptyCenters.length > 0) {
      findings.push({
        ruleKey: 'billing-empty-active-cost-centers',
        domain: 'billing',
        severity: 'low',
        title: 'Active cost centers have no assigned resources',
        summary: `${emptyCenters.length} active cost ${emptyCenters.length === 1 ? 'center has' : 'centers have'} no reported users, teams, organizations, or repositories.`,
        recommendation: 'Assign the intended resources or remove unused cost centers to keep billing ownership clear.',
        affectedResources: emptyCenters.map(costCenter => costCenter.name),
      });
    }

    if (costCenterInventoryKnown && input.budgets) {
      const activeNames = new Set(
        activeCenters.map(costCenter => costCenter.name.toLowerCase())
      );
      const unmatchedCostCenterBudgets = input.budgets.filter(
        budget => (
          budget.scope === 'cost_center' || budget.scope === 'multi_user_cost_center'
        )
          && budget.entityName !== null
          && !activeNames.has(budget.entityName.toLowerCase())
      );
      if (unmatchedCostCenterBudgets.length > 0) {
        findings.push({
          ruleKey: 'billing-budget-cost-center-not-found',
          domain: 'billing',
          severity: 'medium',
          title: 'Budgets reference unavailable active cost centers',
          summary: `${unmatchedCostCenterBudgets.length} cost-center ${unmatchedCostCenterBudgets.length === 1 ? 'budget does' : 'budgets do'} not match the active cost-center inventory.`,
          recommendation: 'Confirm that each budget points to the intended active cost center and remove stale billing controls.',
          affectedResources: unmatchedCostCenterBudgets.map(formatBudgetResource),
        });
      }
    }
  }

  const assessedDomains: AssessmentDomain[] = ['identity', 'repositories'];
  if (input.securityDefaults || input.repositorySecurity) assessedDomains.push('security');
  if (input.actionsPolicy || input.actionsEvidence) assessedDomains.push('actions');
  if (input.copilotSeats || input.copilotEvidence) assessedDomains.push('copilot');
  if (input.budgets || input.billingEvidence) assessedDomains.push('billing');
  const detailedFindings = findings.map(finding => ({
    ...finding,
    ...getAssessmentFindingEvidence(finding.ruleKey),
  }));
  const { healthScore, domainScores } = calculateAssessmentScores(
    detailedFindings,
    assessedDomains
  );

  return {
    healthScore,
    assessedDomainCount: assessedDomains.length,
    domainScores,
    findings: detailedFindings,
    metrics: {
      activeRepositories: activeRepositories.length,
      archivedRepositories: input.repositories.filter(repository => repository.isArchived).length,
      forkRepositories: input.repositories.filter(repository => repository.isFork).length,
      internalRepositories: input.repositories.filter(repository => repository.visibility === 'INTERNAL').length,
      privateRepositories: input.repositories.filter(repository => repository.visibility === 'PRIVATE').length,
      publicRepositories: publicRepositories.length,
      staleActiveRepositories: staleRepositories.length,
      ...(input.organizationAccess ? {
        organizationsWithAccessSettings,
        organizationsWithPublicRepositoryCreation,
        outsideCollaboratorCount,
      } : {}),
      ...(input.repositoryAccess ? {
        directRepositoryGrantCount,
        teamRepositoryGrantCount,
      } : {}),
      ...(input.scim ? {
        activeScimIdentities,
        humanEnterpriseMembers,
        inactiveScimIdentities,
        scimIdentities: input.scim.totalResults,
      } : {}),
      ...(input.repositoryRules ? {
        classicProtectedDefaultBranches,
        defaultBranchProtectionUnknownRepositories,
        defaultBranchRepositories,
        defaultBranchesRequiringPullRequests,
        defaultBranchesRequiringStatusChecks,
        protectedDefaultBranches,
        repositoriesWithoutDefaultBranches,
        rulesetProtectedDefaultBranches,
      } : {}),
      ...(input.rulesets ? {
        activeRulesetCount,
        pullRequestBypassActorCount,
        rulesetBypassActorCount,
        rulesetsWithBypassActors,
        unconditionalBypassActorCount,
      } : {}),
      ...(input.repositorySecurity ? {
        codeScanningDefaultSetupRepositories,
        codeSecurityEnabledRepositories,
        dependabotAlertsEnabledRepositories,
        dependabotSecurityUpdatesEnabledRepositories,
        eligibleSecurityRepositories,
        pushProtectionEnabledRepositories,
        repositorySecurityEvidence,
        repositorySecurityUnknownRepositories,
        secretScanningEnabledRepositories,
        securityConfigurationAppliedRepositories,
      } : {}),
      ...(input.actionsEvidence ? {
        broadlyAccessibleRunnerGroupCount,
        offlineSelfHostedRunnerCount,
        publicRepositoryRunnerGroupCount,
        runnerGroupCount,
        selfHostedRunnerCount,
      } : {}),
      ...(input.copilotSeats ? {
        activeCopilotSeats,
        copilotSeats: input.copilotSeats.totalSeats,
        duplicateCopilotAssignments,
        inactiveCopilotSeats,
        pendingCopilotSeatCancellations,
      } : {}),
      ...(input.copilotEvidence ? {
        copilotContentExclusionRules,
        copilotOrganizationsAllowingPublicCode,
        copilotOrganizationsAssigningAllSeats,
        copilotOrganizationsMeasured,
        copilotOrganizationsWithBroadCodingAgentAccess,
        copilotOrganizationsWithSeats,
      } : {}),
      ...(input.budgets ? {
        alertingBudgets,
        budgets: input.budgets.length,
        budgetsWithoutUsagePrevention: input.budgets.length - enforcingBudgets,
        enforcingBudgets,
        userLevelBudgets,
      } : {}),
      ...(input.billingEvidence ? {
        activeCostCenters,
        billingNetAmount,
        billingUsageItems,
        costCenterResources,
        costCenterUserMemberships,
        effectiveUserBudgets,
        emptyActiveCostCenters,
        multiUserBudgetStates,
        perUserCostCenterBudgets,
        sharedCostCenterBudgets,
        usersWithoutEffectiveBudgets,
      } : {}),
    },
  };
}

function normalizeRepositorySecurityFeatures(data: unknown): Pick<
  AssessmentRepositorySecurity,
  | 'codeSecurity'
  | 'secretScanning'
  | 'secretScanningPushProtection'
  | 'dependabotSecurityUpdates'
> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('GitHub returned an invalid repository details response');
  }
  const securityAndAnalysis = (data as Record<string, unknown>).security_and_analysis;
  if (!securityAndAnalysis || typeof securityAndAnalysis !== 'object' || Array.isArray(securityAndAnalysis)) {
    throw new Error('GitHub did not return repository security feature states');
  }
  const settings = securityAndAnalysis as Record<string, unknown>;
  const codeSecurity = readFeatureStatus(settings, 'code_security')
    ?? readFeatureStatus(settings, 'advanced_security');
  const secretScanning = readFeatureStatus(settings, 'secret_scanning');
  const secretScanningPushProtection = readFeatureStatus(
    settings,
    'secret_scanning_push_protection'
  );
  const dependabotSecurityUpdates = readFeatureStatus(settings, 'dependabot_security_updates');
  if (
    codeSecurity === null
    && secretScanning === null
    && secretScanningPushProtection === null
    && dependabotSecurityUpdates === null
  ) {
    throw new Error('GitHub returned no recognized repository security feature states');
  }
  return {
    codeSecurity,
    secretScanning,
    secretScanningPushProtection,
    dependabotSecurityUpdates,
  };
}

function normalizeRepositorySecurityConfiguration(data: unknown): Pick<
  AssessmentRepositorySecurity,
  'configurationStatus' | 'configurationId' | 'configurationName' | 'configurationEnforcement'
> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('GitHub returned an invalid repository security configuration response');
  }
  const record = data as Record<string, unknown>;
  const configuration = record.configuration;
  if (
    typeof record.status !== 'string'
    || !configuration
    || typeof configuration !== 'object'
    || Array.isArray(configuration)
  ) {
    throw new Error('GitHub returned an incomplete repository security configuration response');
  }
  const settings = configuration as Record<string, unknown>;
  if (
    typeof settings.id !== 'number'
    || typeof settings.name !== 'string'
    || typeof settings.enforcement !== 'string'
  ) {
    throw new Error('GitHub returned an incomplete repository security configuration');
  }
  return {
    configurationStatus: record.status,
    configurationId: settings.id,
    configurationName: settings.name,
    configurationEnforcement: settings.enforcement,
  };
}

function normalizeCodeScanningDefaultSetup(data: unknown): string {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('GitHub returned an invalid code scanning default setup response');
  }
  const state = (data as Record<string, unknown>).state;
  if (state !== 'configured' && state !== 'not-configured') {
    throw new Error('GitHub returned an incomplete code scanning default setup response');
  }
  return state;
}

function readFeatureStatus(settings: Record<string, unknown>, key: string): string | null {
  const value = settings[key];
  if (value === undefined || value === null) return null;
  if (
    typeof value !== 'object'
    || Array.isArray(value)
    || typeof (value as Record<string, unknown>).status !== 'string'
  ) {
    throw new Error(`GitHub returned an invalid ${key} repository security state`);
  }
  return (value as Record<string, unknown>).status as string;
}

function readRestMessage(data: unknown): string {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '';
  const message = (data as Record<string, unknown>).message;
  return typeof message === 'string' ? message : '';
}

function describeRestFailure(label: string, response: AssessmentRestResponse): string {
  const message = readRestMessage(response.data);
  return `GitHub returned ${response.status} for ${label}${message ? `: ${message}` : ''}`;
}

function normalizeCopilotSeat(value: unknown): AssessmentCopilotSeat {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('GitHub returned an invalid enterprise Copilot seat record');
  }
  const record = value as Record<string, unknown>;
  const assignee = record.assignee;
  if (
    !assignee
    || typeof assignee !== 'object'
    || Array.isArray(assignee)
    || typeof (assignee as Record<string, unknown>).login !== 'string'
    || typeof record.plan_type !== 'string'
    || typeof record.created_at !== 'string'
  ) {
    throw new Error('GitHub returned an incomplete enterprise Copilot seat record');
  }
  validateTimestamp(record.created_at, 'Copilot seat creation');
  const lastAuthenticatedAt = readNullableTimestamp(
    record.last_authenticated_at,
    'Copilot seat authentication'
  );
  const lastActivityAt = readNullableTimestamp(record.last_activity_at, 'Copilot seat activity');
  const pendingCancellationDate = readNullableTimestamp(
    record.pending_cancellation_date,
    'Copilot seat cancellation'
  );
  const organization = readAssessmentObject(record.organization);
  const assigningTeam = readAssessmentObject(record.assigning_team);
  return {
    login: ((assignee as Record<string, unknown>).login as string),
    planType: record.plan_type,
    createdAt: record.created_at,
    lastAuthenticatedAt,
    lastActivityAt,
    lastActivityEditor:
      typeof record.last_activity_editor === 'string' ? record.last_activity_editor : null,
    pendingCancellationDate,
    assignmentCount: 1,
    assignmentSources: [{
      organization: organization && typeof organization.login === 'string'
        ? organization.login
        : null,
      team: assigningTeam && typeof assigningTeam.slug === 'string'
        ? assigningTeam.slug
        : null,
      teamType: assigningTeam && typeof assigningTeam.type === 'string'
        ? assigningTeam.type
        : null,
    }],
  };
}

function normalizeBudget(value: unknown): AssessmentBudget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('GitHub returned an invalid enterprise budget record');
  }
  const record = value as Record<string, unknown>;
  const alerting = record.budget_alerting;
  if (
    typeof record.id !== 'string'
    || typeof record.budget_type !== 'string'
    || typeof record.budget_product_sku !== 'string'
    || typeof record.budget_scope !== 'string'
    || typeof record.budget_amount !== 'number'
    || typeof record.prevent_further_usage !== 'boolean'
    || !alerting
    || typeof alerting !== 'object'
    || Array.isArray(alerting)
    || typeof (alerting as Record<string, unknown>).will_alert !== 'boolean'
    || !Array.isArray((alerting as Record<string, unknown>).alert_recipients)
  ) {
    throw new Error('GitHub returned an incomplete enterprise budget record');
  }
  const consumedAmount = record.consumed_amount;
  if (consumedAmount !== undefined && consumedAmount !== null && typeof consumedAmount !== 'number') {
    throw new Error('GitHub returned an invalid enterprise budget consumption amount');
  }
  const expiresAt = record.expires_at;
  if (expiresAt !== undefined && expiresAt !== null && typeof expiresAt !== 'string') {
    throw new Error('GitHub returned an invalid enterprise budget expiration');
  }
  return {
    id: record.id,
    budgetType: record.budget_type,
    productSku: record.budget_product_sku,
    scope: record.budget_scope,
    amount: record.budget_amount,
    consumedAmount: consumedAmount ?? null,
    preventsFurtherUsage: record.prevent_further_usage,
    alertingEnabled: (alerting as Record<string, unknown>).will_alert as boolean,
    alertRecipientCount: ((alerting as Record<string, unknown>).alert_recipients as unknown[]).length,
    alertRecipients: ((alerting as Record<string, unknown>).alert_recipients as unknown[]).map(
      recipient => {
        if (typeof recipient !== 'string') {
          throw new Error('GitHub returned an invalid enterprise budget alert recipient');
        }
        return recipient;
      }
    ),
    entityName: typeof record.budget_entity_name === 'string' ? record.budget_entity_name : null,
    user: typeof record.user === 'string' ? record.user : null,
    expiresAt: typeof expiresAt === 'string' ? expiresAt : null,
  };
}

function normalizeCopilotOrganization(
  value: unknown
): Omit<AssessmentCopilotOrganization, 'organizationLogin' | 'codingAgentRepositoryScope'> {
  const settings = readAssessmentObject(value);
  const seats = settings ? readAssessmentObject(settings.seat_breakdown) : null;
  if (
    !settings
    || !seats
    || !Number.isInteger(seats.total)
    || !Number.isInteger(seats.added_this_cycle)
    || !Number.isInteger(seats.pending_cancellation)
    || !Number.isInteger(seats.pending_invitation)
    || !Number.isInteger(seats.active_this_cycle)
    || !Number.isInteger(seats.inactive_this_cycle)
    || typeof settings.plan_type !== 'string'
    || typeof settings.seat_management_setting !== 'string'
    || typeof settings.public_code_suggestions !== 'string'
    || typeof settings.ide_chat !== 'string'
    || typeof settings.platform_chat !== 'string'
    || typeof settings.cli !== 'string'
  ) {
    throw new Error('GitHub returned invalid organization Copilot settings');
  }
  return {
    seatTotal: seats.total as number,
    seatsAddedThisCycle: seats.added_this_cycle as number,
    seatsPendingCancellation: seats.pending_cancellation as number,
    seatsPendingInvitation: seats.pending_invitation as number,
    activeSeatsThisCycle: seats.active_this_cycle as number,
    inactiveSeatsThisCycle: seats.inactive_this_cycle as number,
    planType: settings.plan_type,
    seatManagementSetting: settings.seat_management_setting,
    publicCodeSuggestions: settings.public_code_suggestions,
    ideChat: settings.ide_chat,
    platformChat: settings.platform_chat,
    cli: settings.cli,
  };
}

function countCopilotContentExclusionRules(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  const rules = readAssessmentObject(value);
  if (!rules) {
    throw new Error('GitHub returned invalid enterprise Copilot content exclusion rules');
  }
  return Object.keys(rules).length;
}

async function collectCostCenterDetails(
  requests: AssessmentBillingRequests,
  costCenterId: string
): Promise<AssessmentCostCenter> {
  let page = 1;
  let costCenter: AssessmentCostCenter | null = null;
  const resources: AssessmentCostCenterResource[] = [];

  while (true) {
    const response = await requests.getCostCenter(costCenterId, page, REST_PAGE_SIZE);
    if (response.status !== 200) {
      throw new Error(describeRestFailure('billing cost center details', response));
    }
    const value = normalizeCostCenter(response.data, []);
    if (value.id !== costCenterId) {
      throw new Error(`GitHub returned the wrong billing cost center ${value.id}`);
    }
    if (costCenter && (
      costCenter.name !== value.name
      || costCenter.state !== value.state
      || costCenter.aiCreditPoolEnabled !== value.aiCreditPoolEnabled
    )) {
      throw new Error(`GitHub returned inconsistent billing cost center ${value.name}`);
    }
    costCenter = value;
    resources.push(...(value.resources ?? []));
    const record = readAssessmentObject(response.data);
    if (!record || typeof record.has_next_page !== 'boolean') {
      throw new Error('GitHub returned incomplete billing cost center pagination');
    }
    if (!record.has_next_page) break;
    page += 1;
  }

  if (!costCenter) {
    throw new Error(`GitHub returned no details for billing cost center ${costCenterId}`);
  }
  return {
    ...costCenter,
    resources: deduplicateCostCenterResources(resources),
  };
}

function normalizeCostCenter(
  value: unknown,
  unavailableResources: AssessmentCostCenterResource[] | null
): AssessmentCostCenter {
  const center = readAssessmentObject(value);
  if (
    !center
    || typeof center.id !== 'string'
    || typeof center.name !== 'string'
    || typeof center.state !== 'string'
    || typeof center.ai_credit_pool_enabled !== 'boolean'
  ) {
    throw new Error('GitHub returned an invalid billing cost center');
  }
  const rawResources = center.resources;
  let resources = unavailableResources;
  if (Array.isArray(rawResources)) {
    resources = rawResources.map(resourceValue => {
      const resource = readAssessmentObject(resourceValue);
      if (!resource || typeof resource.type !== 'string' || typeof resource.name !== 'string') {
        throw new Error(`GitHub returned an invalid resource for cost center ${center.name}`);
      }
      return { type: resource.type, name: resource.name };
    });
  }
  const poolState = readAssessmentObject(center.ai_credit_pool_state);
  return {
    id: center.id,
    name: center.name,
    state: center.state,
    azureSubscription:
      typeof center.azure_subscription === 'string' ? center.azure_subscription : null,
    aiCreditPoolEnabled: center.ai_credit_pool_enabled,
    aiCreditPoolTargetAmount: readOptionalNumber(
      poolState?.target_amount,
      'cost center AI credit target'
    ),
    aiCreditPoolCurrentAmount: readOptionalNumber(
      poolState?.current_amount,
      'cost center AI credit current amount'
    ),
    resources,
  };
}

async function collectEffectiveBudget(
  requests: AssessmentBillingRequests,
  requestedUser: string
): Promise<AssessmentEffectiveBudget> {
  let page = 1;
  let user = requestedUser;
  let effectiveBudget: Omit<AssessmentEffectiveBudget, 'user' | 'applicableBudgetIds'> | null = null;
  const applicableBudgetIds = new Set<string>();

  while (true) {
    const response = await requests.getEffectiveBudget(requestedUser, page, REST_PAGE_SIZE);
    if (response.status !== 200) {
      throw new Error(describeRestFailure('effective user budget', response));
    }
    const result = readAssessmentObject(response.data);
    if (!result || !Array.isArray(result.budgets) || typeof result.has_next_page !== 'boolean') {
      throw new Error('GitHub returned an invalid effective user budget response');
    }
    if (typeof result.user === 'string') user = result.user;
    for (const budgetValue of result.budgets) {
      const budget = readAssessmentObject(budgetValue);
      if (!budget || typeof budget.id !== 'string') {
        throw new Error('GitHub returned an invalid applicable user budget');
      }
      applicableBudgetIds.add(budget.id);
    }
    const normalizedEffectiveBudget = normalizeEffectiveBudget(result.effective_budget);
    if (
      effectiveBudget
      && normalizedEffectiveBudget
      && effectiveBudget.budgetId !== normalizedEffectiveBudget.budgetId
    ) {
      throw new Error(`GitHub returned inconsistent effective budgets for ${requestedUser}`);
    }
    effectiveBudget ??= normalizedEffectiveBudget;
    if (!result.has_next_page) break;
    page += 1;
  }

  return {
    user,
    budgetId: effectiveBudget?.budgetId ?? null,
    amount: effectiveBudget?.amount ?? null,
    consumedAmount: effectiveBudget?.consumedAmount ?? null,
    applicableBudgetIds: [...applicableBudgetIds].sort(),
  };
}

function normalizeEffectiveBudget(
  value: unknown
): Omit<AssessmentEffectiveBudget, 'user' | 'applicableBudgetIds'> | null {
  if (value === undefined || value === null) return null;
  const budget = readAssessmentObject(value);
  if (
    !budget
    || typeof budget.id !== 'string'
    || typeof budget.budget_amount !== 'number'
    || typeof budget.consumed_amount !== 'number'
  ) {
    throw new Error('GitHub returned an invalid effective budget');
  }
  return {
    budgetId: budget.id,
    amount: budget.budget_amount,
    consumedAmount: budget.consumed_amount,
  };
}

async function collectBudgetUserStates(
  requests: AssessmentBillingRequests,
  budgetId: string
): Promise<AssessmentBudgetUserState[]> {
  let page = 1;
  const states = new Map<string, AssessmentBudgetUserState>();
  while (true) {
    const response = await requests.getBudgetUserStates(budgetId, page, REST_PAGE_SIZE);
    if (response.status !== 200) {
      throw new Error(describeRestFailure('multi-user budget states', response));
    }
    const result = readAssessmentObject(response.data);
    if (!result || !Array.isArray(result.user_states) || typeof result.has_next_page !== 'boolean') {
      throw new Error('GitHub returned an invalid multi-user budget states response');
    }
    for (const value of result.user_states) {
      const state = normalizeBudgetUserState(value, budgetId);
      if (states.has(state.user.toLowerCase())) {
        throw new Error(`GitHub returned duplicate budget state for ${state.user}`);
      }
      states.set(state.user.toLowerCase(), state);
    }
    if (!result.has_next_page) break;
    page += 1;
  }
  return [...states.values()];
}

function normalizeBudgetUserState(value: unknown, budgetId: string): AssessmentBudgetUserState {
  const state = readAssessmentObject(value);
  if (
    !state
    || typeof state.user !== 'string'
    || typeof state.consumed_amount !== 'number'
    || typeof state.target_amount !== 'number'
  ) {
    throw new Error('GitHub returned an invalid multi-user budget state');
  }
  return {
    budgetId,
    user: state.user,
    consumedAmount: state.consumed_amount,
    targetAmount: state.target_amount,
    overrideBudgetId: typeof state.override_budget_id === 'string'
      ? state.override_budget_id
      : null,
  };
}

function normalizeBillingUsage(value: unknown): AssessmentBillingUsage {
  const usage = readAssessmentObject(value);
  const timePeriod = usage ? readAssessmentObject(usage.timePeriod) : null;
  if (!usage || !timePeriod || !Number.isInteger(timePeriod.year) || !Array.isArray(usage.usageItems)) {
    throw new Error('GitHub returned an invalid enterprise billing usage summary');
  }
  return {
    year: timePeriod.year as number,
    month: readOptionalInteger(timePeriod.month, 'billing usage month'),
    day: readOptionalInteger(timePeriod.day, 'billing usage day'),
    items: usage.usageItems.map(normalizeBillingUsageItem),
  };
}

function normalizeBillingUsageItem(value: unknown): AssessmentBillingUsageItem {
  const item = readAssessmentObject(value);
  if (
    !item
    || typeof item.product !== 'string'
    || typeof item.sku !== 'string'
    || typeof item.unitType !== 'string'
  ) {
    throw new Error('GitHub returned an invalid enterprise billing usage item');
  }
  return {
    product: item.product,
    sku: item.sku,
    unitType: item.unitType,
    grossQuantity: readRequiredNumber(item.grossQuantity, 'gross usage quantity'),
    grossAmount: readRequiredNumber(item.grossAmount, 'gross usage amount'),
    discountQuantity: readRequiredNumber(item.discountQuantity, 'discount usage quantity'),
    discountAmount: readRequiredNumber(item.discountAmount, 'discount usage amount'),
    netQuantity: readRequiredNumber(item.netQuantity, 'net usage quantity'),
    netAmount: readRequiredNumber(item.netAmount, 'net usage amount'),
  };
}

function validateTimestamp(value: string, label: string): void {
  if (!Number.isFinite(new Date(value).getTime())) {
    throw new Error(`GitHub returned an invalid ${label} timestamp`);
  }
}

function readNullableTimestamp(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`GitHub returned an invalid ${label} timestamp`);
  }
  validateTimestamp(value, label);
  return value;
}

function earlierTimestamp(left: string, right: string): string {
  return new Date(left).getTime() <= new Date(right).getTime() ? left : right;
}

function isLaterTimestamp(candidate: string | null, current: string | null): boolean {
  if (!candidate) return false;
  if (!current) return true;
  return new Date(candidate).getTime() > new Date(current).getTime();
}

function earlierNullableTimestamp(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return earlierTimestamp(left, right);
}

function laterNullableTimestamp(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function mergeCopilotAssignmentSources(
  left: AssessmentCopilotAssignmentSource[],
  right: AssessmentCopilotAssignmentSource[]
): AssessmentCopilotAssignmentSource[] {
  const sources = new Map<string, AssessmentCopilotAssignmentSource>();
  for (const source of [...left, ...right]) {
    const key = [source.organization, source.team, source.teamType].join('\u0000');
    sources.set(key, source);
  }
  return [...sources.values()].sort((first, second) => (
    `${first.organization ?? ''}/${first.team ?? ''}`.localeCompare(
      `${second.organization ?? ''}/${second.team ?? ''}`
    )
  ));
}

function deduplicateCostCenterResources(
  resources: AssessmentCostCenterResource[]
): AssessmentCostCenterResource[] {
  const uniqueResources = new Map<string, AssessmentCostCenterResource>();
  for (const resource of resources) {
    uniqueResources.set(`${resource.type.toLowerCase()}\u0000${resource.name.toLowerCase()}`, resource);
  }
  return [...uniqueResources.values()].sort((left, right) => (
    `${left.type}/${left.name}`.localeCompare(`${right.type}/${right.name}`)
  ));
}

function uniqueSortedStrings(values: string[]): string[] {
  const uniqueValues = new Map<string, string>();
  for (const value of values) uniqueValues.set(value.toLowerCase(), value);
  return [...uniqueValues.values()].sort((left, right) => left.localeCompare(right));
}

function readRequiredNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`GitHub returned an invalid ${label}`);
  }
  return value;
}

function readOptionalNumber(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null;
  return readRequiredNumber(value, label);
}

function readOptionalInteger(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value)) {
    throw new Error(`GitHub returned an invalid ${label}`);
  }
  return value as number;
}

function formatRulesetBypassResource({
  ruleset,
  actor,
}: {
  ruleset: AssessmentRulesetDetail;
  actor: AssessmentRulesetBypassActor;
}): string {
  const actorId = actor.actorId === null ? '' : ` ${actor.actorId}`;
  return `${ruleset.name} · ${actor.actorType}${actorId} · ${actor.bypassMode}`;
}

function formatBudgetResource(budget: AssessmentBudget): string {
  const subject = budget.user || budget.entityName || budget.scope;
  return `${budget.productSku} · ${budget.scope} · ${subject}`;
}

function normalizeSecurityDefault(value: unknown): AssessmentSecurityDefault {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('GitHub returned an invalid enterprise security default record');
  }
  const record = value as Record<string, unknown>;
  const configuration = record.configuration;
  if (
    typeof record.default_for_new_repos !== 'string'
    || !configuration
    || typeof configuration !== 'object'
    || Array.isArray(configuration)
  ) {
    throw new Error('GitHub returned an incomplete enterprise security default record');
  }
  const settings = configuration as Record<string, unknown>;
  const requiredStrings = [
    'name',
    'advanced_security',
    'dependency_graph',
    'dependabot_alerts',
    'code_scanning_default_setup',
    'secret_scanning',
    'secret_scanning_push_protection',
    'enforcement',
  ] as const;
  if (
    typeof settings.id !== 'number'
    || requiredStrings.some(key => typeof settings[key] !== 'string')
  ) {
    throw new Error('GitHub returned an incomplete enterprise security configuration');
  }
  return {
    defaultForNewRepositories: record.default_for_new_repos,
    configurationId: settings.id,
    configurationName: settings.name as string,
    advancedSecurity: settings.advanced_security as string,
    dependencyGraph: settings.dependency_graph as string,
    dependabotAlerts: settings.dependabot_alerts as string,
    codeScanningDefaultSetup: settings.code_scanning_default_setup as string,
    secretScanning: settings.secret_scanning as string,
    secretScanningPushProtection: settings.secret_scanning_push_protection as string,
    enforcement: settings.enforcement as string,
  };
}

async function collectConnection(
  request: AssessmentGraphqlRequest,
  query: string,
  enterprise: string,
  readConnection: (response: unknown) => { nodes: unknown[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } },
  resourceVariable = 'slug'
): Promise<unknown[]> {
  const records: unknown[] = [];
  let cursor: string | null = null;
  while (true) {
    const connection = readConnection(await request(query, { [resourceVariable]: enterprise, cursor }));
    records.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) return records;
    if (!connection.pageInfo.endCursor) {
      throw new Error('GitHub returned an invalid paginated assessment response');
    }
    cursor = connection.pageInfo.endCursor;
  }
}

function readNestedConnection(
  value: unknown,
  path: string[],
  label: string
): { nodes: unknown[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') {
      throw new Error(`GitHub returned an invalid ${label} response`);
    }
    current = (current as Record<string, unknown>)[key];
  }
  return readConnection(current, label);
}

function readConnection(
  value: unknown,
  label: string
): { nodes: unknown[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } {
  if (!value || typeof value !== 'object') {
    throw new Error(`GitHub returned an invalid ${label} response`);
  }
  const connection = value as Record<string, unknown>;
  const pageInfo = connection.pageInfo;
  if (
    !Array.isArray(connection.nodes)
    || !pageInfo
    || typeof pageInfo !== 'object'
    || typeof (pageInfo as Record<string, unknown>).hasNextPage !== 'boolean'
  ) {
    throw new Error(`GitHub returned an invalid ${label} response`);
  }
  const endCursor = (pageInfo as Record<string, unknown>).endCursor;
  if (endCursor !== null && typeof endCursor !== 'string') {
    throw new Error(`GitHub returned an invalid ${label} response`);
  }
  return {
    nodes: connection.nodes,
    pageInfo: {
      hasNextPage: (pageInfo as Record<string, unknown>).hasNextPage as boolean,
      endCursor,
    },
  };
}

function readLogin(value: unknown, label: string): string {
  if (!value || typeof value !== 'object' || typeof (value as Record<string, unknown>).login !== 'string') {
    throw new Error(`GitHub returned an incomplete enterprise ${label} record`);
  }
  return (value as Record<string, unknown>).login as string;
}

function normalizeRepository(value: unknown, organizationLogin: string): AssessmentRepository {
  if (!value || typeof value !== 'object') {
    throw new Error('GitHub returned an invalid repository record');
  }
  const repository = value as Record<string, unknown>;
  if (
    typeof repository.databaseId !== 'number'
    || typeof repository.id !== 'string'
    || typeof repository.nameWithOwner !== 'string'
    || typeof repository.visibility !== 'string'
    || typeof repository.isArchived !== 'boolean'
    || typeof repository.isFork !== 'boolean'
    || typeof repository.updatedAt !== 'string'
  ) {
    throw new Error('GitHub returned an incomplete repository record');
  }
  return {
    githubId: repository.databaseId,
    nodeId: repository.id,
    organizationLogin,
    nameWithOwner: repository.nameWithOwner,
    visibility: repository.visibility,
    isArchived: repository.isArchived,
    isFork: repository.isFork,
    updatedAt: repository.updatedAt,
  };
}

function normalizeTeam(value: unknown, organizationLogin: string): AssessmentTeam {
  if (!value || typeof value !== 'object') {
    throw new Error('GitHub returned an invalid team record');
  }
  const team = value as Record<string, unknown>;
  if (
    typeof team.databaseId !== 'number'
    || typeof team.id !== 'string'
    || typeof team.slug !== 'string'
    || typeof team.name !== 'string'
    || typeof team.privacy !== 'string'
  ) {
    throw new Error('GitHub returned an incomplete team record');
  }
  return {
    githubId: team.databaseId,
    nodeId: team.id,
    organizationLogin,
    slug: team.slug,
    name: team.name,
    privacy: team.privacy,
  };
}

function readOrganizationConnection(value: unknown): {
  nodes: unknown[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
} {
  if (!value || typeof value !== 'object') {
    throw new Error('GitHub returned an invalid organization inventory response');
  }
  const enterprise = (value as Record<string, unknown>).enterprise;
  if (!enterprise || typeof enterprise !== 'object') {
    throw new Error('Enterprise not found or the credential cannot access it');
  }
  const organizations = (enterprise as Record<string, unknown>).organizations;
  if (!organizations || typeof organizations !== 'object') {
    throw new Error('GitHub returned an invalid organization inventory response');
  }
  const connection = organizations as Record<string, unknown>;
  const pageInfo = connection.pageInfo;
  if (
    !Array.isArray(connection.nodes)
    || !pageInfo
    || typeof pageInfo !== 'object'
    || typeof (pageInfo as Record<string, unknown>).hasNextPage !== 'boolean'
  ) {
    throw new Error('GitHub returned an invalid organization inventory response');
  }
  const endCursor = (pageInfo as Record<string, unknown>).endCursor;
  if (endCursor !== null && typeof endCursor !== 'string') {
    throw new Error('GitHub returned an invalid organization inventory response');
  }
  return {
    nodes: connection.nodes,
    pageInfo: {
      hasNextPage: (pageInfo as Record<string, unknown>).hasNextPage as boolean,
      endCursor,
    },
  };
}

function normalizeOrganization(value: unknown): AssessmentOrganization {
  if (!value || typeof value !== 'object') {
    throw new Error('GitHub returned an invalid organization record');
  }
  const organization = value as Record<string, unknown>;
  if (
    typeof organization.databaseId !== 'number'
    || typeof organization.id !== 'string'
    || typeof organization.login !== 'string'
  ) {
    throw new Error('GitHub returned an incomplete organization record');
  }

  return {
    githubId: organization.databaseId,
    nodeId: organization.id,
    login: organization.login,
    description: typeof organization.description === 'string' ? organization.description : null,
  };
}