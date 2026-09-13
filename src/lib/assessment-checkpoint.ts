export interface StoredAssessmentCheckpoint {
  output: unknown;
  durationMs: number;
  cursor: number;
  totalItems: number;
  completed: boolean;
}

interface AssessmentCheckpointRunnerOptions<CollectorKey extends string> {
  checkpoints: Partial<Record<CollectorKey, StoredAssessmentCheckpoint>>;
  begin: (collectorKey: CollectorKey) => boolean;
  save: (
    collectorKey: CollectorKey,
    output: unknown,
    durationMs: number,
    cursor: number,
    totalItems: number,
    completed: boolean
  ) => boolean;
  now?: () => number;
}

export class AssessmentCheckpointLeaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssessmentCheckpointLeaseError';
  }
}

export function createAssessmentCheckpointRunner<CollectorKey extends string>(
  options: AssessmentCheckpointRunnerOptions<CollectorKey>
) {
  const now = options.now ?? performance.now.bind(performance);

  return async function runCheckpointedCollector<T>(
    collectorKey: CollectorKey,
    collector: () => Promise<T>
  ): Promise<{ value: T; durationMs: number; restored: boolean }> {
    const checkpoint = options.checkpoints[collectorKey];
    if (checkpoint?.completed) {
      return {
        value: checkpoint.output as T,
        durationMs: checkpoint.durationMs,
        restored: true,
      };
    }
    if (!options.begin(collectorKey)) {
      throw new AssessmentCheckpointLeaseError(
        'The assessment execution lease was lost before the next collector started'
      );
    }

    const startedAt = now();
    const value = await collector();
    const durationMs = Math.max(0, Math.round(now() - startedAt));
    if (!options.save(collectorKey, value, durationMs, 0, 0, true)) {
      throw new AssessmentCheckpointLeaseError(
        'The assessment execution lease was lost before the checkpoint was saved'
      );
    }
    options.checkpoints[collectorKey] = {
      output: value,
      durationMs,
      cursor: 0,
      totalItems: 0,
      completed: true,
    };
    return { value, durationMs, restored: false };
  };
}

interface AssessmentBatchCheckpointInput<
  CollectorKey extends string,
  Item,
  Output,
> {
  collectorKey: CollectorKey;
  items: readonly Item[];
  batchSize: number;
  initialValue: Output;
  collectBatch: (items: Item[]) => Promise<Output>;
  merge: (current: Output, batch: Output) => Output;
}

interface AssessmentProgressCheckpointInput<
  CollectorKey extends string,
  State,
  Output,
> {
  collectorKey: CollectorKey;
  initialState: State;
  collect: (
    state: State,
    saveProgress: (
      state: State,
      processedItems: number,
      totalItems?: number
    ) => void
  ) => Promise<Output>;
}

export function createAssessmentProgressCheckpointRunner<CollectorKey extends string>(
  options: AssessmentCheckpointRunnerOptions<CollectorKey>
) {
  const now = options.now ?? performance.now.bind(performance);

  return async function runProgressiveCollector<State, Output>(
    input: AssessmentProgressCheckpointInput<CollectorKey, State, Output>
  ): Promise<{ value: Output; durationMs: number; restored: boolean }> {
    const checkpoint = options.checkpoints[input.collectorKey];
    if (checkpoint?.completed) {
      return {
        value: checkpoint.output as Output,
        durationMs: checkpoint.durationMs,
        restored: true,
      };
    }
    if (!options.begin(input.collectorKey)) {
      throw new AssessmentCheckpointLeaseError(
        'The assessment execution lease was lost before the next collector page started'
      );
    }

    const priorDurationMs = checkpoint?.durationMs ?? 0;
    const startedAt = now();
    let processedItems = checkpoint?.cursor ?? 0;
    let totalItems = checkpoint?.totalItems ?? 0;
    const saveProgress = (
      state: State,
      nextProcessedItems: number,
      nextTotalItems = 0
    ) => {
      const durationMs = priorDurationMs + Math.max(0, Math.round(now() - startedAt));
      if (!options.save(
        input.collectorKey,
        state,
        durationMs,
        nextProcessedItems,
        nextTotalItems,
        false
      )) {
        throw new AssessmentCheckpointLeaseError(
          'The assessment execution lease was lost before the page checkpoint was saved'
        );
      }
      processedItems = nextProcessedItems;
      totalItems = nextTotalItems;
      options.checkpoints[input.collectorKey] = {
        output: state,
        durationMs,
        cursor: processedItems,
        totalItems,
        completed: false,
      };
    };

    const value = await input.collect(
      checkpoint ? checkpoint.output as State : input.initialState,
      saveProgress
    );
    const durationMs = priorDurationMs + Math.max(0, Math.round(now() - startedAt));
    if (!options.save(
      input.collectorKey,
      value,
      durationMs,
      processedItems,
      totalItems,
      true
    )) {
      throw new AssessmentCheckpointLeaseError(
        'The assessment execution lease was lost before the page checkpoint was saved'
      );
    }
    options.checkpoints[input.collectorKey] = {
      output: value,
      durationMs,
      cursor: processedItems,
      totalItems,
      completed: true,
    };
    return { value, durationMs, restored: false };
  };
}

export function createAssessmentBatchCheckpointRunner<CollectorKey extends string>(
  options: AssessmentCheckpointRunnerOptions<CollectorKey>
) {
  const now = options.now ?? performance.now.bind(performance);

  return async function runBatchedCollector<Item, Output>(
    input: AssessmentBatchCheckpointInput<CollectorKey, Item, Output>
  ): Promise<{ value: Output; durationMs: number; restored: boolean }> {
    const checkpoint = options.checkpoints[input.collectorKey];
    if (checkpoint?.completed) {
      return {
        value: checkpoint.output as Output,
        durationMs: checkpoint.durationMs,
        restored: true,
      };
    }
    const batchSize = Math.max(1, Math.trunc(input.batchSize));
    const initialCursor = checkpoint?.cursor ?? 0;
    if (initialCursor < 0 || initialCursor > input.items.length) {
      throw new Error(
        `Assessment checkpoint cursor ${initialCursor} is invalid for ${input.collectorKey}`
      );
    }
    if (!options.begin(input.collectorKey)) {
      throw new AssessmentCheckpointLeaseError(
        'The assessment execution lease was lost before the next collector batch started'
      );
    }

    let value = checkpoint ? checkpoint.output as Output : input.initialValue;
    let durationMs = checkpoint?.durationMs ?? 0;
    let cursor = initialCursor;
    if (cursor === input.items.length) {
      if (!options.save(
        input.collectorKey,
        value,
        durationMs,
        cursor,
        input.items.length,
        true
      )) {
        throw new AssessmentCheckpointLeaseError(
          'The assessment execution lease was lost before the batch checkpoint was saved'
        );
      }
      options.checkpoints[input.collectorKey] = {
        output: value,
        durationMs,
        cursor,
        totalItems: input.items.length,
        completed: true,
      };
      return { value, durationMs, restored: false };
    }

    while (cursor < input.items.length) {
      const nextCursor = Math.min(cursor + batchSize, input.items.length);
      const startedAt = now();
      const batch = await input.collectBatch(input.items.slice(cursor, nextCursor));
      durationMs += Math.max(0, Math.round(now() - startedAt));
      value = input.merge(value, batch);
      cursor = nextCursor;
      const completed = cursor === input.items.length;
      if (!options.save(
        input.collectorKey,
        value,
        durationMs,
        cursor,
        input.items.length,
        completed
      )) {
        throw new AssessmentCheckpointLeaseError(
          'The assessment execution lease was lost before the batch checkpoint was saved'
        );
      }
      options.checkpoints[input.collectorKey] = {
        output: value,
        durationMs,
        cursor,
        totalItems: input.items.length,
        completed,
      };
    }

    return { value, durationMs, restored: false };
  };
}
