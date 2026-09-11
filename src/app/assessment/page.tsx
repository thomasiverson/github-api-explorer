'use client';

import { useCallback, useEffect, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { useApp } from '@/components/AppContext';
import {
  formatScimRoleLabel,
  type AssessmentActionsEvidence,
  type AssessmentBillingEvidence,
  type AssessmentBudget,
  type AssessmentCopilotEvidence,
  type AssessmentCopilotSeatInventory,
  type AssessmentFinding,
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
  domainScores: Partial<Record<AssessmentDomainKey, number>>;
  collectors: AssessmentCollectorResult[];
  organizationAccess: AssessmentOrganizationAccess[];
  repositoryAccess: AssessmentRepositoryAccess[];
  scim: AssessmentScimInventory | null;
  repositorySecurity: AssessmentRepositorySecurity[];
  repositoryRules: AssessmentRepositoryRules[];
  rulesets: AssessmentRulesetDetail[];
  actionsEvidence: AssessmentActionsEvidence | null;
  copilotSeats: AssessmentCopilotSeatInventory | null;
  copilotEvidence: AssessmentCopilotEvidence | null;
  budgets: AssessmentBudget[] | null;
  billingEvidence: AssessmentBillingEvidence | null;
  findings: AssessmentFinding[];
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
  const copilotDepthCollector = snapshot?.collectors.find(
    collector => collector.collector_key === 'copilotDepth'
  );
  const billingCollector = snapshot?.collectors.find(collector => collector.collector_key === 'billing');
  const billingDepthCollector = snapshot?.collectors.find(
    collector => collector.collector_key === 'billingDepth'
  );
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
  const copilotSeats = snapshot?.copilotSeats;
  const copilotEvidence = snapshot?.copilotEvidence;
  const budgets = snapshot?.budgets;
  const billingEvidence = snapshot?.billingEvidence;
  const budgetById = new Map((budgets ?? []).map(budget => [budget.id, budget]));
  const budgetStateCountById = new Map<string, number>();
  for (const state of billingEvidence?.multiUserBudgetStates ?? []) {
    budgetStateCountById.set(
      state.budgetId,
      (budgetStateCountById.get(state.budgetId) ?? 0) + 1
    );
  }
  const costCentersByUser = new Map<string, string[]>();
  for (const costCenter of billingEvidence?.costCenters ?? []) {
    for (const resource of costCenter.resources ?? []) {
      if (resource.type.toLowerCase() !== 'user') continue;
      const key = resource.name.toLowerCase();
      costCentersByUser.set(key, [...(costCentersByUser.get(key) ?? []), costCenter.name]);
    }
  }
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
      ? copilotDepthCollector?.status === 'completed'
        ? 'Governance depth'
        : copilotDepthCollector?.status === 'partial'
          ? 'Partial governance depth'
          : copilotCollector?.status === 'completed' ? 'Baseline' : 'Unavailable'
      : 'Not assessed',
    billing: baselineEvaluated
      ? billingDepthCollector?.status === 'completed'
        ? 'Ownership depth'
        : billingDepthCollector?.status === 'partial'
          ? 'Partial ownership depth'
          : billingCollector?.status === 'completed' ? 'Baseline' : 'Unavailable'
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
                        ? 'Baseline score is the equal-weight average of domains with completed evidence collection.'
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
                      <div className="text-[10px] uppercase text-text-muted">Domain average</div>
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
                <StatusRow label="Rule profile" value="Equal-weight domains" />
              </div>
              <div className="mt-5 pt-4 border-t border-border">
                <p className="text-xs text-text-secondary">
                  Each assessed domain starts at 100 and deducts 30, 20, 10, or 5 points for each critical, high, medium, or low finding. Domain scores stop at zero, and the displayed score is their rounded average.
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

          <section aria-labelledby="domains-heading" className="border border-border bg-panel rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 id="domains-heading" className="text-sm font-semibold text-text-primary">Assessment domains</h2>
              <p className="text-xs text-text-muted mt-0.5">Each assessed domain contributes equally to the overall score; collection coverage remains separate.</p>
            </div>
            <div className="divide-y divide-border">
              {ASSESSMENT_DOMAINS.map(domain => {
                const score = snapshot?.domainScores?.[domain.key];
                return (
                  <div key={domain.name} className="px-4 py-3 grid gap-2 sm:grid-cols-[190px_1fr_120px_80px] sm:items-center">
                    <span className="text-sm font-medium text-text-primary">{domain.name}</span>
                    <span className="text-xs text-text-secondary">{domain.detail}</span>
                    <span className="text-xs text-text-muted sm:text-right">{domainStatuses[domain.key]}</span>
                    <span className="text-xs font-medium tabular-nums text-text-primary sm:text-right">
                      {score === undefined ? '—' : `${score} / 100`}
                    </span>
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

          <section aria-labelledby="copilot-governance-heading" className="border border-border bg-panel rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 id="copilot-governance-heading" className="text-sm font-semibold text-text-primary">
                  Copilot governance & adoption
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Paid-seat activity, assignment provenance, organization policy, and coding-agent reach.
                </p>
              </div>
              <span className="text-xs text-text-muted">
                {copilotDepthCollector
                  ? `${copilotEvidence?.organizations.length ?? 0} organizations measured`
                  : 'Run again for governance depth'}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-border">
              <GovernanceSignal
                label="Billed users"
                value={metricValue(snapshot, 'copilotSeats')}
                detail="Unique enterprise seats"
              />
              <GovernanceSignal
                label="Recent activity"
                value={formatMetricPair(
                  snapshot?.metrics.activeCopilotSeats,
                  snapshot?.metrics.inactiveCopilotSeats
                )}
                detail="Active / reclaim candidates"
                caution={(snapshot?.metrics.inactiveCopilotSeats ?? 0) > 0}
              />
              <GovernanceSignal
                label="Licensed organizations"
                value={formatMetricPair(
                  snapshot?.metrics.copilotOrganizationsWithSeats,
                  snapshot?.metrics.copilotOrganizationsMeasured
                )}
                detail="With seats / measured"
              />
              <GovernanceSignal
                label="Coding agent reach"
                value={metricValue(snapshot, 'copilotOrganizationsWithBroadCodingAgentAccess')}
                detail="Licensed orgs set to all repositories"
                caution={(snapshot?.metrics.copilotOrganizationsWithBroadCodingAgentAccess ?? 0) > 0}
              />
              <GovernanceSignal
                label="Content exclusions"
                value={metricValue(snapshot, 'copilotContentExclusionRules')}
                detail="Enterprise rules reported"
              />
            </div>
            {copilotSeats || copilotEvidence ? (
              <>
                <details className="border-t border-border">
                  <summary className="px-4 py-3 text-xs font-medium text-accent cursor-pointer">
                    Review paid-seat activity and assignment paths ({copilotSeats?.seats.length ?? 0})
                  </summary>
                  <div className="overflow-x-auto border-t border-border">
                    <table className="w-full min-w-[900px] text-left">
                      <caption className="px-4 py-3 text-left text-xs text-text-muted">
                        GitHub seat activity can lag by 24 hours and retains a rolling 90-day signal. Missing activity is a review candidate, not proof that a seat was never used.
                      </caption>
                      <thead className="bg-surface">
                        <tr className="text-[10px] uppercase tracking-wide text-text-muted">
                          <th className="px-4 py-2 font-medium">User</th>
                          <th className="px-3 py-2 font-medium">Plan</th>
                          <th className="px-3 py-2 font-medium">Last activity</th>
                          <th className="px-3 py-2 font-medium">Editor</th>
                          <th className="px-3 py-2 font-medium">Assignment path</th>
                          <th className="px-3 py-2 font-medium">Lifecycle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(copilotSeats?.seats ?? []).map(seat => (
                          <tr key={seat.login} className="text-xs">
                            <td className="px-4 py-2.5 font-mono text-text-primary">{seat.login}</td>
                            <td className="px-3 py-2.5 text-text-secondary">{formatPolicyLabel(seat.planType)}</td>
                            <td className="px-3 py-2.5">
                              <CopilotActivity seat={seat} />
                            </td>
                            <td className="px-3 py-2.5 text-text-secondary">
                              {seat.lastActivityEditor ?? '— Not reported'}
                            </td>
                            <td className="px-3 py-2.5 text-text-secondary">
                              <CopilotAssignmentSources sources={seat.assignmentSources} />
                            </td>
                            <td className="px-3 py-2.5">
                              {seat.pendingCancellationDate
                                ? <span className="text-warning">! Cancels {formatDate(seat.pendingCancellationDate)}</span>
                                : <span className="text-success">✔ Assigned</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                <details className="border-t border-border">
                  <summary className="px-4 py-3 text-xs font-medium text-accent cursor-pointer">
                    Review organization Copilot policy ({copilotEvidence?.organizations.length ?? 0})
                  </summary>
                  <div className="border-t border-border">
                    <p className="px-4 py-3 text-xs text-text-muted">
                      Findings apply only to organizations with paid seats. Dormant organization defaults remain visible without affecting the score.
                    </p>
                    <div className="overflow-x-auto border-t border-border">
                      <table className="w-full min-w-[980px] text-left">
                        <caption className="px-4 py-3 text-left text-xs text-text-muted">
                          These are organization-reported settings. GitHub does not expose a complete readable enterprise policy matrix or each organization&apos;s effective inherited policy.
                        </caption>
                        <thead className="bg-surface">
                          <tr className="text-[10px] uppercase tracking-wide text-text-muted">
                            <th className="px-4 py-2 font-medium">Organization</th>
                            <th className="px-3 py-2 font-medium">Seats</th>
                            <th className="px-3 py-2 font-medium">Cycle activity</th>
                            <th className="px-3 py-2 font-medium">Seat management</th>
                            <th className="px-3 py-2 font-medium">Public-code matches</th>
                            <th className="px-3 py-2 font-medium">Coding agent</th>
                            <th className="px-3 py-2 font-medium">Surfaces</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(copilotEvidence?.organizations ?? []).map(organization => (
                            <tr key={organization.organizationLogin} className="text-xs">
                              <td className="px-4 py-2.5 font-mono text-text-primary">
                                {organization.organizationLogin}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums text-text-primary">
                                {organization.seatTotal ?? '?'}
                              </td>
                              <td className="px-3 py-2.5 text-text-secondary">
                                {organization.activeSeatsThisCycle === null
                                  ? '? Unavailable'
                                  : `${organization.activeSeatsThisCycle} active · ${organization.inactiveSeatsThisCycle ?? 0} inactive`}
                              </td>
                              <td className="px-3 py-2.5 text-text-secondary">
                                {formatPolicyLabel(organization.seatManagementSetting)}
                              </td>
                              <td className="px-3 py-2.5">
                                <PolicyState
                                  value={organization.publicCodeSuggestions}
                                  cautionValue={(organization.seatTotal ?? 0) > 0 ? 'allow' : undefined}
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <PolicyState
                                  value={organization.codingAgentRepositoryScope}
                                  cautionValue={(organization.seatTotal ?? 0) > 0 ? 'all' : undefined}
                                />
                              </td>
                              <td className="px-3 py-2.5 text-text-secondary">
                                IDE {formatPolicyLabel(organization.ideChat)} · Web {formatPolicyLabel(organization.platformChat)} · CLI {formatPolicyLabel(organization.cli)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </details>
              </>
            ) : (
              <p className="border-t border-border px-4 py-4 text-xs text-text-muted">
                Run the assessment again to collect Copilot policy and assignment evidence.
              </p>
            )}
          </section>

          <section aria-labelledby="billing-governance-heading" className="border border-border bg-panel rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 id="billing-governance-heading" className="text-sm font-semibold text-text-primary">
                  Billing ownership & budget hierarchy
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Cost-center membership, shared pools, per-user allowances, alert ownership, and current-period usage.
                </p>
              </div>
              <span className="text-xs text-text-muted">
                {billingDepthCollector
                  ? `${billingEvidence?.costCenters.length ?? 0} active cost centers`
                  : 'Run again for ownership depth'}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-border">
              <GovernanceSignal
                label="Cost centers"
                value={metricValue(snapshot, 'activeCostCenters')}
                detail="Active billing owners"
              />
              <GovernanceSignal
                label="Assigned resources"
                value={metricValue(snapshot, 'costCenterResources')}
                detail="Users, teams, orgs, and repositories"
              />
              <GovernanceSignal
                label="Cost-center budgets"
                value={formatMetricPair(
                  snapshot?.metrics.sharedCostCenterBudgets,
                  snapshot?.metrics.perUserCostCenterBudgets
                )}
                detail="Shared pool / per-user"
              />
              <GovernanceSignal
                label="Effective allowances"
                value={formatMetricPair(
                  snapshot?.metrics.effectiveUserBudgets,
                  billingEvidence?.effectiveBudgets.length
                )}
                detail="Users with effective / checked"
              />
              <GovernanceSignal
                label="Current net usage"
                value={snapshot?.metrics.billingNetAmount === undefined
                  ? '—'
                  : formatCurrency(snapshot.metrics.billingNetAmount)}
                detail={formatBillingPeriod(billingEvidence?.usage)}
              />
            </div>
            {budgets || billingEvidence ? (
              <>
                <details className="border-t border-border">
                  <summary className="px-4 py-3 text-xs font-medium text-accent cursor-pointer">
                    Review cost centers and effective user allowances
                  </summary>
                  <div className="border-t border-border">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[840px] text-left">
                        <caption className="px-4 py-3 text-left text-xs text-text-muted">
                          Cost-center membership determines shared-pool applicability. It does not create an individual effective budget, and GitHub does not expand indirect team membership.
                        </caption>
                        <thead className="bg-surface">
                          <tr className="text-[10px] uppercase tracking-wide text-text-muted">
                            <th className="px-4 py-2 font-medium">Cost center</th>
                            <th className="px-3 py-2 font-medium">Assigned resources</th>
                            <th className="px-3 py-2 font-medium">AI credit pool</th>
                            <th className="px-3 py-2 font-medium">Azure subscription</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(billingEvidence?.costCenters ?? []).map(costCenter => (
                            <tr key={costCenter.id} className="text-xs">
                              <td className="px-4 py-2.5 text-text-primary">
                                {costCenter.name}
                                <span className="block font-mono text-[10px] text-text-muted">{costCenter.id}</span>
                              </td>
                              <td className="px-3 py-2.5 text-text-secondary">
                                <CostCenterResources resources={costCenter.resources} />
                              </td>
                              <td className="px-3 py-2.5 text-text-secondary">
                                {formatAiCreditPool(costCenter)}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-text-secondary">
                                {costCenter.azureSubscription ?? '— None'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="overflow-x-auto border-t border-border">
                      <table className="w-full min-w-[900px] text-left">
                        <caption className="px-4 py-3 text-left text-xs text-text-muted">
                          GitHub returns the winning effective allowance and applicable controls, but not a precedence trace. In this enterprise, direct user allowances override cost-center per-user, then enterprise per-user allowances. Shared cost-center pools remain separate.
                        </caption>
                        <thead className="bg-surface">
                          <tr className="text-[10px] uppercase tracking-wide text-text-muted">
                            <th className="px-4 py-2 font-medium">User</th>
                            <th className="px-3 py-2 font-medium">Direct user membership</th>
                            <th className="px-3 py-2 font-medium">Applicable controls</th>
                            <th className="px-3 py-2 font-medium">Effective allowance</th>
                            <th className="px-3 py-2 font-medium">Consumed</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(billingEvidence?.effectiveBudgets ?? []).map(effective => {
                            const budget = effective.budgetId
                              ? budgetById.get(effective.budgetId)
                              : undefined;
                            return (
                              <tr key={effective.user} className="text-xs">
                                <td className="px-4 py-2.5 font-mono text-text-primary">{effective.user}</td>
                                <td className="px-3 py-2.5 text-text-secondary">
                                  {(costCentersByUser.get(effective.user.toLowerCase()) ?? []).join(', ') || '— None'}
                                </td>
                                <td className="px-3 py-2.5 text-text-secondary">
                                  {effective.applicableBudgetIds.length} returned
                                </td>
                                <td className="px-3 py-2.5">
                                  {effective.budgetId
                                    ? <span className="text-success">✔ {formatCurrency(effective.amount)} · {formatBudgetScope(budget?.scope)}</span>
                                    : <span className="text-text-muted">— No per-user effective budget</span>}
                                </td>
                                <td className="px-3 py-2.5 tabular-nums text-text-secondary">
                                  {effective.consumedAmount === null
                                    ? '—'
                                    : formatCurrency(effective.consumedAmount)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </details>
                <details className="border-t border-border">
                  <summary className="px-4 py-3 text-xs font-medium text-accent cursor-pointer">
                    Review budget controls and current usage ({budgets?.length ?? 0})
                  </summary>
                  <div className="border-t border-border">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1000px] text-left">
                        <thead className="bg-surface">
                          <tr className="text-[10px] uppercase tracking-wide text-text-muted">
                            <th className="px-4 py-2 font-medium">Product</th>
                            <th className="px-3 py-2 font-medium">Scope</th>
                            <th className="px-3 py-2 font-medium">Subject</th>
                            <th className="px-3 py-2 font-medium">Amount / consumed</th>
                            <th className="px-3 py-2 font-medium">Enforcement</th>
                            <th className="px-3 py-2 font-medium">Alert ownership</th>
                            <th className="px-3 py-2 font-medium">User states</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(budgets ?? []).map(budget => (
                            <tr key={budget.id} className="text-xs">
                              <td className="px-4 py-2.5 font-mono text-text-primary">{budget.productSku}</td>
                              <td className="px-3 py-2.5 text-text-secondary">{formatBudgetScope(budget.scope)}</td>
                              <td className="px-3 py-2.5 text-text-secondary">
                                {budget.user ?? budget.entityName ?? '—'}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums text-text-secondary">
                                {formatCurrency(budget.amount)} / {budget.consumedAmount === null ? '—' : formatCurrency(budget.consumedAmount)}
                              </td>
                              <td className="px-3 py-2.5">
                                {budget.preventsFurtherUsage
                                  ? <span className="text-success">✔ Stops usage</span>
                                  : <span className="text-warning">! Allows overage</span>}
                              </td>
                              <td className="px-3 py-2.5 text-text-secondary">
                                <BudgetAlertOwnership budget={budget} />
                              </td>
                              <td className="px-3 py-2.5 tabular-nums text-text-secondary">
                                {budgetStateCountById.get(budget.id) ?? '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {billingEvidence?.multiUserBudgetStates.length ? (
                      <div className="overflow-x-auto border-t border-border">
                        <table className="w-full min-w-[760px] text-left">
                          <caption className="px-4 py-3 text-left text-xs text-text-muted">
                            GitHub reports multi-user states only for users with a current state; this is not a complete membership roster.
                          </caption>
                          <thead className="bg-surface">
                            <tr className="text-[10px] uppercase tracking-wide text-text-muted">
                              <th className="px-4 py-2 font-medium">Budget</th>
                              <th className="px-3 py-2 font-medium">User</th>
                              <th className="px-3 py-2 font-medium">Target</th>
                              <th className="px-3 py-2 font-medium">Consumed</th>
                              <th className="px-3 py-2 font-medium">Override</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {billingEvidence.multiUserBudgetStates.map(state => (
                              <tr key={`${state.budgetId}-${state.user}`} className="text-xs">
                                <td className="px-4 py-2.5 font-mono text-text-secondary">
                                  {budgetById.get(state.budgetId)?.entityName ?? state.budgetId}
                                </td>
                                <td className="px-3 py-2.5 font-mono text-text-primary">{state.user}</td>
                                <td className="px-3 py-2.5 tabular-nums text-text-secondary">{formatCurrency(state.targetAmount)}</td>
                                <td className="px-3 py-2.5 tabular-nums text-text-secondary">{formatCurrency(state.consumedAmount)}</td>
                                <td className="px-3 py-2.5 font-mono text-text-muted">{state.overrideBudgetId ?? '— None'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                    {billingEvidence?.usage ? (
                      <div className="overflow-x-auto border-t border-border">
                        <table className="w-full min-w-[760px] text-left">
                          <caption className="px-4 py-3 text-left text-xs text-text-muted">
                            Current-period usage uses GitHub billing SKU names. Budget product names use a different taxonomy, so coverage is not inferred from name matching.
                          </caption>
                          <thead className="bg-surface">
                            <tr className="text-[10px] uppercase tracking-wide text-text-muted">
                              <th className="px-4 py-2 font-medium">Product</th>
                              <th className="px-3 py-2 font-medium">Billing SKU</th>
                              <th className="px-3 py-2 font-medium">Unit</th>
                              <th className="px-3 py-2 font-medium">Net quantity</th>
                              <th className="px-3 py-2 font-medium">Net amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {billingEvidence.usage.items.map(item => (
                              <tr key={`${item.product}-${item.sku}`} className="text-xs">
                                <td className="px-4 py-2.5 text-text-primary">{item.product}</td>
                                <td className="px-3 py-2.5 font-mono text-text-secondary">{item.sku}</td>
                                <td className="px-3 py-2.5 text-text-secondary">{item.unitType}</td>
                                <td className="px-3 py-2.5 tabular-nums text-text-secondary">{formatNumber(item.netQuantity)}</td>
                                <td className="px-3 py-2.5 tabular-nums text-text-primary">{formatCurrency(item.netAmount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                </details>
              </>
            ) : (
              <p className="border-t border-border px-4 py-4 text-xs text-text-muted">
                Run the assessment again to collect cost-center, effective-budget, and usage evidence.
              </p>
            )}
          </section>

          <section aria-labelledby="findings-heading">
            <div className="border border-border bg-panel rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 id="findings-heading" className="text-sm font-semibold text-text-primary">Priority findings</h2>
                <p className="text-xs text-text-muted mt-0.5">Highest-impact issues requiring attention.</p>
              </div>
              {findings.length > 0 ? (
                <div className="divide-y divide-border">
                  {findings.map(finding => (
                    <FindingDrillDown
                      key={finding.ruleKey}
                      finding={finding}
                      collectors={snapshot?.collectors ?? []}
                      completedAt={snapshot?.completedAt ?? null}
                      runId={snapshot?.id ?? null}
                    />
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

function FindingDrillDown({
  finding,
  collectors,
  completedAt,
  runId,
}: {
  finding: AssessmentFinding;
  collectors: AssessmentCollectorResult[];
  completedAt: string | null;
  runId: string | null;
}) {
  const domain = ASSESSMENT_DOMAINS.find(candidate => candidate.key === finding.domain);
  const evidenceSources = finding.evidenceSources ?? [];
  const expectedState = finding.expectedState
    || 'Run the assessment again to attach the expected baseline to this historical finding.';

  return (
    <article className="px-4 py-3">
      <details className="group">
        <summary className="list-none cursor-pointer rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <span className="flex items-start justify-between gap-3">
            <span className="text-sm font-medium text-text-primary">{finding.title}</span>
            <span className={`shrink-0 text-[10px] font-semibold uppercase ${severityClass(finding.severity)}`}>
              {finding.severity}
            </span>
          </span>
          <span className="mt-2 block text-xs text-text-secondary">{finding.summary}</span>
          <span className="mt-3 flex items-center justify-between gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-accent">
              <span className="group-open:hidden">Review evidence</span>
              <span className="hidden group-open:inline">Hide evidence</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="transition-transform group-open:rotate-180"
                aria-hidden="true"
              >
                <path d="M3.22 5.97a.75.75 0 0 1 1.06 0L8 9.69l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L3.22 7.03a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </span>
            <span className="text-text-muted">{domain?.name ?? finding.domain}</span>
          </span>
        </summary>

        <div className="mt-4 border-t border-border pt-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border border-border bg-surface px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                Observed state
              </p>
              <p className="mt-1.5 text-xs text-text-primary">{finding.summary}</p>
            </div>
            <div className="rounded-md border border-border bg-surface px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                Expected baseline
              </p>
              <p className="mt-1.5 text-xs text-text-primary">{expectedState}</p>
            </div>
          </div>

          <div className="mt-3 rounded-md border border-border">
            <div className="border-b border-border px-3 py-2">
              <h4 className="text-xs font-semibold text-text-primary">Evidence trail</h4>
            </div>
            {evidenceSources.length > 0 ? (
              <ul className="divide-y divide-border">
                {evidenceSources.map(source => {
                  const collector = collectors.find(
                    candidate => candidate.collector_key === source.collectorKey
                  );
                  return (
                    <li key={`${source.collectorKey}:${source.endpoint}`} className="px-3 py-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-text-primary">{source.label}</p>
                          <p className="mt-0.5 break-all font-mono text-[10px] text-text-muted">
                            {source.endpoint}
                          </p>
                        </div>
                        <CollectorEvidenceStatus collector={collector} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-3 py-3 text-xs text-text-muted">
                This historical rule does not include collector metadata.
              </p>
            )}
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div>
              <h4 className="text-xs font-semibold text-text-primary">Affected scope</h4>
              {finding.affectedResources.length > 0 ? (
                <>
                  <p className="mt-1 text-[11px] text-text-muted">
                    {finding.affectedResources.length} affected {finding.affectedResources.length === 1 ? 'resource' : 'resources'}
                  </p>
                  <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-md border border-border bg-surface px-3 py-2">
                    {finding.affectedResources.map(resource => (
                      <li key={resource} className="break-all font-mono text-[11px] text-text-secondary">
                        {resource}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-1 text-xs text-text-secondary">
                  Enterprise-wide setting; no individual resource list applies.
                </p>
              )}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-text-primary">Recommended action</h4>
              <p className="mt-1 text-xs text-text-secondary">{finding.recommendation}</p>
            </div>
          </div>

          <p className="mt-4 border-t border-border pt-3 text-[10px] text-text-muted">
            Collected {formatAssessmentDate(completedAt)}
            {runId ? ` in assessment ${runId}` : ''}
          </p>
        </div>
      </details>
    </article>
  );
}

function CollectorEvidenceStatus({
  collector,
}: {
  collector: AssessmentCollectorResult | undefined;
}) {
  if (!collector) {
    return <span className="shrink-0 text-[11px] text-text-muted">? Not recorded</span>;
  }
  if (collector.status === 'failed') {
    return <span className="shrink-0 text-[11px] font-medium text-danger">✘ Failed</span>;
  }
  if (collector.status === 'partial') {
    return (
      <span className="shrink-0 text-right text-[11px] font-medium text-warning">
        ! Partial · {collector.item_count.toLocaleString()} records
      </span>
    );
  }
  return (
    <span className="shrink-0 text-right text-[11px] font-medium text-success">
      ✔ Complete · {collector.item_count.toLocaleString()} records · {collector.duration_ms.toLocaleString()} ms
    </span>
  );
}

function GovernanceSignal({
  label,
  value,
  detail,
  caution = false,
}: {
  label: string;
  value: string | number | undefined;
  detail: string;
  caution?: boolean;
}) {
  return (
    <div className="px-4 py-3 min-w-0">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className={`text-lg font-semibold mt-1 tabular-nums ${
        value === undefined ? 'text-text-muted' : caution ? 'text-warning' : 'text-text-primary'
      }`}>
        {value ?? '—'}
      </p>
      <p className="text-[10px] text-text-muted">{caution ? '! Review · ' : ''}{detail}</p>
    </div>
  );
}

function PolicyState({
  value,
  cautionValue,
}: {
  value: string | null;
  cautionValue?: string;
}) {
  if (value === null) return <span className="text-text-muted">? Unavailable</span>;
  const caution = cautionValue !== undefined && value === cautionValue;
  return (
    <span className={caution ? 'text-warning' : 'text-text-secondary'}>
      {caution ? '! ' : ''}{formatPolicyLabel(value)}
    </span>
  );
}

function CopilotActivity({
  seat,
}: {
  seat: AssessmentCopilotSeatInventory['seats'][number];
}) {
  if (!seat.lastActivityAt) {
    return <span className="text-text-muted">— No activity reported</span>;
  }
  return <span className="text-success">✔ {formatDate(seat.lastActivityAt)}</span>;
}

function CopilotAssignmentSources({
  sources,
}: {
  sources: AssessmentCopilotSeatInventory['seats'][number]['assignmentSources'];
}) {
  if (sources.length === 0) return <span className="text-text-muted">— Not reported</span>;
  return (
    <span className="space-y-1">
      {sources.map((source, index) => {
        const label = source.team
          ? `${source.organization ?? (source.teamType ? formatPolicyLabel(source.teamType) : 'Enterprise team')} / ${source.team}`
          : source.organization ?? 'Direct enterprise assignment';
        return <span key={`${label}-${index}`} className="block">{label}</span>;
      })}
    </span>
  );
}

function CostCenterResources({
  resources,
}: {
  resources: AssessmentBillingEvidence['costCenters'][number]['resources'];
}) {
  if (resources === null) return <span className="text-text-muted">? Unavailable</span>;
  if (resources.length === 0) return <span className="text-warning">! None assigned</span>;
  return (
    <span className="space-y-1">
      {resources.map(resource => (
        <span key={`${resource.type}-${resource.name}`} className="block">
          {formatPolicyLabel(resource.type)} · {resource.name}
        </span>
      ))}
    </span>
  );
}

function BudgetAlertOwnership({ budget }: { budget: AssessmentBudget }) {
  if (budget.scope === 'user') {
    return <span className="text-text-muted">— User alerts unsupported</span>;
  }
  if (!budget.alertingEnabled) return <span className="text-warning">! Disabled</span>;
  if (budget.alertRecipients.length > 0) {
    return <span className="text-success">✔ {budget.alertRecipients.join(', ')}</span>;
  }
  if (budget.alertRecipientCount > 0) {
    return <span className="text-success">✔ {budget.alertRecipientCount} configured</span>;
  }
  return <span className="text-warning">! No recipient</span>;
}

function metricValue(
  snapshot: AssessmentSnapshot | null,
  key: string
): number | undefined {
  return snapshot?.metrics[key];
}

function formatMetricPair(
  first: number | undefined,
  second: number | undefined
): string | undefined {
  if (first === undefined || second === undefined) return undefined;
  return `${first}/${second}`;
}

function formatPolicyLabel(value: string | null | undefined): string {
  if (!value) return '— Unavailable';
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

function formatBudgetScope(value: string | undefined): string {
  if (!value) return 'Unknown';
  const labels: Record<string, string> = {
    enterprise: 'Enterprise shared',
    organization: 'Organization shared',
    repository: 'Repository shared',
    cost_center: 'Cost-center shared',
    multi_user_customer: 'Enterprise per-user',
    multi_user_cost_center: 'Cost-center per-user',
    user: 'Individual user',
  };
  return labels[value] ?? formatPolicyLabel(value);
}

function formatAiCreditPool(
  costCenter: AssessmentBillingEvidence['costCenters'][number]
): string {
  if (!costCenter.aiCreditPoolEnabled) return '— Disabled';
  if (costCenter.aiCreditPoolTargetAmount === null) return 'Enabled';
  return `${formatCurrency(costCenter.aiCreditPoolCurrentAmount)} / ${formatCurrency(costCenter.aiCreditPoolTargetAmount)}`;
}

function formatBillingPeriod(usage: AssessmentBillingEvidence['usage'] | undefined): string {
  if (!usage) return 'Usage summary unavailable';
  const month = usage.month ? `-${String(usage.month).padStart(2, '0')}` : '';
  const day = usage.day ? `-${String(usage.day).padStart(2, '0')}` : '';
  return `Period ${usage.year}${month}${day}`;
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 4,
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
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