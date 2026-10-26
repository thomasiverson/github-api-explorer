import assert from 'node:assert/strict';
import test from 'node:test';
import {
  estimateAssessmentReadiness,
  type AssessmentPacingProfile,
} from '../src/lib/assessment-readiness';
import type {
  AssessmentApiUsage,
  AssessmentRateLimitBucket,
} from '../src/lib/assessment-request-governor';

const coreRateLimit: AssessmentRateLimitBucket = {
  resource: 'core',
  limit: 5000,
  remaining: 4800,
  used: 200,
  reset: 1789167600,
  reserve: 500,
};

const graphqlRateLimit: AssessmentRateLimitBucket = {
  resource: 'graphql',
  limit: 5000,
  remaining: 4900,
  used: 100,
  reset: 1789167600,
  reserve: 500,
};

function previousUsage(
  restRequests: number,
  graphqlRequests: number
): AssessmentApiUsage {
  return {
    restRequests,
    graphqlRequests,
    retryCount: 0,
    throttleCount: 0,
    throttleWaitMs: 0,
    pacingWaitCount: 0,
    pacingWaitMs: 0,
    lastRequestAt: '2026-09-12T00:00:00.000Z',
    rateLimits: {},
  };
}

test('recommends immediate pacing from buffered previous-run usage', () => {
  const readiness = estimateAssessmentReadiness({
    sourceRunId: 'run-1',
    previousUsage: previousUsage(236, 21),
    previousDurationMs: 72_912,
    inventoryMetrics: { organizations: 9, repositories: 21, members: 9 },
    restRateLimit: coreRateLimit,
    graphqlRateLimit,
    checkedAt: '2026-09-12T01:00:00.000Z',
  });

  assert.equal(readiness.recommendedProfile, 'immediate');
  assert.equal(readiness.estimateSource, 'previous-run');
  assert.equal(readiness.sourceRunId, 'run-1');
  assert.equal(readiness.estimatedRestRequests, 272);
  assert.equal(readiness.estimatedGraphqlRequests, 25);
  assert.equal(readiness.estimatedTotalRequests, 297);
  assert.equal(readiness.currentWindowFits, true);
  assert.equal(readiness.windowLoadPercent, 6);
  assert.equal(readiness.estimatedRateWindows, 1);
  assert.equal(readiness.estimatedDurationMs, 84_261);
});

test('falls back to a buffered inventory estimate when request history is unavailable', () => {
  const readiness = estimateAssessmentReadiness({
    sourceRunId: 'legacy-run',
    previousUsage: previousUsage(0, 0),
    previousDurationMs: 60_000,
    inventoryMetrics: {
      organizations: 10,
      repositories: 100,
      humanEnterpriseMembers: 100,
    },
    restRateLimit: coreRateLimit,
    graphqlRateLimit,
  });

  assert.equal(readiness.estimateSource, 'inventory');
  assert.equal(readiness.sourceRunId, null);
  assert.equal(readiness.estimatedRestRequests, 1213);
  assert.equal(readiness.estimatedGraphqlRequests, 33);
  assert.equal(readiness.recommendedProfile, 'measured');
});

test('maps projected rate-window load to each pacing profile', () => {
  const expectedProfiles: Array<[number, AssessmentPacingProfile]> = [
    [900, 'immediate'],
    [2000, 'measured'],
    [5000, 'overnight'],
    [10000, 'extended'],
  ];

  for (const [restRequests, expectedProfile] of expectedProfiles) {
    const readiness = estimateAssessmentReadiness({
      sourceRunId: 'run-1',
      previousUsage: previousUsage(restRequests / 1.15, 1),
      previousDurationMs: 60_000,
      inventoryMetrics: null,
      restRateLimit: coreRateLimit,
      graphqlRateLimit,
    });
    assert.equal(readiness.recommendedProfile, expectedProfile);
  }
});

test('warns when the projection does not fit the currently remaining allowance', () => {
  const readiness = estimateAssessmentReadiness({
    sourceRunId: 'run-1',
    previousUsage: previousUsage(1000, 10),
    previousDurationMs: 60_000,
    inventoryMetrics: null,
    restRateLimit: {
      ...coreRateLimit,
      remaining: 600,
    },
    graphqlRateLimit,
  });

  assert.equal(readiness.currentWindowFits, false);
  assert.match(readiness.rationale, /governor may pause for reset/);
});

test('returns calibration guidance when no estimate source exists', () => {
  const readiness = estimateAssessmentReadiness({
    sourceRunId: null,
    previousUsage: null,
    previousDurationMs: null,
    inventoryMetrics: null,
    restRateLimit: coreRateLimit,
    graphqlRateLimit,
  });

  assert.equal(readiness.recommendedProfile, null);
  assert.equal(readiness.estimatedTotalRequests, null);
  assert.equal(readiness.currentWindowFits, null);
  assert.match(readiness.rationale, /initial assessment/);
});
