import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AssessmentCheckpointLeaseError,
  createAssessmentBatchCheckpointRunner,
  createAssessmentCheckpointRunner,
  createAssessmentProgressCheckpointRunner,
} from '../src/lib/assessment-checkpoint';

test('restores a completed collector without executing or rewriting it', async () => {
  let beginCount = 0;
  let saveCount = 0;
  let collectorCount = 0;
  const runCollector = createAssessmentCheckpointRunner({
    checkpoints: {
      organizations: {
        output: [{ login: 'acme' }],
        durationMs: 25,
        cursor: 0,
        totalItems: 0,
        completed: true,
      },
    },
    begin: () => {
      beginCount += 1;
      return true;
    },
    save: () => {
      saveCount += 1;
      return true;
    },
  });

  const result = await runCollector('organizations', async () => {
    collectorCount += 1;
    return [];
  });

  assert.deepEqual(result, {
    value: [{ login: 'acme' }],
    durationMs: 25,
    restored: true,
  });
  assert.equal(beginCount, 0);
  assert.equal(saveCount, 0);
  assert.equal(collectorCount, 0);
});

test('persists a newly completed collector and reuses it in the same execution', async () => {
  const checkpoints: Record<string, {
    output: unknown;
    durationMs: number;
    cursor: number;
    totalItems: number;
    completed: boolean;
  }> = {};
  const saved: Array<{ key: string; output: unknown; durationMs: number }> = [];
  const times = [100, 135];
  const runCollector = createAssessmentCheckpointRunner({
    checkpoints,
    begin: () => true,
    save: (key, output, durationMs) => {
      saved.push({ key, output, durationMs });
      return true;
    },
    now: () => times.shift() ?? 135,
  });

  const first = await runCollector('identity', async () => ({ members: 10 }));
  const second = await runCollector('identity', async () => {
    assert.fail('The saved collector must not execute twice');
  });

  assert.deepEqual(first, {
    value: { members: 10 },
    durationMs: 35,
    restored: false,
  });
  assert.deepEqual(second, {
    value: { members: 10 },
    durationMs: 35,
    restored: true,
  });
  assert.deepEqual(saved, [{
    key: 'identity',
    output: { members: 10 },
    durationMs: 35,
  }]);
});

test('stops before collection when the execution lease is unavailable', async () => {
  const runCollector = createAssessmentCheckpointRunner({
    checkpoints: {},
    begin: () => false,
    save: () => true,
  });

  await assert.rejects(
    runCollector('repositories', async () => []),
    (error: unknown) => (
      error instanceof AssessmentCheckpointLeaseError
      && /before the next collector started/.test(error.message)
    )
  );
});

test('resumes an interrupted collector at the first unfinished batch', async () => {
  const checkpoints: Record<string, {
    output: unknown;
    durationMs: number;
    cursor: number;
    totalItems: number;
    completed: boolean;
  }> = {};
  const processedBatches: number[][] = [];
  let failSecondBatch = true;
  const createRunner = () => createAssessmentBatchCheckpointRunner({
    checkpoints,
    begin: () => true,
    save: (key, output, durationMs, cursor, totalItems, completed) => {
      checkpoints[key] = { output, durationMs, cursor, totalItems, completed };
      return true;
    },
    now: (() => {
      let current = 0;
      return () => {
        current += 10;
        return current;
      };
    })(),
  });
  const run = (runner: ReturnType<typeof createRunner>) => runner({
    collectorKey: 'repositorySecurity',
    items: [1, 2, 3, 4, 5],
    batchSize: 2,
    initialValue: [] as number[],
    collectBatch: async items => {
      processedBatches.push(items);
      if (failSecondBatch && items[0] === 3) {
        throw new Error('Simulated interruption');
      }
      return items;
    },
    merge: (current, batch) => [...current, ...batch],
  });

  await assert.rejects(run(createRunner()), /Simulated interruption/);
  assert.deepEqual(checkpoints.repositorySecurity, {
    output: [1, 2],
    durationMs: 10,
    cursor: 2,
    totalItems: 5,
    completed: false,
  });

  failSecondBatch = false;
  const resumed = await run(createRunner());
  assert.deepEqual(resumed.value, [1, 2, 3, 4, 5]);
  assert.equal(resumed.durationMs, 30);
  assert.equal(checkpoints.repositorySecurity.cursor, 5);
  assert.equal(checkpoints.repositorySecurity.completed, true);
  assert.deepEqual(processedBatches, [[1, 2], [3, 4], [3, 4], [5]]);
});

test('resumes a progressive collector from its last durable page state', async () => {
  interface ProgressState {
    nextPage: number;
    values: number[];
  }
  const checkpoints: Record<string, {
    output: unknown;
    durationMs: number;
    cursor: number;
    totalItems: number;
    completed: boolean;
  }> = {};
  const requestedPages: number[] = [];
  let interruptAfterFirstPage = true;
  let clock = 0;
  const createRunner = () => createAssessmentProgressCheckpointRunner({
    checkpoints,
    begin: () => true,
    save: (key, output, durationMs, cursor, totalItems, completed) => {
      checkpoints[key] = { output, durationMs, cursor, totalItems, completed };
      return true;
    },
    now: () => {
      clock += 10;
      return clock;
    },
  });
  const run = (runner: ReturnType<typeof createRunner>) => runner<ProgressState, number[]>({
    collectorKey: 'identity',
    initialState: { nextPage: 1, values: [] },
    collect: async (initialState, saveProgress) => {
      const state = structuredClone(initialState);
      while (state.nextPage <= 3) {
        requestedPages.push(state.nextPage);
        state.values.push(state.nextPage);
        state.nextPage += 1;
        saveProgress(state, state.values.length, 3);
        if (interruptAfterFirstPage && state.nextPage === 2) {
          throw new Error('Simulated page interruption');
        }
      }
      return state.values;
    },
  });

  await assert.rejects(run(createRunner()), /Simulated page interruption/);
  assert.deepEqual(checkpoints.identity, {
    output: { nextPage: 2, values: [1] },
    durationMs: 10,
    cursor: 1,
    totalItems: 3,
    completed: false,
  });

  interruptAfterFirstPage = false;
  const resumed = await run(createRunner());
  assert.deepEqual(resumed.value, [1, 2, 3]);
  assert.equal(resumed.durationMs, 40);
  assert.deepEqual(requestedPages, [1, 2, 3]);
  assert.equal(checkpoints.identity.completed, true);
});
