import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AssessmentRateLimitError,
  AssessmentRequestGovernor,
  isFatalAssessmentRequestError,
} from '../src/lib/assessment-request-governor';
import { collectRepositorySecurity } from '../src/lib/assessment';
import { AssessmentRunControlError } from '../src/lib/assessment-run-control';

test('tracks REST requests and rate-limit response headers', async () => {
  const governor = new AssessmentRequestGovernor();

  const response = await governor.execute('rest', async () => ({
    status: 200,
    data: { ok: true },
    headers: {
      'x-ratelimit-limit': '5000',
      'x-ratelimit-remaining': '4999',
      'x-ratelimit-used': '1',
      'x-ratelimit-reset': '2000',
      'x-ratelimit-resource': 'core',
    },
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(governor.snapshot(), {
    restRequests: 1,
    graphqlRequests: 0,
    retryCount: 0,
    throttleCount: 0,
    throttleWaitMs: 0,
    pacingWaitCount: 0,
    pacingWaitMs: 0,
    lastRequestAt: governor.snapshot().lastRequestAt,
    rateLimits: {
      core: {
        resource: 'core',
        limit: 5000,
        remaining: 4999,
        used: 1,
        reset: 2000,
        reserve: 500,
      },
    },
  });
  assert.match(governor.snapshot().lastRequestAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
});

test('continues persisted request accounting after a resumed run', async () => {
  const governor = new AssessmentRequestGovernor({
    initialUsage: {
      restRequests: 47,
      graphqlRequests: 6,
      retryCount: 2,
      throttleCount: 1,
      throttleWaitMs: 2_000,
      pacingWaitCount: 3,
      pacingWaitMs: 4_500,
      lastRequestAt: '2026-09-12T12:00:00.000Z',
      rateLimits: {
        core: {
          resource: 'core',
          limit: 5000,
          remaining: 4953,
          used: 47,
          reset: 2000,
          reserve: 500,
        },
      },
    },
  });

  await governor.execute('rest', async () => ({
    headers: {
      'x-ratelimit-limit': '5000',
      'x-ratelimit-remaining': '4952',
      'x-ratelimit-used': '48',
      'x-ratelimit-reset': '2000',
      'x-ratelimit-resource': 'core',
    },
  }));

  const usage = governor.snapshot();
  assert.equal(usage.restRequests, 48);
  assert.equal(usage.graphqlRequests, 6);
  assert.equal(usage.retryCount, 2);
  assert.equal(usage.throttleCount, 1);
  assert.equal(usage.pacingWaitCount, 3);
  assert.equal(usage.pacingWaitMs, 4_500);
});

test('enforces intentional pacing without reporting a throttle wait', async () => {
  let now = Date.parse('2026-09-12T12:00:00.000Z');
  const waits: number[] = [];
  const governor = new AssessmentRequestGovernor({
    minimumRequestIntervalMs: 1_500,
    now: () => now,
    sleep: async milliseconds => {
      waits.push(milliseconds);
      now += milliseconds;
    },
  });

  await governor.execute('rest', async () => ({ headers: {} }));
  await governor.execute('rest', async () => ({ headers: {} }));

  assert.deepEqual(waits, [1_500]);
  assert.equal(governor.snapshot().pacingWaitCount, 1);
  assert.equal(governor.snapshot().pacingWaitMs, 1_500);
  assert.equal(governor.snapshot().throttleCount, 0);
  assert.equal(governor.snapshot().throttleWaitMs, 0);
});

test('interrupts a pacing wait before another request is sent', async () => {
  let now = Date.parse('2026-09-12T12:00:00.000Z');
  let shouldPause = false;
  let requests = 0;
  const waits: number[] = [];
  const governor = new AssessmentRequestGovernor({
    minimumRequestIntervalMs: 5_000,
    now: () => now,
    beforeRequest: () => {
      if (shouldPause) throw new AssessmentRunControlError('pause');
    },
    sleep: async milliseconds => {
      waits.push(milliseconds);
      now += milliseconds;
      shouldPause = true;
    },
  });

  await governor.execute('rest', async () => {
    requests += 1;
    return { headers: {} };
  });
  await assert.rejects(
    governor.execute('rest', async () => {
      requests += 1;
      return { headers: {} };
    }),
    error => error instanceof AssessmentRunControlError && error.reason === 'pause'
  );

  assert.equal(requests, 1);
  assert.deepEqual(waits, [1_000]);
  assert.equal(governor.snapshot().pacingWaitCount, 1);
  assert.equal(governor.snapshot().pacingWaitMs, 1_000);
  assert.equal(governor.snapshot().throttleWaitMs, 0);
});

test('waits until reset before spending the primary safety reserve', async () => {
  let now = 1_000_000;
  const waits: number[] = [];
  const governor = new AssessmentRequestGovernor({
    now: () => now,
    random: () => 0,
    sleep: async milliseconds => {
      waits.push(milliseconds);
      now += milliseconds;
    },
  });

  await governor.execute('rest', async () => ({
    headers: {
      'x-ratelimit-limit': '5000',
      'x-ratelimit-remaining': '500',
      'x-ratelimit-reset': '1005',
      'x-ratelimit-resource': 'core',
    },
  }));
  await governor.execute('rest', async () => ({
    headers: {
      'x-ratelimit-limit': '5000',
      'x-ratelimit-remaining': '4999',
      'x-ratelimit-reset': '4605',
      'x-ratelimit-resource': 'core',
    },
  }));

  assert.deepEqual(waits, [6_000]);
  assert.equal(governor.snapshot().restRequests, 2);
  assert.equal(governor.snapshot().throttleCount, 1);
  assert.equal(governor.snapshot().throttleWaitMs, 6_000);
});

test('honors retry-after and counts rate-limit retries', async () => {
  const waits: number[] = [];
  let attempts = 0;
  const governor = new AssessmentRequestGovernor({
    random: () => 0,
    sleep: async milliseconds => {
      waits.push(milliseconds);
    },
  });

  const response = await governor.execute('rest', async () => {
    attempts += 1;
    if (attempts === 1) {
      throw {
        status: 429,
        message: 'You have exceeded a secondary rate limit',
        response: {
          headers: {
            'retry-after': '2',
            'x-ratelimit-limit': '5000',
            'x-ratelimit-remaining': '4500',
            'x-ratelimit-reset': '2000',
          },
        },
      };
    }
    return { headers: {}, data: 'ok' };
  });

  assert.equal(response.data, 'ok');
  assert.deepEqual(waits, [2_000]);
  assert.equal(governor.snapshot().restRequests, 2);
  assert.equal(governor.snapshot().retryCount, 1);
  assert.equal(governor.snapshot().throttleCount, 1);
});

test('backs off GraphQL secondary-limit errors returned with HTTP 200', async () => {
  const waits: number[] = [];
  let attempts = 0;
  const governor = new AssessmentRequestGovernor({
    random: () => 0,
    sleep: async milliseconds => {
      waits.push(milliseconds);
    },
  });

  const result = await governor.executeGraphql(async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error('You have exceeded a secondary rate limit');
    }
    return { enterprise: { slug: 'acme' } };
  });

  assert.deepEqual(result, { enterprise: { slug: 'acme' } });
  assert.deepEqual(waits, [60_000]);
  assert.equal(governor.snapshot().retryCount, 1);
});

test('does not retry ordinary forbidden responses', async () => {
  let attempts = 0;
  const governor = new AssessmentRequestGovernor({
    sleep: async () => {
      assert.fail('Ordinary forbidden responses must not trigger a wait');
    },
  });
  const forbidden = {
    status: 403,
    message: 'Resource not accessible by integration',
    response: { headers: {} },
  };

  await assert.rejects(
    governor.execute('rest', async () => {
      attempts += 1;
      throw forbidden;
    }),
    error => error === forbidden
  );
  assert.equal(attempts, 1);
  assert.equal(governor.snapshot().retryCount, 0);
});

test('raises a fatal assessment error after bounded rate-limit retries', async () => {
  let attempts = 0;
  const governor = new AssessmentRequestGovernor({
    maxRetries: 1,
    random: () => 0,
    sleep: async () => undefined,
  });

  await assert.rejects(
    governor.execute('rest', async () => {
      attempts += 1;
      throw {
        status: 429,
        message: 'Rate limit exceeded',
        response: { headers: { 'retry-after': '1' } },
      };
    }),
    error => {
      assert.equal(isFatalAssessmentRequestError(error), true);
      assert.match(
        error instanceof Error ? error.message : '',
        /after 1 retries/
      );
      return true;
    }
  );
  assert.equal(attempts, 2);
  assert.equal(governor.snapshot().restRequests, 2);
  assert.equal(governor.snapshot().retryCount, 1);
});

test('fatal rate-limit exhaustion aborts resource collectors instead of becoming partial evidence', async () => {
  const fatalError = new AssessmentRateLimitError(
    'GitHub continued to rate limit the assessment',
    429
  );
  const fail = async () => {
    throw fatalError;
  };

  await assert.rejects(
    collectRepositorySecurity({
      getRepository: fail,
      getCodeScanningDefaultSetup: fail,
      checkDependabotAlerts: fail,
      getConfiguration: fail,
    }, [{
      githubId: 1,
      nodeId: 'R_1',
      organizationLogin: 'acme',
      nameWithOwner: 'acme/repository',
      visibility: 'PRIVATE',
      isArchived: false,
      isFork: false,
      updatedAt: '2026-09-11T00:00:00Z',
    }]),
    error => error === fatalError
  );
});
