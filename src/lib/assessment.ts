export interface AssessmentOrganization {
  githubId: number;
  nodeId: string;
  login: string;
  description: string | null;
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

export interface AssessmentActionsPolicy {
  enabledOrganizations: string;
  allowedActions: string;
  shaPinningRequired: boolean;
}

export interface AssessmentCopilotSeat {
  login: string;
  planType: string;
  createdAt: string;
  lastAuthenticatedAt: string | null;
  lastActivityAt: string | null;
  pendingCancellationDate: string | null;
  assignmentCount: number;
}

export interface AssessmentCopilotSeatInventory {
  totalSeats: number;
  rawAssignmentCount: number;
  seats: AssessmentCopilotSeat[];
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
  entityName: string | null;
  user: string | null;
  expiresAt: string | null;
}

export type AssessmentSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface AssessmentFinding {
  ruleKey: string;
  domain: 'identity' | 'repositories' | 'security' | 'actions' | 'copilot' | 'billing';
  severity: AssessmentSeverity;
  title: string;
  summary: string;
  recommendation: string;
  affectedResources: string[];
}

export interface AssessmentEvaluation {
  healthScore: number;
  assessedDomainCount: number;
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

export interface AssessmentRepositorySecurityRequests {
  getRepository: (owner: string, repo: string) => Promise<AssessmentRestResponse>;
  getCodeScanningDefaultSetup: (owner: string, repo: string) => Promise<AssessmentRestResponse>;
  checkDependabotAlerts: (owner: string, repo: string) => Promise<AssessmentRestResponse>;
  getConfiguration: (owner: string, repo: string) => Promise<AssessmentRestResponse>;
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
    seatsByLogin.set(key, {
      ...existing,
      createdAt: earlierTimestamp(existing.createdAt, assignment.createdAt),
      lastAuthenticatedAt: laterNullableTimestamp(
        existing.lastAuthenticatedAt,
        assignment.lastAuthenticatedAt
      ),
      lastActivityAt: laterNullableTimestamp(existing.lastActivityAt, assignment.lastActivityAt),
      pendingCancellationDate: earlierNullableTimestamp(
        existing.pendingCancellationDate,
        assignment.pendingCancellationDate
      ),
      assignmentCount: existing.assignmentCount + 1,
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

export function evaluateAssessmentBaseline(input: {
  organizations: AssessmentOrganization[];
  members: AssessmentMember[];
  ownerCount: number;
  repositories: AssessmentRepository[];
  teams: AssessmentTeam[];
  securityDefaults?: AssessmentSecurityDefault[] | null;
  repositorySecurity?: AssessmentRepositorySecurity[] | null;
  actionsPolicy?: AssessmentActionsPolicy | null;
  copilotSeats?: AssessmentCopilotSeatInventory | null;
  budgets?: AssessmentBudget[] | null;
  now?: Date;
}): AssessmentEvaluation {
  const findings: AssessmentFinding[] = [];
  const now = input.now ?? new Date();
  const staleThreshold = now.getTime() - STALE_REPOSITORY_DAYS * 24 * 60 * 60 * 1000;
  const activeRepositories = input.repositories.filter(repository => !repository.isArchived);
  const staleRepositories = activeRepositories.filter(repository => {
    const updatedAt = new Date(repository.updatedAt).getTime();
    return Number.isFinite(updatedAt) && updatedAt < staleThreshold;
  });
  const publicRepositories = input.repositories.filter(repository => repository.visibility === 'PUBLIC');

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
  }

  const healthScore = Math.max(
    0,
    100 - findings.reduce((total, finding) => total + SEVERITY_IMPACT[finding.severity], 0)
  );

  return {
    healthScore,
    assessedDomainCount: 2
      + (input.securityDefaults || input.repositorySecurity ? 1 : 0)
      + (input.actionsPolicy ? 1 : 0)
      + (input.copilotSeats ? 1 : 0)
      + (input.budgets ? 1 : 0),
    findings,
    metrics: {
      activeRepositories: activeRepositories.length,
      archivedRepositories: input.repositories.filter(repository => repository.isArchived).length,
      forkRepositories: input.repositories.filter(repository => repository.isFork).length,
      internalRepositories: input.repositories.filter(repository => repository.visibility === 'INTERNAL').length,
      privateRepositories: input.repositories.filter(repository => repository.visibility === 'PRIVATE').length,
      publicRepositories: publicRepositories.length,
      staleActiveRepositories: staleRepositories.length,
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
      ...(input.copilotSeats ? {
        activeCopilotSeats,
        copilotSeats: input.copilotSeats.totalSeats,
        duplicateCopilotAssignments,
        inactiveCopilotSeats,
        pendingCopilotSeatCancellations,
      } : {}),
      ...(input.budgets ? {
        alertingBudgets,
        budgets: input.budgets.length,
        budgetsWithoutUsagePrevention: input.budgets.length - enforcingBudgets,
        enforcingBudgets,
        userLevelBudgets,
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
  return {
    login: ((assignee as Record<string, unknown>).login as string),
    planType: record.plan_type,
    createdAt: record.created_at,
    lastAuthenticatedAt,
    lastActivityAt,
    pendingCancellationDate,
    assignmentCount: 1,
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
    entityName: typeof record.budget_entity_name === 'string' ? record.budget_entity_name : null,
    user: typeof record.user === 'string' ? record.user : null,
    expiresAt: typeof expiresAt === 'string' ? expiresAt : null,
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