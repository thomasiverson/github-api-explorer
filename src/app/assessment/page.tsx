'use client';

import { useCallback, useEffect, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { useApp } from '@/components/AppContext';
import {
  formatScimRoleLabel,
  type AssessmentActionsEvidence,
  type AssessmentOrganizationAccess,
  type AssessmentRepositoryAccess,
  type AssessmentRepositoryRules,
  type AssessmentRulesetDetail,
  type AssessmentScimInventory,
} from '@/lib/assessment';

const INVENTORY_METRICS = [
  { key: 'organizations', label: 'Organizations', description: 'Enterprise organizations' },
  { key: 'members', label: 'Members', description: 'Enterprise members' },
  { key: 'enterpriseOwners', label: 'Owners', description: 'Enterprise owners' },
  { key: 'repositories', label: 'Repositories', description: 'All repository visibilities' },
  { key: 'teams', label: 'Teams', description: 'Organization teams' },
  { key: 'copilotSeats', label: 'Copilot seats', description: 'Unique billed users' },
  { key: 'budgets', label: 'Budgets', description: 'Enterprise budget controls' },
];

const ASSESSMENT_DOMAINS = [
  { key: 'identity', name: 'Identity & access', detail: 'Owners, organization defaults, access grants, and SCIM provisioning' },
  { key: 'repositories', name: 'Repository governance', detail: 'Visibility, archival state, and repository activity' },
  { key: 'security', name: 'Security posture', detail: 'Secret scanning, code scanning, Dependabot, security configurations' },
  { key: 'actions', name: 'Actions & runners', detail: 'Workflow permissions, fork trust, runner groups, and runner health' },
  { key: 'copilot', name: 'Copilot', detail: 'Billed seats and recent activity' },
  { key: 'billing', name: 'Billing & licensing', detail: 'Budget coverage, enforcement, and alerting' },
] as const;

type AssessmentDomainKey = (typeof ASSESSMENT_DOMAINS)[number]['key'];

interface AssessmentCollectorResult {
  collector_key: string;
  status: 'completed' | 'partial' | 'failed';
  item_count: number;
  duration_ms: number;
  error: string | null;
}

interface AssessmentRepositorySecurity {
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

interface AssessmentSnapshot {
  id: string;
  environmentId: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  metrics: Record<string, number>;
  collectors: AssessmentCollectorResult[];
  organizationAccess: AssessmentOrganizationAccess[];
  repositoryAccess: AssessmentRepositoryAccess[];
  scim: AssessmentScimInventory | null;
  repositorySecurity: AssessmentRepositorySecurity[];
  repositoryRules: AssessmentRepositoryRules[];
  rulesets: AssessmentRulesetDetail[];
  actionsEvidence: AssessmentActionsEvidence | null;
  findings: AssessmentFinding[];
}

interface AssessmentFinding {
  ruleKey: string;
  domain: AssessmentDomainKey;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  summary: string;
  recommendation: string;
  affectedResources: string[];
}

export default function AssessmentPage() {
  const { activeEnv } = useApp();
  const [snapshot, setSnapshot] = useState<AssessmentSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const loadLatestAssessment = useCallback(async (environmentId: string) => {
    setIsLoading(true);
    setPageError(null);
    try {
      const response = await fetch(`/api/assessment/runs?environmentId=${encodeURIComponent(environmentId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load the latest assessment');
      setSnapshot(data);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to load the latest assessment');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeEnv) {
      setSnapshot(null);
      return;
    }
    loadLatestAssessment(activeEnv.id);
  }, [activeEnv, loadLatestAssessment]);

  async function runAssessment() {
    if (!activeEnv || isRunning) return;
    setIsRunning(true);
    setPageError(null);
    try {
      const response = await fetch('/api/assessment/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environmentId: activeEnv.id }),
      });
      const data = await response.json();
      if (data?.id) setSnapshot(data);
      if (!response.ok) throw new Error(data?.error || 'Assessment collection failed');
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Assessment collection failed');
    } finally {
      setIsRunning(false);
    }
  }

  const completedCollectors = snapshot?.collectors.filter(collector => collector.status === 'completed').length || 0;
  const partialCollectors = snapshot?.collectors.filter(collector => collector.status === 'partial') || [];
  const failedCollectors = snapshot?.collectors.filter(collector => collector.status === 'failed') || [];
  const incompleteCollectors = [...partialCollectors, ...failedCollectors];
  const findings = snapshot?.findings || [];
  const baselineScore = snapshot?.metrics.healthScore;
  const assessedDomainCount = snapshot?.metrics.assessedDomains || 0;
  const baselineEvaluated = baselineScore !== undefined;
  const findingCounts = {
    critical: findings.filter(finding => finding.severity === 'critical').length,
    high: findings.filter(finding => finding.severity === 'high').length,
    medium: findings.filter(finding => finding.severity === 'medium').length,
    low: findings.filter(finding => finding.severity === 'low').length,
  };
  const repositoryCollector = snapshot?.collectors.find(collector => collector.collector_key === 'repositories');
  const organizationAccessCollector = snapshot?.collectors.find(
    collector => collector.collector_key === 'organizationAccess'
  );
  const repositoryAccessCollector = snapshot?.collectors.find(
    collector => collector.collector_key === 'repositoryAccess'
  );
  const scimCollector = snapshot?.collectors.find(collector => collector.collector_key === 'scim');
  const securityCollector = snapshot?.collectors.find(collector => collector.collector_key === 'security');
  const repositorySecurityCollector = snapshot?.collectors.find(
    collector => collector.collector_key === 'repositorySecurity'
  );
  const repositoryRulesCollector = snapshot?.collectors.find(
    collector => collector.collector_key === 'repositoryRules'
  );
  const rulesetDetailsCollector = snapshot?.collectors.find(
    collector => collector.collector_key === 'rulesetDetails'
  );
  const actionsCollector = snapshot?.collectors.find(collector => collector.collector_key === 'actions');
  const actionsDepthCollector = snapshot?.collectors.find(
    collector => collector.collector_key === 'actionsDepth'
  );
  const copilotCollector = snapshot?.collectors.find(collector => collector.collector_key === 'copilot');
  const billingCollector = snapshot?.collectors.find(collector => collector.collector_key === 'billing');
  const repositorySecurity = snapshot?.repositorySecurity || [];
  const organizationAccess = snapshot?.organizationAccess || [];
  const repositoryAccess = snapshot?.repositoryAccess || [];
  const scim = snapshot?.scim;
  const repositoryRules = snapshot?.repositoryRules || [];
  const rulesets = snapshot?.rulesets || [];
  const eligibleRepositorySecurity = repositorySecurity.filter(
    repository => !repository.isArchived && !repository.isFork
  );
  const actionsEvidence = snapshot?.actionsEvidence;
  const runnersByGroup = new Map<number, number>();
  for (const runner of actionsEvidence?.runners ?? []) {
    if (runner.runnerGroupId === null) continue;
    runnersByGroup.set(runner.runnerGroupId, (runnersByGroup.get(runner.runnerGroupId) ?? 0) + 1);
  }
  const domainStatuses: Record<AssessmentDomainKey, string> = {
    identity: baselineEvaluated
      ? organizationAccessCollector?.status === 'completed'
        && repositoryAccessCollector?.status === 'completed'
        && scimCollector?.status === 'completed'
        ? 'Access depth'
        : organizationAccessCollector?.status === 'partial'
          || repositoryAccessCollector?.status === 'partial'
          ? 'Partial access depth'
          : 'Baseline'
      : 'Not assessed',
    repositories: baselineEvaluated
      ? repositoryRulesCollector?.status === 'completed'
        && rulesetDetailsCollector?.status === 'completed'
        ? 'Ruleset depth'
        : repositoryRulesCollector?.status === 'partial'
          || rulesetDetailsCollector?.status === 'partial'
          ? 'Partial ruleset depth'
          : repositoryCollector?.status === 'partial' ? 'Partial baseline' : 'Baseline'
      : 'Not assessed',
    security: baselineEvaluated
      ? repositorySecurityCollector?.status === 'completed'
        ? 'Repository depth'
        : repositorySecurityCollector?.status === 'partial'
          ? 'Partial repository depth'
          : securityCollector?.status === 'completed' ? 'Baseline' : 'Unavailable'
      : 'Not assessed',
    actions: baselineEvaluated
      ? actionsDepthCollector?.status === 'completed'
        ? 'Runner depth'
        : actionsDepthCollector?.status === 'partial'
          ? 'Partial runner depth'
          : actionsCollector?.status === 'completed' ? 'Baseline' : 'Unavailable'
      : 'Not assessed',
    copilot: baselineEvaluated
      ? copilotCollector?.status === 'completed' ? 'Baseline' : 'Unavailable'
      : 'Not assessed',
    billing: baselineEvaluated
      ? billingCollector?.status === 'completed' ? 'Baseline' : 'Unavailable'
      : 'Not assessed',
  };
  const assessmentState = isRunning
    ? 'Running'
    : snapshot?.status === 'completed'
      ? baselineEvaluated ? 'Baseline assessed' : 'Inventory baseline'
      : snapshot?.status === 'failed'
        ? 'Collection failed'
        : 'Not assessed';

  return (
    <div className="h-full flex flex-col bg-canvas">
      <TopBar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
          <header className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                  <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-warning animate-pulse' : snapshot?.status === 'completed' ? 'bg-success' : snapshot?.status === 'failed' ? 'bg-danger' : 'bg-text-muted'}`} aria-hidden="true" />
                  {assessmentState}
                </span>
                <span className="text-text-muted" aria-hidden="true">/</span>
                <span className="text-xs font-mono text-text-muted">
                  {activeEnv?.enterprise_slug || activeEnv?.base_url || 'No environment selected'}
                </span>
              </div>
              <h1 className="text-2xl font-semibold text-text-primary">Enterprise assessment</h1>
              <p className="text-sm text-text-secondary mt-1 max-w-2xl">
                A measured view of governance, security, access, automation, and platform adoption.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={runAssessment}
                disabled={!activeEnv || isRunning}
                className="px-4 py-2 bg-accent-emphasis text-white text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isRunning && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {isRunning ? 'Collecting evidence...' : snapshot ? 'Run again' : 'Run assessment'}
              </button>
            </div>
          </header>

          {pageError && (
            <div role="alert" className="border border-danger/50 bg-danger/10 rounded-md px-4 py-3 flex items-start gap-2">
              <span className="text-danger font-semibold" aria-hidden="true">!</span>
              <div>
                <p className="text-sm font-medium text-danger">Assessment could not complete</p>
                <p className="text-xs text-text-secondary mt-0.5">{pageError}</p>
              </div>
            </div>
          )}

          {incompleteCollectors.length > 0 && (
            <div role="status" className="border border-warning/50 bg-warning/10 rounded-md px-4 py-3">
              <p className="text-sm font-medium text-text-primary">Incomplete assessment coverage</p>
              <p className="text-xs text-text-secondary mt-1">
                {incompleteCollectors.length} {incompleteCollectors.length === 1 ? 'collector has' : 'collectors have'} incomplete results.
                Findings exclude resources that the current credential could not access.
              </p>
              <details className="mt-2">
                <summary className="text-xs text-accent cursor-pointer">Show collection details</summary>
                <div className="mt-2 space-y-3">
                  {incompleteCollectors.map(collector => {
                    const failures = splitCollectorFailures(collector.error);
                    const failureSubject = (
                      collector.collector_key === 'repositorySecurity'
                      || collector.collector_key === 'repositoryRules'
                      || collector.collector_key === 'rulesetDetails'
                      || collector.collector_key === 'repositoryAccess'
                    )
                      ? `${failures.length} incomplete repository ${failures.length === 1 ? 'check' : 'checks'}`
                      : collector.collector_key === 'actionsDepth'
                        ? `${failures.length} incomplete Actions ${failures.length === 1 ? 'check' : 'checks'}`
                        : `${failures.length} inaccessible ${failures.length === 1 ? 'organization' : 'organizations'}`;
                    return (
                      <div key={collector.collector_key}>
                        <p className="text-xs font-medium text-text-primary capitalize">
                          {collector.collector_key}: {collector.status === 'failed'
                            ? 'collector unavailable'
                            : failureSubject}
                        </p>
                        <ul className="mt-1 space-y-1">
                          {failures.map((failure, index) => (
                            <li key={`${collector.collector_key}-${index}`} className="text-[11px] text-text-muted break-words">{failure}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </details>
            </div>
          )}

          <section aria-labelledby="posture-heading" className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
            <div className="border border-border bg-panel rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div>
                  <h2 id="posture-heading" className="text-sm font-semibold text-text-primary">Enterprise posture</h2>
                  <p className="text-xs text-text-muted mt-0.5">
                    {isLoading
                      ? 'Loading the latest snapshot...'
                      : baselineEvaluated
                        ? 'Baseline score reflects only domains with completed evidence collection.'
                        : snapshot?.status === 'completed'
                          ? 'Inventory collected. Run again to evaluate the baseline rules.'
                          : 'No completed assessment snapshot exists for this environment.'}
                  </p>
                </div>
                <span className="text-xs text-text-muted">
                  Domain coverage: {baselineEvaluated ? `${assessedDomainCount} of ${ASSESSMENT_DOMAINS.length}` : '--'}
                </span>
              </div>
              <div className="grid sm:grid-cols-[180px_1fr] min-h-48">
                <div className="border-b sm:border-b-0 sm:border-r border-border flex flex-col items-center justify-center p-6">
                  <div className="relative w-28 h-28 rounded-full border-8 border-surface flex items-center justify-center">
                    <div className="text-center">
                      <div className={`text-3xl font-semibold ${baselineEvaluated ? 'text-text-primary' : 'text-text-muted'}`}>
                        {baselineEvaluated ? baselineScore : '--'}
                      </div>
                      <div className="text-[10px] uppercase text-text-muted">Baseline</div>
                    </div>
                  </div>
                </div>
                <div className="p-4 grid grid-cols-2 gap-px bg-border">
                  {([
                    ['Critical', findingCounts.critical],
                    ['High', findingCounts.high],
                    ['Medium', findingCounts.medium],
                    ['Low', findingCounts.low],
                  ] as const).map(([label, count]) => (
                    <div key={label} className="bg-panel p-4 flex flex-col justify-between min-h-20">
                      <span className="text-xs text-text-secondary">{label} findings</span>
                      <span className={`text-xl font-semibold ${baselineEvaluated ? 'text-text-primary' : 'text-text-muted'}`}>
                        {baselineEvaluated ? count : '--'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <aside className="border border-border bg-panel rounded-lg p-4">
              <h2 className="text-sm font-semibold text-text-primary">Assessment status</h2>
              <div className="mt-4 space-y-4">
                <StatusRow label="Last completed" value={formatAssessmentDate(snapshot?.status === 'completed' ? snapshot.completedAt : null)} />
                <StatusRow
                  label="Data confidence"
                  value={baselineEvaluated ? incompleteCollectors.length ? 'Limited, partial collection' : 'Limited baseline' : 'Not available'}
                />
                <StatusRow
                  label="Collectors"
                  value={snapshot
                    ? `${completedCollectors} completed${partialCollectors.length ? `, ${partialCollectors.length} partial` : ''}${failedCollectors.length ? `, ${failedCollectors.length} failed` : ''}`
                    : 'Not run'}
                />
                <StatusRow label="Rule profile" value="Enterprise baseline" />
              </div>
              <div className="mt-5 pt-4 border-t border-border">
                <p className="text-xs text-text-secondary">
                  Scores start at 100 and deduct 30, 20, 10, or 5 points for each critical, high, medium, or low baseline finding.
                </p>
              </div>
            </aside>
          </section>

          <section aria-labelledby="inventory-heading">
            <div className="flex items-end justify-between mb-3">
              <div>
                <h2 id="inventory-heading" className="text-sm font-semibold text-text-primary">Inventory</h2>
                <p className="text-xs text-text-muted mt-0.5">Core enterprise resources discovered during collection.</p>
              </div>
              <span className="text-xs text-text-muted">{snapshot?.status === 'completed' ? 'Latest snapshot' : 'Awaiting first run'}</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
              {INVENTORY_METRICS.map(metric => {
                const value = snapshot?.metrics[metric.key];
                return (
                <div key={metric.key} className="border border-border bg-panel rounded-lg p-4 min-h-28">
                  <p className="text-xs text-text-secondary">{metric.label}</p>
                  <p className={`text-2xl font-semibold mt-2 ${value !== undefined ? 'text-text-primary' : 'text-text-muted'}`}>
                    {value !== undefined ? value.toLocaleString() : '--'}
                  </p>
                  <p className="text-[11px] text-text-muted mt-2">{metric.description}</p>
                </div>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="identity-governance-heading" className="border border-border bg-panel rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 id="identity-governance-heading" className="text-sm font-semibold text-text-primary">
                  Identity & access governance
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Organization defaults, direct repository grants, team access, and managed-user provisioning.
                </p>
              </div>
              <span className="text-xs text-text-muted">
                {organizationAccess.length > 0
                  ? `${organizationAccess.length} organizations measured`
                  : 'Awaiting assessment'}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-border">
              <IdentityAccessSignal
                label="Organization settings"
                value={snapshot?.metrics.organizationsWithAccessSettings}
                suffix={`of ${snapshot?.metrics.organizations ?? '--'}`}
              />
              <IdentityAccessSignal
                label="Public repo creation"
                value={snapshot?.metrics.organizationsWithPublicRepositoryCreation}
                suffix="organizations"
                caution={(snapshot?.metrics.organizationsWithPublicRepositoryCreation ?? 0) > 0}
              />
              <IdentityAccessSignal
                label="Outside access"
                value={snapshot?.metrics.outsideCollaboratorCount}
                suffix="collaborators"
                caution={(snapshot?.metrics.outsideCollaboratorCount ?? 0) > 0}
              />
              <IdentityAccessSignal
                label="Direct access"
                value={snapshot?.metrics.directRepositoryGrantCount}
                suffix="repository grants"
                caution={(snapshot?.metrics.directRepositoryGrantCount ?? 0) > 0}
              />
              <IdentityAccessSignal
                label="Managed identities"
                value={snapshot?.metrics.activeScimIdentities}
                suffix={`active / ${snapshot?.metrics.humanEnterpriseMembers ?? '--'} human members`}
              />
            </div>
            {organizationAccess.length > 0 && (
              <details className="border-t border-border">
                <summary className="px-4 py-3 text-xs font-medium text-accent cursor-pointer">
                  Review organization access policy ({organizationAccess.length})
                </summary>
                <div className="border-t border-border">
                  <p className="px-4 py-3 text-[11px] text-text-muted bg-surface">
                    GitHub&apos;s organization 2FA requirement does not measure MFA enforced by an upstream
                    identity provider. It is shown as GitHub evidence only and does not create a finding.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-left">
                      <thead className="bg-surface">
                        <tr className="text-[10px] uppercase tracking-wide text-text-muted">
                          <th className="px-4 py-2 font-medium">Organization</th>
                          <th className="px-3 py-2 font-medium">Base permission</th>
                          <th className="px-3 py-2 font-medium">Member repo creation</th>
                          <th className="px-3 py-2 font-medium">Private forks</th>
                          <th className="px-3 py-2 font-medium">GitHub 2FA</th>
                          <th className="px-3 py-2 font-medium">Administrators</th>
                          <th className="px-3 py-2 font-medium">Outside collaborators</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {organizationAccess.map(organization => (
                          <tr key={organization.organizationLogin} className="text-xs align-top">
                            <td className="px-4 py-2.5 font-mono text-text-primary">
                              {organization.organizationLogin}
                            </td>
                            <td className="px-3 py-2.5 text-text-secondary">
                              {organization.defaultRepositoryPermission ?? '? Unavailable'}
                            </td>
                            <td className="px-3 py-2.5 text-text-secondary">
                              <RepositoryCreationPolicy organization={organization} />
                            </td>
                            <td className="px-3 py-2.5">
                              <EvidenceBoolean
                                value={organization.membersCanForkPrivateRepositories}
                                trueLabel="Allowed"
                                falseLabel="✔ Blocked"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <EvidenceBoolean
                                value={organization.twoFactorRequirementEnabled}
                                trueLabel="Required"
                                falseLabel="Not required here"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-text-secondary">
                              <IdentityList values={organization.adminLogins} emptyLabel="— None returned" />
                            </td>
                            <td className="px-3 py-2.5 text-text-secondary">
                              <IdentityList
                                values={organization.outsideCollaboratorLogins}
                                emptyLabel="✔ None"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            )}
            {repositoryAccess.length > 0 && (
              <details className="border-t border-border">
                <summary className="px-4 py-3 text-xs font-medium text-accent cursor-pointer">
                  Review repository access paths ({repositoryAccess.length})
                </summary>
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full min-w-[820px] text-left">
                    <thead className="bg-surface">
                      <tr className="text-[10px] uppercase tracking-wide text-text-muted">
                        <th className="px-4 py-2 font-medium">Repository</th>
                        <th className="px-3 py-2 font-medium">Direct grants</th>
                        <th className="px-3 py-2 font-medium">Team grants</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {repositoryAccess.map(repository => (
                        <tr key={repository.nameWithOwner} className="text-xs align-top">
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-text-primary">{repository.nameWithOwner}</span>
                            {(repository.isArchived || repository.isFork) && (
                              <span className="ml-2 text-[10px] text-text-muted">
                                ({repository.isArchived ? 'Archived' : 'Fork'})
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-text-secondary">
                            <RepositoryDirectGrants grants={repository.directCollaborators} />
                          </td>
                          <td className="px-3 py-2.5 text-text-secondary">
                            <RepositoryTeamGrants grants={repository.teamGrants} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            {scim && (
              <details className="border-t border-border">
                <summary className="px-4 py-3 text-xs font-medium text-accent cursor-pointer">
                  Review managed-user provisioning ({scim.totalResults})
                </summary>
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full min-w-[700px] text-left">
                    <thead className="bg-surface">
                      <tr className="text-[10px] uppercase tracking-wide text-text-muted">
                        <th className="px-4 py-2 font-medium">SCIM identity</th>
                        <th className="px-3 py-2 font-medium">Display name</th>
                        <th className="px-3 py-2 font-medium">Provisioning state</th>
                        <th className="px-3 py-2 font-medium">Roles</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {scim.identities.map(identity => (
                        <tr key={identity.scimId} className="text-xs">
                          <td className="px-4 py-2.5 font-mono text-text-primary">{identity.userName}</td>
                          <td className="px-3 py-2.5 text-text-secondary">{identity.displayName ?? '—'}</td>
                          <td className="px-3 py-2.5">
                            {identity.active
                              ? <span className="font-medium text-success">✔ Active</span>
                              : <span className="font-medium text-text-secondary">Inactive</span>}
                          </td>
                          <td className="px-3 py-2.5 text-text-secondary">
                            <ScimRoleList roles={identity.roles} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            {scimCollector?.status === 'failed' && (
              <p className="border-t border-border px-4 py-3 text-xs text-text-muted">
                Managed-user provisioning evidence was unavailable to this credential. No provisioning
                finding was created.
              </p>
            )}
          </section>

          <section aria-labelledby="branch-governance-heading" className="border border-border bg-panel rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 id="branch-governance-heading" className="text-sm font-semibold text-text-primary">
                  Default branch safeguards
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Effective active rulesets and classic protection on existing default branches.
                </p>
              </div>
              <span className="text-xs text-text-muted">
                {baselineEvaluated
                  ? `${snapshot?.metrics.protectedDefaultBranches ?? 0} of ${snapshot?.metrics.defaultBranchRepositories ?? 0} protected`
                  : 'Awaiting assessment'}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-7 divide-y sm:divide-y-0 sm:divide-x divide-border">
              <BranchCoverageMetric
                label="Protected"
                value={snapshot?.metrics.protectedDefaultBranches}
                total={snapshot?.metrics.defaultBranchRepositories}
              />
              <BranchCoverageMetric
                label="Pull requests"
                value={snapshot?.metrics.defaultBranchesRequiringPullRequests}
                total={snapshot?.metrics.defaultBranchRepositories}
              />
              <BranchCoverageMetric
                label="Status checks"
                value={snapshot?.metrics.defaultBranchesRequiringStatusChecks}
                total={snapshot?.metrics.defaultBranchRepositories}
              />
              <BranchCoverageMetric
                label="Ruleset coverage"
                value={snapshot?.metrics.rulesetProtectedDefaultBranches}
                total={snapshot?.metrics.defaultBranchRepositories}
              />
              <BranchCoverageMetric
                label="Classic protection"
                value={snapshot?.metrics.classicProtectedDefaultBranches}
                total={snapshot?.metrics.defaultBranchRepositories}
              />
              <BranchCoverageMetric
                label="Unknown"
                value={snapshot?.metrics.defaultBranchProtectionUnknownRepositories}
                suffix="repositories"
              />
              <BranchCoverageMetric
                label="Always bypass"
                value={snapshot?.metrics.unconditionalBypassActorCount}
                suffix="actors"
              />
            </div>
            {rulesets.length > 0 && (
              <details className="border-t border-border">
                <summary className="px-4 py-3 text-xs font-medium text-accent cursor-pointer">
                  Review active rulesets and bypass paths ({rulesets.length})
                </summary>
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full min-w-[1180px] text-left">
                    <thead className="bg-surface">
                      <tr className="text-[10px] uppercase tracking-wide text-text-muted">
                        <th className="px-4 py-2 font-medium">Ruleset</th>
                        <th className="px-3 py-2 font-medium">Source</th>
                        <th className="px-3 py-2 font-medium">Enforcement</th>
                        <th className="px-3 py-2 font-medium">Conditions</th>
                        <th className="px-3 py-2 font-medium">Rules</th>
                        <th className="px-3 py-2 font-medium">Applies to</th>
                        <th className="px-3 py-2 font-medium">Bypass paths</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rulesets.map(ruleset => (
                        <tr key={ruleset.githubId} className="text-xs align-top">
                          <td className="px-4 py-2.5">
                            <span className="font-medium text-text-primary">{ruleset.name}</span>
                            <span className="block font-mono text-[10px] text-text-muted">
                              ID {ruleset.githubId}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-text-secondary">
                            {ruleset.sourceType}
                            <span className="block font-mono text-[10px] text-text-muted">
                              {ruleset.source}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            {ruleset.enforcement === 'active'
                              ? <span className="text-success">✔ Active</span>
                              : <span className="text-warning">! {ruleset.enforcement}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-text-secondary">
                            <RulesetConditions ruleset={ruleset} />
                          </td>
                          <td className="px-3 py-2.5 text-text-secondary">
                            {ruleset.ruleTypes.join(', ') || '— None'}
                          </td>
                          <td className="px-3 py-2.5 text-text-secondary">
                            {ruleset.appliedRepositories.length}{' '}
                            {ruleset.appliedRepositories.length === 1 ? 'repository' : 'repositories'}
                          </td>
                          <td className="px-3 py-2.5">
                            <RulesetBypassPaths ruleset={ruleset} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            {repositoryRules.length > 0 ? (
              <details className="border-t border-border">
                <summary className="px-4 py-3 text-xs font-medium text-accent cursor-pointer">
                  Review default branch evidence ({snapshot?.metrics.defaultBranchRepositories ?? 0} existing)
                </summary>
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full min-w-[1080px] text-left">
                    <thead className="bg-surface">
                      <tr className="text-[10px] uppercase tracking-wide text-text-muted">
                        <th className="px-4 py-2 font-medium">Repository</th>
                        <th className="px-3 py-2 font-medium">Default branch</th>
                        <th className="px-3 py-2 font-medium">Protection source</th>
                        <th className="px-3 py-2 font-medium">Pull requests</th>
                        <th className="px-3 py-2 font-medium">Status checks</th>
                        <th className="px-3 py-2 font-medium">Force pushes</th>
                        <th className="px-3 py-2 font-medium">Deletion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {repositoryRules.map(repository => (
                        <tr key={repository.nameWithOwner} className="text-xs">
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-text-primary">{repository.nameWithOwner}</span>
                            {(repository.isArchived || repository.isFork) && (
                              <span className="ml-2 text-[10px] text-text-muted">
                                ({repository.isArchived ? 'Archived' : 'Fork'})
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-text-secondary">
                            {repository.branchExists === false
                              ? '— No branch'
                              : repository.defaultBranch ?? '? Unknown'}
                          </td>
                          <td className="px-3 py-2.5">
                            <ProtectionSource repository={repository} />
                          </td>
                          <td className="px-3 py-2.5">
                            <PullRequestProtection repository={repository} />
                          </td>
                          <td className="px-3 py-2.5">
                            <BranchControlState
                              value={repository.requiresStatusChecks}
                              notApplicable={repository.branchExists === false || repository.isArchived || repository.isFork}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <BranchControlState
                              value={repository.blocksForcePushes}
                              enabledLabel="Blocked"
                              disabledLabel="Allowed"
                              notApplicable={repository.branchExists === false || repository.isArchived || repository.isFork}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <BranchControlState
                              value={repository.blocksDeletions}
                              enabledLabel="Blocked"
                              disabledLabel="Allowed"
                              notApplicable={repository.branchExists === false || repository.isArchived || repository.isFork}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : (
              <p className="border-t border-border px-4 py-4 text-xs text-text-muted">
                Run the assessment to collect default branch governance evidence.
              </p>
            )}
          </section>

          <section aria-labelledby="repository-security-heading" className="border border-border bg-panel rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 id="repository-security-heading" className="text-sm font-semibold text-text-primary">
                  Repository security coverage
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Actual feature states for active, non-fork repositories. Unknown values are excluded from findings.
                </p>
              </div>
              <span className="text-xs text-text-muted">
                {baselineEvaluated
                  ? `${snapshot?.metrics.repositorySecurityEvidence || 0} of ${snapshot?.metrics.eligibleSecurityRepositories || 0} repositories measured`
                  : 'Awaiting assessment'}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-border">
              <SecurityCoverageMetric
                label="Code security"
                enabled={snapshot?.metrics.codeSecurityEnabledRepositories}
                total={snapshot?.metrics.eligibleSecurityRepositories}
              />
              <SecurityCoverageMetric
                label="Code scanning setup"
                enabled={snapshot?.metrics.codeScanningDefaultSetupRepositories}
                total={snapshot?.metrics.eligibleSecurityRepositories}
                stateLabel="configured"
              />
              <SecurityCoverageMetric
                label="Secret scanning"
                enabled={snapshot?.metrics.secretScanningEnabledRepositories}
                total={snapshot?.metrics.eligibleSecurityRepositories}
              />
              <SecurityCoverageMetric
                label="Push protection"
                enabled={snapshot?.metrics.pushProtectionEnabledRepositories}
                total={snapshot?.metrics.eligibleSecurityRepositories}
              />
              <SecurityCoverageMetric
                label="Dependabot alerts"
                enabled={snapshot?.metrics.dependabotAlertsEnabledRepositories}
                total={snapshot?.metrics.eligibleSecurityRepositories}
              />
              <SecurityCoverageMetric
                label="Configuration applied"
                enabled={snapshot?.metrics.securityConfigurationAppliedRepositories}
                total={snapshot?.metrics.eligibleSecurityRepositories}
                stateLabel="applied"
              />
            </div>
            {repositorySecurity.length > 0 ? (
              <details className="border-t border-border">
                <summary className="px-4 py-3 text-xs font-medium text-accent cursor-pointer">
                  Review the repository evidence matrix ({eligibleRepositorySecurity.length} assessed)
                </summary>
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full min-w-[1060px] text-left">
                    <thead className="bg-surface">
                      <tr className="text-[10px] uppercase tracking-wide text-text-muted">
                        <th className="px-4 py-2 font-medium">Repository</th>
                        <th className="px-3 py-2 font-medium">Code security</th>
                        <th className="px-3 py-2 font-medium">Code scanning</th>
                        <th className="px-3 py-2 font-medium">Secret scanning</th>
                        <th className="px-3 py-2 font-medium">Push protection</th>
                        <th className="px-3 py-2 font-medium">Dependabot alerts</th>
                        <th className="px-3 py-2 font-medium">Configuration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {repositorySecurity.map(repository => (
                        <tr key={repository.nameWithOwner} className="text-xs">
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-text-primary">{repository.nameWithOwner}</span>
                            {(repository.isArchived || repository.isFork) && (
                              <span className="ml-2 text-[10px] text-text-muted">
                                {repository.isArchived ? 'Archived' : 'Fork'}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5"><SecurityState value={repository.codeSecurity} /></td>
                          <td className="px-3 py-2.5"><SecurityState value={repository.codeScanningDefaultSetup} /></td>
                          <td className="px-3 py-2.5"><SecurityState value={repository.secretScanning} /></td>
                          <td className="px-3 py-2.5"><SecurityState value={repository.secretScanningPushProtection} /></td>
                          <td className="px-3 py-2.5"><SecurityState value={repository.dependabotAlerts} /></td>
                          <td className="px-3 py-2.5">
                            <ConfigurationState repository={repository} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : (
              <p className="border-t border-border px-4 py-4 text-xs text-text-muted">
                Run the assessment to collect repository-level security evidence.
              </p>
            )}
          </section>

          <section aria-labelledby="actions-trust-heading" className="border border-border bg-panel rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 id="actions-trust-heading" className="text-sm font-semibold text-text-primary">
                  Actions trust boundaries
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Enterprise workflow privileges and the self-hosted compute they can reach.
                </p>
              </div>
              <span className="text-xs text-text-muted">
                {actionsEvidence
                  ? `${actionsEvidence.runners?.length ?? '--'} self-hosted runners`
                  : 'Awaiting assessment'}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-border">
              <ActionsPolicySignal
                label="Default workflow token"
                value={actionsEvidence?.workflowPermissions
                  ? actionsEvidence.workflowPermissions.defaultWorkflowPermissions === 'read'
                    ? '✔ Read-only'
                    : 'Write access'
                  : null}
                safe={actionsEvidence?.workflowPermissions?.defaultWorkflowPermissions === 'read'}
              />
              <ActionsPolicySignal
                label="Workflow PR approvals"
                value={actionsEvidence?.workflowPermissions
                  ? actionsEvidence.workflowPermissions.canApprovePullRequestReviews
                    ? 'Allowed'
                    : '✔ Blocked'
                  : null}
                safe={actionsEvidence?.workflowPermissions
                  ? !actionsEvidence.workflowPermissions.canApprovePullRequestReviews
                  : undefined}
              />
              <ActionsPolicySignal
                label="Private fork workflows"
                value={formatForkWorkflowPolicy(actionsEvidence)}
                safe={actionsEvidence?.forkPullRequestPolicy
                  ? !actionsEvidence.forkPullRequestPolicy.runWorkflowsFromForkPullRequests
                    || actionsEvidence.forkPullRequestPolicy.requireApprovalForForkPullRequestWorkflows
                  : undefined}
              />
              <ActionsPolicySignal
                label="Organization runner access"
                value={actionsEvidence?.selfHostedRunnerPolicy
                  ? actionsEvidence.selfHostedRunnerPolicy.disabledForAllOrganizations
                    ? '✔ Disabled'
                    : 'Allowed'
                  : null}
                safe={actionsEvidence?.selfHostedRunnerPolicy?.disabledForAllOrganizations}
              />
              <ActionsPolicySignal
                label="Persistent runner health"
                value={snapshot?.metrics.offlineSelfHostedRunnerCount === undefined
                  ? null
                  : snapshot.metrics.offlineSelfHostedRunnerCount === 0
                    ? '✔ No offline runners'
                    : `${snapshot.metrics.offlineSelfHostedRunnerCount} offline`}
                safe={snapshot?.metrics.offlineSelfHostedRunnerCount === undefined
                  ? undefined
                  : snapshot.metrics.offlineSelfHostedRunnerCount === 0}
              />
            </div>
            {actionsEvidence ? (
              <details className="border-t border-border">
                <summary className="px-4 py-3 text-xs font-medium text-accent cursor-pointer">
                  Review runner groups and inventory
                </summary>
                <div className="border-t border-border">
                  {actionsEvidence.runnerGroups === null ? (
                    <p className="px-4 py-4 text-xs text-text-muted">
                      Runner group evidence was not available to this credential.
                    </p>
                  ) : actionsEvidence.runnerGroups.length === 0 ? (
                    <p className="px-4 py-4 text-xs text-text-muted">
                      No enterprise runner groups were returned.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-left">
                        <thead className="bg-surface">
                          <tr className="text-[10px] uppercase tracking-wide text-text-muted">
                            <th className="px-4 py-2 font-medium">Runner group</th>
                            <th className="px-3 py-2 font-medium">Organization access</th>
                            <th className="px-3 py-2 font-medium">Public repositories</th>
                            <th className="px-3 py-2 font-medium">Workflow access</th>
                            <th className="px-3 py-2 font-medium">Runners</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {actionsEvidence.runnerGroups.map(group => (
                            <tr key={group.githubId} className="text-xs">
                              <td className="px-4 py-2.5 text-text-primary">
                                {group.name}
                                {group.isDefault && (
                                  <span className="ml-2 text-[10px] text-text-muted">(Default)</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-text-secondary">{formatRunnerGroupVisibility(group.visibility)}</td>
                              <td className="px-3 py-2.5">
                                {group.allowsPublicRepositories
                                  ? <span className="font-medium text-warning">Allowed</span>
                                  : <span className="font-medium text-success">✔ Blocked</span>}
                              </td>
                              <td className="px-3 py-2.5 text-text-secondary">
                                {group.restrictedToWorkflows === null
                                  ? '? Not reported'
                                  : group.restrictedToWorkflows
                                    ? group.selectedWorkflows === null
                                      ? 'Selected workflows'
                                      : `${group.selectedWorkflows.length} selected`
                                    : 'All workflows'}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-text-primary">
                                {actionsEvidence.runners === null
                                  ? '?'
                                  : runnersByGroup.get(group.githubId) ?? 0}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {actionsEvidence.runners === null ? (
                    <p className="border-t border-border px-4 py-4 text-xs text-text-muted">
                      Self-hosted runner inventory was not available to this credential.
                    </p>
                  ) : actionsEvidence.runners.length > 0 ? (
                    <div className="overflow-x-auto border-t border-border">
                      <table className="w-full min-w-[760px] text-left">
                        <caption className="text-left px-4 py-3 text-xs font-medium text-text-primary bg-surface">
                          Self-hosted runner inventory
                        </caption>
                        <thead className="bg-surface">
                          <tr className="text-[10px] uppercase tracking-wide text-text-muted">
                            <th className="px-4 py-2 font-medium">Runner</th>
                            <th className="px-3 py-2 font-medium">Operating system</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                            <th className="px-3 py-2 font-medium">Workload</th>
                            <th className="px-3 py-2 font-medium">Labels</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {actionsEvidence.runners.map(runner => (
                            <tr key={runner.githubId} className="text-xs">
                              <td className="px-4 py-2.5 font-mono text-text-primary">{runner.name}</td>
                              <td className="px-3 py-2.5 text-text-secondary">{runner.os}</td>
                              <td className="px-3 py-2.5">
                                {runner.status === 'online'
                                  ? <span className="font-medium text-success">✔ Online</span>
                                  : <span className="font-medium text-warning">— {runner.status}</span>}
                              </td>
                              <td className="px-3 py-2.5 text-text-secondary">
                                {runner.busy ? 'Busy' : 'Idle'}{runner.ephemeral ? ' · Ephemeral' : ''}
                              </td>
                              <td className="px-3 py-2.5 text-text-muted">{runner.labels.join(', ') || 'None'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="border-t border-border px-4 py-4 text-xs text-text-muted">
                      No self-hosted runners are registered at the enterprise level.
                    </p>
                  )}
                </div>
              </details>
            ) : (
              <p className="border-t border-border px-4 py-4 text-xs text-text-muted">
                Run the assessment to collect workflow and runner evidence.
              </p>
            )}
          </section>

          <section aria-labelledby="domains-heading" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="border border-border bg-panel rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 id="domains-heading" className="text-sm font-semibold text-text-primary">Assessment domains</h2>
                <p className="text-xs text-text-muted mt-0.5">Health is scored by domain with collection coverage shown separately.</p>
              </div>
              <div className="divide-y divide-border">
                {ASSESSMENT_DOMAINS.map(domain => (
                  <div key={domain.name} className="px-4 py-3 grid gap-2 sm:grid-cols-[190px_1fr_100px] sm:items-center">
                    <span className="text-sm font-medium text-text-primary">{domain.name}</span>
                    <span className="text-xs text-text-secondary">{domain.detail}</span>
                    <span className="text-xs text-text-muted sm:text-right">{domainStatuses[domain.key]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-border bg-panel rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-text-primary">Priority findings</h2>
                <p className="text-xs text-text-muted mt-0.5">Highest-impact issues requiring attention.</p>
              </div>
              {findings.length > 0 ? (
                <div className="divide-y divide-border">
                  {findings.map(finding => (
                    <article key={finding.ruleKey} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-medium text-text-primary">{finding.title}</h3>
                        <span className={`shrink-0 text-[10px] font-semibold uppercase ${severityClass(finding.severity)}`}>
                          {finding.severity}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary mt-2">{finding.summary}</p>
                      <p className="text-xs text-text-primary mt-2">
                        <span className="font-medium">Next step:</span> {finding.recommendation}
                      </p>
                      {finding.affectedResources.length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-accent cursor-pointer">
                            {finding.affectedResources.length} affected {finding.affectedResources.length === 1 ? 'resource' : 'resources'}
                          </summary>
                          <ul className="mt-2 space-y-1 max-h-28 overflow-y-auto">
                            {finding.affectedResources.map(resource => (
                              <li key={resource} className="text-[11px] font-mono text-text-muted break-all">{resource}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="min-h-64 px-6 py-10 flex flex-col items-center justify-center text-center">
                  <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted mb-3" aria-hidden="true">
                    <path d="M8.75 1.75a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.293l-1.147 1.146a.75.75 0 0 0 1.061 1.061l2.427-2.427a.75.75 0 0 0 0-1.06l-2.427-2.427a.75.75 0 0 0-1.06 1.06L12.292 7H8.75V1.75Z" />
                    <path d="M3.5 3.75a.25.25 0 0 0-.25.25v8a.25.25 0 0 0 .25.25h6a.25.25 0 0 0 .25-.25v-.5a.75.75 0 0 1 1.5 0v.5c0 .966-.784 1.75-1.75 1.75h-6A1.75 1.75 0 0 1 1.75 12V4c0-.966.784-1.75 1.75-1.75H5a.75.75 0 0 1 0 1.5H3.5Z" />
                  </svg>
                  <p className="text-sm font-medium text-text-primary">
                    {baselineEvaluated ? 'No baseline findings' : 'Baseline not evaluated'}
                  </p>
                  <p className="text-xs text-text-secondary mt-1 max-w-56">
                    {baselineEvaluated
                      ? 'The currently supported identity and repository checks passed.'
                      : 'Run the assessment again to evaluate evidence-backed baseline checks.'}
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function ActionsPolicySignal({
  label,
  value,
  safe,
}: {
  label: string;
  value: string | null;
  safe: boolean | undefined;
}) {
  const valueClass = safe === undefined
    ? 'text-text-muted'
    : safe ? 'text-success' : 'text-warning';
  return (
    <div className="px-4 py-3 min-w-0">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className={`text-sm font-medium mt-1 ${valueClass}`}>{value ?? '? Not collected'}</p>
    </div>
  );
}

function IdentityAccessSignal({
  label,
  value,
  suffix,
  caution = false,
}: {
  label: string;
  value: number | undefined;
  suffix: string;
  caution?: boolean;
}) {
  return (
    <div className="px-4 py-3 min-w-0">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className={`text-lg font-semibold mt-1 tabular-nums ${
        caution ? 'text-warning' : value === undefined ? 'text-text-muted' : 'text-text-primary'
      }`}>
        {value === undefined ? '—' : value}
      </p>
      <p className="text-[10px] text-text-muted">
        {caution ? '! Review · ' : ''}{suffix}
      </p>
    </div>
  );
}

function RepositoryCreationPolicy({
  organization,
}: {
  organization: AssessmentOrganizationAccess;
}) {
  const settings = [
    ['public', organization.membersCanCreatePublicRepositories],
    ['private', organization.membersCanCreatePrivateRepositories],
    ['internal', organization.membersCanCreateInternalRepositories],
  ] as const;
  if (settings.every(([, value]) => value === null)) {
    return <span className="text-text-muted">? Unavailable</span>;
  }
  const enabled = settings.filter(([, value]) => value === true).map(([label]) => label);
  if (enabled.length === 0) return <span className="text-success">✔ Restricted</span>;
  return (
    <span className={organization.membersCanCreatePublicRepositories ? 'text-warning' : undefined}>
      {organization.membersCanCreatePublicRepositories ? '! ' : ''}{enabled.join(', ')}
    </span>
  );
}

function EvidenceBoolean({
  value,
  trueLabel,
  falseLabel,
}: {
  value: boolean | null;
  trueLabel: string;
  falseLabel: string;
}) {
  if (value === null) return <span className="text-text-muted">? Unavailable</span>;
  return <span className="text-text-secondary">{value ? trueLabel : falseLabel}</span>;
}

function IdentityList({
  values,
  emptyLabel,
}: {
  values: string[] | null;
  emptyLabel: string;
}) {
  if (values === null) return <span className="text-text-muted">? Unavailable</span>;
  if (values.length === 0) return <span className="text-success">{emptyLabel}</span>;
  return <span>{values.join(', ')}</span>;
}

function RepositoryDirectGrants({
  grants,
}: {
  grants: AssessmentRepositoryAccess['directCollaborators'];
}) {
  if (grants === null) return <span className="text-text-muted">? Unavailable</span>;
  if (grants.length === 0) return <span className="text-success">✔ None</span>;
  return (
    <span className="space-y-1">
      {grants.map(grant => (
        <span key={grant.login} className="block">
          {grant.login} · {grant.permission}
          {grant.permission === 'unknown' && ` (${grant.roleName})`}
        </span>
      ))}
    </span>
  );
}

function RepositoryTeamGrants({
  grants,
}: {
  grants: AssessmentRepositoryAccess['teamGrants'];
}) {
  if (grants === null) return <span className="text-text-muted">? Unavailable</span>;
  if (grants.length === 0) return <span className="text-text-muted">— None</span>;
  return (
    <span className="space-y-1">
      {grants.map(grant => (
        <span key={grant.slug} className="block">
          {grant.name} · {grant.permission}
        </span>
      ))}
    </span>
  );
}

function ScimRoleList({ roles }: { roles: string[] }) {
  if (roles.length === 0) return <span>— None reported</span>;
  return (
    <>
      {roles.map((role, index) => (
        <span key={role} title={`GitHub SCIM role value: ${role}`}>
          {index > 0 && ', '}
          {formatScimRoleLabel(role)}
        </span>
      ))}
    </>
  );
}

function formatForkWorkflowPolicy(
  evidence: AssessmentActionsEvidence | null | undefined
): string | null {
  const policy = evidence?.forkPullRequestPolicy;
  if (!policy) return null;
  if (!policy.runWorkflowsFromForkPullRequests) return '✔ Blocked';
  if (policy.requireApprovalForForkPullRequestWorkflows) return '✔ Approval required';
  return 'Runs automatically';
}

function formatRunnerGroupVisibility(visibility: string): string {
  if (visibility === 'all') return 'All organizations';
  if (visibility === 'selected') return 'Selected organizations';
  if (visibility === 'private') return 'Private repositories';
  return visibility;
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="text-xs font-medium text-text-primary text-right">{value}</span>
    </div>
  );
}

function SecurityCoverageMetric({
  label,
  enabled,
  total,
  stateLabel = 'enabled',
}: {
  label: string;
  enabled: number | undefined;
  total: number | undefined;
  stateLabel?: string;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className="text-sm font-medium text-text-primary mt-1">
        {enabled === undefined || total === undefined ? '--' : `${enabled} of ${total} ${stateLabel}`}
      </p>
    </div>
  );
}

function BranchCoverageMetric({
  label,
  value,
  total,
  suffix,
}: {
  label: string;
  value?: number;
  total?: number;
  suffix?: string;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="text-lg font-semibold text-text-primary tabular-nums">
        {value === undefined ? '—' : total === undefined ? value : `${value}/${total}`}
      </p>
      {suffix && <p className="text-[10px] text-text-muted">{suffix}</p>}
    </div>
  );
}

function RulesetConditions({ ruleset }: { ruleset: AssessmentRulesetDetail }) {
  if (ruleset.conditions.length === 0) {
    return <span className="text-text-muted">— None reported</span>;
  }
  return (
    <span>
      {ruleset.conditions.map(condition => (
        <span key={condition.type} className="block">
          {condition.type}: {condition.include.join(', ') || 'all'}
          {condition.exclude.length > 0 && `; except ${condition.exclude.join(', ')}`}
        </span>
      ))}
    </span>
  );
}

function RulesetBypassPaths({ ruleset }: { ruleset: AssessmentRulesetDetail }) {
  if (ruleset.bypassActors.length === 0) {
    return <span className="text-success">✔ None</span>;
  }
  return (
    <span className="space-y-1">
      {ruleset.bypassActors.map((actor, index) => {
        const unconditional = actor.bypassMode === 'always' || actor.bypassMode === 'exempt';
        return (
          <span
            key={`${actor.actorType}-${actor.actorId ?? 'all'}-${actor.bypassMode}-${index}`}
            className={`block ${unconditional ? 'text-warning' : 'text-text-secondary'}`}
          >
            {unconditional ? '!' : '↳'} {actor.actorType}
            {actor.actorId === null ? '' : ` ${actor.actorId}`} · {actor.bypassMode}
          </span>
        );
      })}
    </span>
  );
}

function ProtectionSource({ repository }: { repository: AssessmentRepositoryRules }) {
  if (repository.isArchived || repository.isFork || repository.branchExists === false) {
    return <span className="text-text-muted">— Not applicable</span>;
  }
  if (repository.hasProtection === false) {
    return <span className="text-warning">! None</span>;
  }
  if (repository.hasProtection === null) {
    return <span className="text-text-muted">? Unknown</span>;
  }

  const hasRuleset = (repository.activeRulesetIds?.length ?? 0) > 0;
  const source = hasRuleset && repository.classicProtection
    ? 'Ruleset + classic'
    : hasRuleset
      ? 'Active ruleset'
      : repository.classicProtection
        ? 'Classic'
        : 'Protected';
  return <span className="text-success">✔ {source}</span>;
}

function PullRequestProtection({ repository }: { repository: AssessmentRepositoryRules }) {
  if (repository.isArchived || repository.isFork || repository.branchExists === false) {
    return <span className="text-text-muted">— Not applicable</span>;
  }
  if (repository.requiresPullRequest === null) {
    return <span className="text-text-muted">? Unknown</span>;
  }
  if (!repository.requiresPullRequest) {
    return <span className="text-warning">! Not required</span>;
  }
  if (repository.requiredApprovingReviewCount === null) {
    return <span className="text-success">✔ Required</span>;
  }
  if (repository.requiredApprovingReviewCount === 0) {
    return <span className="text-warning">! No approvals</span>;
  }
  return (
    <span className="text-success">
      ✔ {repository.requiredApprovingReviewCount}{' '}
      {repository.requiredApprovingReviewCount === 1 ? 'approval' : 'approvals'}
    </span>
  );
}

function BranchControlState({
  value,
  enabledLabel = 'Required',
  disabledLabel = 'Not required',
  notApplicable = false,
}: {
  value: boolean | null;
  enabledLabel?: string;
  disabledLabel?: string;
  notApplicable?: boolean;
}) {
  if (notApplicable) return <span className="text-text-muted">— Not applicable</span>;
  if (value === null) return <span className="text-text-muted">? Unknown</span>;
  return value
    ? <span className="text-success">✔ {enabledLabel}</span>
    : <span className="text-warning">! {disabledLabel}</span>;
}

function SecurityState({ value }: { value: string | null }) {
  if (value === 'enabled') return <span className="font-medium text-success">✔ Enabled</span>;
  if (value === 'disabled') return <span className="font-medium text-warning">— Disabled</span>;
  if (value === 'configured') return <span className="font-medium text-success">✔ Configured</span>;
  if (value === 'not-configured') return <span className="font-medium text-warning">— Not configured</span>;
  if (value === 'unavailable') return <span className="text-text-muted">— Unavailable</span>;
  if (!value) return <span className="text-text-muted">? Unknown</span>;
  return <span className="text-text-secondary">{value}</span>;
}

function ConfigurationState({ repository }: { repository: AssessmentRepositorySecurity }) {
  if (repository.configurationStatus === 'attached' || repository.configurationStatus === 'enforced') {
    return (
      <span className="font-medium text-success" title={repository.configurationName || undefined}>
        ✔ {repository.configurationStatus === 'enforced' ? 'Enforced' : 'Attached'}
      </span>
    );
  }
  if (repository.configurationStatus === 'none') {
    return <span className="font-medium text-warning">— None</span>;
  }
  if (!repository.configurationStatus) return <span className="text-text-muted">? Unknown</span>;
  return <span className="text-text-secondary">{repository.configurationStatus}</span>;
}

function formatAssessmentDate(value: string | null | undefined): string {
  if (!value) return 'Never';
  const date = new Date(value.endsWith('Z') ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function severityClass(severity: AssessmentFinding['severity']): string {
  if (severity === 'critical') return 'text-danger';
  if (severity === 'high') return 'text-warning';
  if (severity === 'medium') return 'text-accent';
  return 'text-text-secondary';
}

function splitCollectorFailures(error: string | null): string[] {
  if (!error) return ['No diagnostic details were returned.'];
  const failures: string[] = [];
  for (const line of error.split('\n').map(value => value.trim()).filter(Boolean)) {
    if (/^[^:\s][^:]*:/.test(line) || failures.length === 0) {
      failures.push(line);
    } else {
      failures[failures.length - 1] = `${failures[failures.length - 1]} ${line}`;
    }
  }
  return failures;
}