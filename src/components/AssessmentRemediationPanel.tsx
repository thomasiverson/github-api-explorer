'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AssessmentFinding } from '@/lib/assessment';
import {
  createRemediationHandoffUrl,
  getGitHubProduct,
  formatRemediationValue,
  getAssessmentRemediationDefinition,
  getUnresolvedRemediationParameters,
  readRemediationValue,
  resolveRemediationPathValues,
  supportsRemediationProduct,
  type RemediationApiTarget,
} from '@/lib/assessment-remediation';
import type { ExecuteResponse } from '@/lib/types';

interface AssessmentRemediationEnvironment {
  id: string;
  base_url: string;
  enterprise_slug: string;
  org_name: string;
}

interface InspectionResult {
  value: unknown;
  status: number;
}

const MODE_LABELS = {
  executable: 'Preview recipe',
  'api-explorer': 'API Explorer handoff',
  advisory: 'Advisory',
} as const;

export function AssessmentRemediationPanel({
  finding,
  environment,
}: {
  finding: AssessmentFinding;
  environment: AssessmentRemediationEnvironment | null;
}) {
  const definition = getAssessmentRemediationDefinition(finding.ruleKey);
  const resourceOptions = useMemo(
    () => finding.affectedResources.length > 0
      ? finding.affectedResources
      : environment?.org_name
        ? [environment.org_name]
        : [],
    [environment?.org_name, finding.affectedResources]
  );
  const [selectedTargetIndex, setSelectedTargetIndex] = useState(0);
  const [selectedResource, setSelectedResource] = useState(resourceOptions[0] ?? '');
  const [inspection, setInspection] = useState<InspectionResult | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);

  useEffect(() => {
    setSelectedTargetIndex(0);
    setSelectedResource(resourceOptions[0] ?? '');
    setInspection(null);
    setInspectionError(null);
  }, [finding.ruleKey, resourceOptions]);

  if (!definition) {
    return (
      <p className="mt-3 text-xs text-text-muted">
        No structured remediation definition is registered for this historical finding.
      </p>
    );
  }

  const product = environment ? getGitHubProduct(environment.base_url) : null;
  const compatible = environment
    ? supportsRemediationProduct(definition, environment.base_url)
    : false;
  const selectedTarget = definition.apiTargets[selectedTargetIndex];
  const targetContext = {
    enterpriseSlug: environment?.enterprise_slug ?? '',
    defaultOrganization: environment?.org_name ?? '',
    affectedResource: selectedResource,
  };
  const selectedPathValues = selectedTarget
    ? resolveRemediationPathValues(selectedTarget.path, targetContext)
    : {};
  const targetUsesAffectedResource = selectedTarget
    ? ['{org}', '{owner}', '{repo}'].some(parameter => selectedTarget.path.includes(parameter))
    : false;
  const unresolvedParameters = selectedTarget
    ? getUnresolvedRemediationParameters(selectedTarget.path, selectedPathValues)
    : [];
  const explorerUrl = selectedTarget && unresolvedParameters.length === 0
    ? createRemediationHandoffUrl(finding.ruleKey, selectedTarget, targetContext)
    : null;
  const recipe = definition.previewRecipe;
  const inspectionPathValues = recipe
    ? resolveRemediationPathValues(recipe.inspection.path, targetContext)
    : {};
  const unresolvedInspectionParameters = recipe
    ? getUnresolvedRemediationParameters(recipe.inspection.path, inspectionPathValues)
    : [];
  const proposedValue = recipe?.proposedValue;
  const preparedMutationTarget = recipe
    ? findRegisteredTarget(definition.apiTargets, recipe.mutation)
    : null;
  const preparedMutationUrl = recipe && preparedMutationTarget && inspection
    ? createRemediationHandoffUrl(finding.ruleKey, preparedMutationTarget, targetContext)
    : null;

  async function inspectCurrentState() {
    if (!environment || !recipe || unresolvedInspectionParameters.length > 0) return;
    setIsInspecting(true);
    setInspection(null);
    setInspectionError(null);

    try {
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environmentId: environment.id,
          method: recipe.inspection.method,
          path: recipe.inspection.path,
          pathParams: inspectionPathValues,
          queryParams: {},
          headers: {},
          body: null,
          operationId: '',
          category: 'Assessment remediation inspection',
        }),
      });
      const result = await response.json() as ExecuteResponse & { error?: string };
      if (!response.ok || result.status < 200 || result.status >= 300) {
        const detail = result.error
          ?? readErrorMessage(result.body)
          ?? `GitHub returned status ${result.status}.`;
        setInspectionError(detail);
        return;
      }

      const currentValue = readRemediationValue(result.body, recipe.currentValuePath);
      if (currentValue === undefined) {
        setInspectionError(
          `GitHub did not return ${recipe.currentValuePath}; no rollback value can be prepared.`
        );
        return;
      }

      setInspection({ value: currentValue, status: result.status });
    } catch (error: unknown) {
      setInspectionError(error instanceof Error ? error.message : 'Inspection request failed.');
    } finally {
      setIsInspecting(false);
    }
  }

  return (
    <div className="mt-3 rounded-md border border-border bg-canvas px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-border bg-surface px-2 py-0.5 text-[10px] font-semibold text-text-primary">
          {MODE_LABELS[definition.mode]}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-text-muted">
          {definition.risk} risk
        </span>
        <span className="text-[10px] text-text-muted">
          Reviewed {definition.lastReviewedOn}
        </span>
        <span className="text-[10px] text-text-muted">
          {product === 'ghec' ? 'GitHub Enterprise Cloud' : product === 'ghes' ? 'GitHub Enterprise Server' : 'No environment'}
        </span>
      </div>
      <p className="mt-2 text-xs text-text-secondary">{definition.rationale}</p>

      {!compatible && environment && (
        <p role="status" className="mt-3 rounded border border-warning/50 bg-warning/10 px-2.5 py-2 text-xs text-text-primary">
          This API path is not registered for the selected GitHub product. Use the advisory
          steps instead.
        </p>
      )}

      {definition.mode === 'advisory' ? (
        <p className="mt-3 text-xs text-text-muted">
          GitHub does not provide a deterministic API change for this rule. Follow the documented
          settings workflow and verification steps.
        </p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {definition.apiTargets.length > 1 && (
              <label className="text-[11px] text-text-muted">
                API action
                <select
                  value={selectedTargetIndex}
                  onChange={event => {
                    setSelectedTargetIndex(Number(event.target.value));
                    setInspection(null);
                    setInspectionError(null);
                  }}
                  className="mt-1 block w-full rounded-md border border-border bg-surface px-2.5 py-2 text-xs text-text-primary"
                >
                  {definition.apiTargets.map((target, index) => (
                    <option key={`${target.method}:${target.path}`} value={index}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {targetUsesAffectedResource && resourceOptions.length > 1 && (
              <label className="text-[11px] text-text-muted">
                Affected resource
                <select
                  value={selectedResource}
                  onChange={event => {
                    setSelectedResource(event.target.value);
                    setInspection(null);
                    setInspectionError(null);
                  }}
                  className="mt-1 block w-full rounded-md border border-border bg-surface px-2.5 py-2 font-mono text-xs text-text-primary"
                >
                  {resourceOptions.map(resource => (
                    <option key={resource} value={resource}>{resource}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {selectedTarget && (
            <div className="mt-3 rounded border border-border bg-surface px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                Prepared target
              </p>
              <p className="mt-1 break-all font-mono text-[11px] text-text-primary">
                {selectedTarget.method} {selectedTarget.path}
              </p>
              {unresolvedParameters.length > 0 && (
                <p className="mt-1 text-[11px] text-warning">
                  ! Select or enter {unresolvedParameters.join(', ')} in API Explorer.
                </p>
              )}
            </div>
          )}

          {definition.mode === 'api-explorer' && explorerUrl && compatible && (
            <a
              href={explorerUrl}
              className="mt-3 inline-flex rounded-md border border-accent px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Open in API Explorer
            </a>
          )}
        </>
      )}

      {recipe && compatible && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h5 className="text-xs font-semibold text-text-primary">Prepared-change preview</h5>
              <p className="mt-0.5 text-[11px] text-text-muted">
                Inspect the current setting before preparing the write request.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void inspectCurrentState()}
              disabled={isInspecting || unresolvedInspectionParameters.length > 0}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isInspecting ? 'Inspecting...' : 'Inspect current state'}
            </button>
          </div>

          {unresolvedInspectionParameters.length > 0 && (
            <p className="mt-2 text-[11px] text-warning">
              ! Inspection needs {unresolvedInspectionParameters.join(', ')}.
            </p>
          )}
          {inspectionError && (
            <p role="alert" className="mt-2 text-xs text-danger">{inspectionError}</p>
          )}
          {inspection && (
            <div className="mt-3 grid gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-3">
              <RemediationValue
                label="Current"
                value={formatRemediationValue(inspection.value)}
              />
              <RemediationValue
                label="Proposed"
                value={formatRemediationValue(proposedValue)}
              />
              <RemediationValue
                label="Rollback"
                value={`Restore ${formatRemediationValue(inspection.value)}`}
              />
            </div>
          )}
          {preparedMutationUrl && (
            <a
              href={preparedMutationUrl}
              className="mt-3 inline-flex rounded-md bg-accent-emphasis px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Open prepared request in API Explorer
            </a>
          )}
          <p className="mt-2 text-[10px] text-text-muted">
            Preview only. The assessment never applies this change automatically.
          </p>
        </div>
      )}
    </div>
  );
}

function findRegisteredTarget(
  targets: readonly RemediationApiTarget[],
  candidate: RemediationApiTarget
): RemediationApiTarget | null {
  return targets.find(target => (
    target.method === candidate.method
    && target.path === candidate.path
    && target.label === candidate.label
  )) ?? null;
}

function readErrorMessage(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const message = Reflect.get(body, 'message');
  return typeof message === 'string' ? message : null;
}

function RemediationValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 break-all font-mono text-xs text-text-primary">{value}</p>
    </div>
  );
}
