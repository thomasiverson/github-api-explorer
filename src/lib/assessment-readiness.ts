import type {
  AssessmentApiUsage,
  AssessmentRateLimitBucket,
} from './assessment-request-governor';

export type AssessmentPacingProfile =
  | 'immediate'
  | 'measured'
  | 'overnight'
  | 'extended';

export const ASSESSMENT_PACING_INTERVAL_MS: Record<
  AssessmentPacingProfile,
  number
> = {
  immediate: 0,
  measured: 1_500,
  overnight: 5_000,
  extended: 15_000,
};

export function isAssessmentPacingProfile(
  value: unknown
): value is AssessmentPacingProfile {
  return typeof value === 'string'
    && value in ASSESSMENT_PACING_INTERVAL_MS;
}

export function estimateAssessmentPacedDuration(
  requestCount: number,
  profile: AssessmentPacingProfile,
  observedDurationMs = requestCount * 300
): number {
  const pacedDurationMs = Math.max(0, requestCount - 1)
    * ASSESSMENT_PACING_INTERVAL_MS[profile];
  return Math.ceil(Math.max(observedDurationMs, pacedDurationMs));
}

export type AssessmentEstimateSource =
  | 'previous-run'
  | 'inventory'
  | 'unavailable';

export interface AssessmentReadiness {
  recommendedProfile: AssessmentPacingProfile | null;
  estimateSource: AssessmentEstimateSource;
  sourceRunId: string | null;
  estimatedRestRequests: number | null;
  estimatedGraphqlRequests: number | null;
  estimatedTotalRequests: number | null;
  estimatedDurationMs: number | null;
  estimatedRateWindows: number | null;
  windowLoadPercent: number | null;
  currentWindowFits: boolean | null;
  restRateLimit: AssessmentRateLimitBucket | null;
  graphqlRateLimit: AssessmentRateLimitBucket | null;
  rationale: string;
  checkedAt: string;
}

interface AssessmentReadinessInput {
  sourceRunId: string | null;
  previousUsage: AssessmentApiUsage | null;
  previousDurationMs: number | null;
  inventoryMetrics: Record<string, number> | null;
  restRateLimit: AssessmentRateLimitBucket | null;
  graphqlRateLimit: AssessmentRateLimitBucket | null;
  checkedAt?: string;
}

interface RequestEstimate {
  source: AssessmentEstimateSource;
  restRequests: number | null;
  graphqlRequests: number | null;
}

const PREVIOUS_RUN_BUFFER = 1.15;
const INVENTORY_ESTIMATE_BUFFER = 1.25;

export function estimateAssessmentReadiness(
  input: AssessmentReadinessInput
): AssessmentReadiness {
  const estimate = estimateRequestVolume(input.previousUsage, input.inventoryMetrics);
  const estimatedTotalRequests = estimate.restRequests !== null
    && estimate.graphqlRequests !== null
    ? estimate.restRequests + estimate.graphqlRequests
    : null;
  const restWindowCapacity = readWindowCapacity(input.restRateLimit);
  const graphqlWindowCapacity = readWindowCapacity(input.graphqlRateLimit);
  const windowLoad = maximumDefined([
    calculateLoad(estimate.restRequests, restWindowCapacity),
    calculateLoad(estimate.graphqlRequests, graphqlWindowCapacity),
  ]);
  const recommendedProfile = windowLoad === null ? null : classifyPacingProfile(windowLoad);
  const currentWindowFits = calculateCurrentWindowFit(
    estimate,
    input.restRateLimit,
    input.graphqlRateLimit
  );
  const estimatedDurationMs = estimateDuration(
    estimate,
    input.previousUsage,
    input.previousDurationMs,
    recommendedProfile
  );

  return {
    recommendedProfile,
    estimateSource: estimate.source,
    sourceRunId: estimate.source === 'previous-run' ? input.sourceRunId : null,
    estimatedRestRequests: estimate.restRequests,
    estimatedGraphqlRequests: estimate.graphqlRequests,
    estimatedTotalRequests,
    estimatedDurationMs,
    estimatedRateWindows: windowLoad === null ? null : Math.max(1, Math.ceil(windowLoad)),
    windowLoadPercent: windowLoad === null ? null : Math.max(1, Math.round(windowLoad * 100)),
    currentWindowFits,
    restRateLimit: input.restRateLimit,
    graphqlRateLimit: input.graphqlRateLimit,
    rationale: describeRecommendation(recommendedProfile, currentWindowFits, estimate.source),
    checkedAt: input.checkedAt ?? new Date().toISOString(),
  };
}

function estimateRequestVolume(
  previousUsage: AssessmentApiUsage | null,
  metrics: Record<string, number> | null
): RequestEstimate {
  const previousRequestCount = previousUsage
    ? previousUsage.restRequests + previousUsage.graphqlRequests
    : 0;
  if (previousUsage && previousRequestCount > 0) {
    return {
      source: 'previous-run',
      restRequests: Math.ceil(previousUsage.restRequests * PREVIOUS_RUN_BUFFER),
      graphqlRequests: Math.ceil(previousUsage.graphqlRequests * PREVIOUS_RUN_BUFFER),
    };
  }
  if (!metrics) {
    return {
      source: 'unavailable',
      restRequests: null,
      graphqlRequests: null,
    };
  }

  const organizations = readMetric(metrics, 'organizations');
  const repositories = readMetric(metrics, 'repositories');
  const members = metrics.humanEnterpriseMembers === undefined
    ? readMetric(metrics, 'members')
    : readMetric(metrics, 'humanEnterpriseMembers');
  const baseRestRequests = 5 * organizations + 8 * repositories + members + 20;
  const baseGraphqlRequests = 4
    + 2 * organizations
    + Math.max(1, Math.ceil(repositories / 100))
    + Math.max(1, Math.ceil(members / 100));
  return {
    source: 'inventory',
    restRequests: Math.ceil(baseRestRequests * INVENTORY_ESTIMATE_BUFFER),
    graphqlRequests: Math.ceil(baseGraphqlRequests * INVENTORY_ESTIMATE_BUFFER),
  };
}

function readMetric(metrics: Record<string, number>, key: string): number {
  const value = metrics[key];
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function readWindowCapacity(rateLimit: AssessmentRateLimitBucket | null): number | null {
  if (!rateLimit) return null;
  return Math.max(0, rateLimit.limit - rateLimit.reserve);
}

function calculateLoad(
  requestCount: number | null,
  capacity: number | null
): number | null {
  if (requestCount === null || capacity === null || capacity === 0) return null;
  return requestCount / capacity;
}

function maximumDefined(values: Array<number | null>): number | null {
  const defined = values.filter((value): value is number => value !== null);
  return defined.length > 0 ? Math.max(...defined) : null;
}

function classifyPacingProfile(windowLoad: number): AssessmentPacingProfile {
  if (windowLoad <= 0.25) return 'immediate';
  if (windowLoad <= 0.75) return 'measured';
  if (windowLoad <= 2) return 'overnight';
  return 'extended';
}

function calculateCurrentWindowFit(
  estimate: RequestEstimate,
  restRateLimit: AssessmentRateLimitBucket | null,
  graphqlRateLimit: AssessmentRateLimitBucket | null
): boolean | null {
  const fits: boolean[] = [];
  if (estimate.restRequests !== null && restRateLimit) {
    fits.push(estimate.restRequests <= Math.max(
      0,
      restRateLimit.remaining - restRateLimit.reserve
    ));
  }
  if (estimate.graphqlRequests !== null && graphqlRateLimit) {
    fits.push(estimate.graphqlRequests <= Math.max(
      0,
      graphqlRateLimit.remaining - graphqlRateLimit.reserve
    ));
  }
  return fits.length > 0 ? fits.every(Boolean) : null;
}

function estimateDuration(
  estimate: RequestEstimate,
  previousUsage: AssessmentApiUsage | null,
  previousDurationMs: number | null,
  profile: AssessmentPacingProfile | null
): number | null {
  if (estimate.restRequests === null || estimate.graphqlRequests === null) return null;
  const estimatedTotal = estimate.restRequests + estimate.graphqlRequests;
  const previousTotal = previousUsage
    ? previousUsage.restRequests + previousUsage.graphqlRequests
    : 0;
  const observedDuration = previousDurationMs !== null
    && previousDurationMs > 0
    && previousTotal > 0
    ? previousDurationMs * (estimatedTotal / previousTotal)
    : estimatedTotal * 300;
  if (!profile || profile === 'immediate') {
    return Math.ceil(observedDuration);
  }
  return estimateAssessmentPacedDuration(
    estimatedTotal,
    profile,
    observedDuration
  );
}

function describeRecommendation(
  profile: AssessmentPacingProfile | null,
  currentWindowFits: boolean | null,
  source: AssessmentEstimateSource
): string {
  if (!profile) {
    return 'Run an initial assessment to calibrate request volume for this environment.';
  }
  const sourceText = source === 'previous-run'
    ? 'The estimate includes a 15% buffer over the latest completed run.'
    : 'The estimate includes a 25% buffer over the stored inventory model.';
  const profileText = profile === 'immediate'
    ? 'The projected load is below 25% of one usable rate window.'
    : profile === 'measured'
      ? 'The projected load uses 25–75% of one usable rate window.'
      : profile === 'overnight'
        ? 'The projected load may span up to two usable rate windows.'
        : 'The projected load exceeds two usable rate windows.';
  const fitText = currentWindowFits === false
    ? ' Current allowance is lower than the projection, so the governor may pause for reset.'
    : '';
  return `${profileText} ${sourceText}${fitText}`;
}
