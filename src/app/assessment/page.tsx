'use client';

import { useCallback, useEffect, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { useApp } from '@/components/AppContext';

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
  { key: 'identity', name: 'Identity & access', detail: 'Members and enterprise owner resilience' },
  { key: 'repositories', name: 'Repository governance', detail: 'Visibility, archival state, and repository activity' },
  { key: 'security', name: 'Security posture', detail: 'Secret scanning, code scanning, Dependabot, security configurations' },
  { key: 'actions', name: 'Actions & runners', detail: 'Allowed action sources and commit SHA pinning' },
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
  const securityCollector = snapshot?.collectors.find(collector => collector.collector_key === 'security');
  const actionsCollector = snapshot?.collectors.find(collector => collector.collector_key === 'actions');
  const copilotCollector = snapshot?.collectors.find(collector => collector.collector_key === 'copilot');
  const billingCollector = snapshot?.collectors.find(collector => collector.collector_key === 'billing');
  const domainStatuses: Record<AssessmentDomainKey, string> = {
    identity: baselineEvaluated ? 'Baseline' : 'Not assessed',
    repositories: baselineEvaluated
      ? repositoryCollector?.status === 'partial' ? 'Partial baseline' : 'Baseline'
      : 'Not assessed',
    security: baselineEvaluated
      ? securityCollector?.status === 'completed' ? 'Baseline' : 'Unavailable'
      : 'Not assessed',
    actions: baselineEvaluated
      ? actionsCollector?.status === 'completed' ? 'Baseline' : 'Unavailable'
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
                    return (
                      <div key={collector.collector_key}>
                        <p className="text-xs font-medium text-text-primary capitalize">
                          {collector.collector_key}: {collector.status === 'failed'
                            ? 'collector unavailable'
                            : `${failures.length} inaccessible ${failures.length === 1 ? 'organization' : 'organizations'}`}
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

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="text-xs font-medium text-text-primary text-right">{value}</span>
    </div>
  );
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