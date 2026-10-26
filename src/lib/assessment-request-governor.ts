export type AssessmentRequestKind = 'rest' | 'graphql';

export interface AssessmentRateLimitBucket {
  resource: string;
  limit: number;
  remaining: number;
  used: number;
  reset: number;
  reserve: number;
}

export interface AssessmentApiUsage {
  restRequests: number;
  graphqlRequests: number;
  retryCount: number;
  throttleCount: number;
  throttleWaitMs: number;
  pacingWaitCount: number;
  pacingWaitMs: number;
  lastRequestAt: string | null;
  rateLimits: Record<string, AssessmentRateLimitBucket>;
}

export type AssessmentUsageUpdateReason = 'request' | 'retry' | 'wait' | 'pace';

interface GitHubResponse {
  headers: Record<string, string | number | undefined>;
}

interface AssessmentRequestGovernorOptions {
  initialUsage?: AssessmentApiUsage;
  minimumReserve?: number;
  reserveRatio?: number;
  maxRetries?: number;
  now?: () => number;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  minimumRequestIntervalMs?: number;
  beforeRequest?: () => void | Promise<void>;
  onUpdate?: (
    usage: AssessmentApiUsage,
    reason: AssessmentUsageUpdateReason
  ) => void;
}

const DEFAULT_MINIMUM_RESERVE = 500;
const DEFAULT_RESERVE_RATIO = 0.1;
const DEFAULT_MAX_RETRIES = 3;
const RESET_BOUNDARY_BUFFER_MS = 1_000;
const SECONDARY_BACKOFF_MS = 60_000;
const MAX_SECONDARY_BACKOFF_MS = 15 * 60_000;
const CONTROL_CHECK_INTERVAL_MS = 1_000;

export function calculateAssessmentRateLimitReserve(
  limit: number,
  minimumReserve = DEFAULT_MINIMUM_RESERVE,
  reserveRatio = DEFAULT_RESERVE_RATIO
): number {
  return Math.min(
    Math.max(0, limit - 1),
    Math.max(minimumReserve, Math.ceil(limit * reserveRatio))
  );
}

export class AssessmentRateLimitError extends Error {
  readonly abortAssessment = true;
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AssessmentRateLimitError';
    this.status = status;
  }
}

export function isFatalAssessmentRequestError(
  error: unknown
): error is AssessmentRateLimitError {
  return error instanceof AssessmentRateLimitError
    || (
      !!error
      && typeof error === 'object'
      && 'abortAssessment' in error
      && (error as { abortAssessment?: unknown }).abortAssessment === true
    );
}

export class AssessmentRequestGovernor {
  private readonly minimumReserve: number;
  private readonly reserveRatio: number;
  private readonly maxRetries: number;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly onUpdate?: AssessmentRequestGovernorOptions['onUpdate'];
  private readonly minimumRequestIntervalMs: number;
  private readonly beforeRequest?: AssessmentRequestGovernorOptions['beforeRequest'];
  private readonly latestResourceByKind: Partial<Record<AssessmentRequestKind, string>> = {};
  private readonly usage: AssessmentApiUsage;

  constructor(options: AssessmentRequestGovernorOptions = {}) {
    this.minimumReserve = options.minimumReserve ?? DEFAULT_MINIMUM_RESERVE;
    this.reserveRatio = options.reserveRatio ?? DEFAULT_RESERVE_RATIO;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? (milliseconds => new Promise(
      resolve => setTimeout(resolve, milliseconds)
    ));
    this.minimumRequestIntervalMs = Math.max(
      0,
      Math.trunc(options.minimumRequestIntervalMs ?? 0)
    );
    this.beforeRequest = options.beforeRequest;
    this.onUpdate = options.onUpdate;
    this.usage = options.initialUsage
      ? {
          ...options.initialUsage,
          pacingWaitCount: options.initialUsage.pacingWaitCount ?? 0,
          pacingWaitMs: options.initialUsage.pacingWaitMs ?? 0,
          rateLimits: Object.fromEntries(
            Object.entries(options.initialUsage.rateLimits).map(([resource, bucket]) => [
              resource,
              { ...bucket },
            ])
          ),
        }
      : {
          restRequests: 0,
          graphqlRequests: 0,
          retryCount: 0,
          throttleCount: 0,
          throttleWaitMs: 0,
          pacingWaitCount: 0,
          pacingWaitMs: 0,
          lastRequestAt: null,
          rateLimits: {},
        };
    for (const [resource, bucket] of Object.entries(this.usage.rateLimits)) {
      this.latestResourceByKind[bucket.resource === 'graphql' ? 'graphql' : 'rest'] = resource;
    }
  }

  snapshot(): AssessmentApiUsage {
    return {
      ...this.usage,
      rateLimits: Object.fromEntries(
        Object.entries(this.usage.rateLimits).map(([resource, bucket]) => [
          resource,
          { ...bucket },
        ])
      ),
    };
  }

  async execute<T extends GitHubResponse>(
    kind: AssessmentRequestKind,
    request: () => Promise<T>
  ): Promise<T> {
    await this.beforeRequest?.();
    await this.waitForPacing();
    await this.waitForPrimaryCapacity(kind);

    for (let attempt = 0; ; attempt += 1) {
      await this.beforeRequest?.();
      this.recordRequest(kind);
      try {
        const response = await request();
        this.captureRateLimit(kind, response.headers);
        this.emit('request');
        return response;
      } catch (error) {
        this.captureRateLimit(kind, readErrorHeaders(error));
        this.emit('request');
        if (!isRateLimitError(error)) throw error;
        if (attempt >= this.maxRetries) {
          throw createExhaustedError(error, this.maxRetries);
        }
        await this.recordRetryAndWait(calculateRetryWaitMs(
          error,
          attempt,
          this.now(),
          this.random()
        ));
      }
    }
  }

  async executeGraphql<T>(request: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await request();
      } catch (error) {
        if (isFatalAssessmentRequestError(error) || !isRateLimitError(error)) throw error;
        this.captureRateLimit('graphql', readErrorHeaders(error));
        if (attempt >= this.maxRetries) {
          throw createExhaustedError(error, this.maxRetries);
        }
        await this.recordRetryAndWait(calculateRetryWaitMs(
          error,
          attempt,
          this.now(),
          this.random()
        ));
      }
    }
  }

  private recordRequest(kind: AssessmentRequestKind) {
    if (kind === 'graphql') {
      this.usage.graphqlRequests += 1;
    } else {
      this.usage.restRequests += 1;
    }
    this.usage.lastRequestAt = new Date(this.now()).toISOString();
  }

  private captureRateLimit(
    kind: AssessmentRequestKind,
    headers: Record<string, string | number | undefined> | null
  ) {
    if (!headers) return;
    const limit = readIntegerHeader(headers, 'x-ratelimit-limit');
    const remaining = readIntegerHeader(headers, 'x-ratelimit-remaining');
    const reset = readIntegerHeader(headers, 'x-ratelimit-reset');
    if (limit === null || remaining === null || reset === null) return;

    const resource = readStringHeader(headers, 'x-ratelimit-resource')
      ?? (kind === 'graphql' ? 'graphql' : 'core');
    const used = readIntegerHeader(headers, 'x-ratelimit-used')
      ?? Math.max(0, limit - remaining);
    const reserve = calculateAssessmentRateLimitReserve(
      limit,
      this.minimumReserve,
      this.reserveRatio
    );
    this.latestResourceByKind[kind] = resource;
    this.usage.rateLimits[resource] = {
      resource,
      limit,
      remaining,
      used,
      reset,
      reserve,
    };
  }

  private async waitForPrimaryCapacity(kind: AssessmentRequestKind) {
    const resource = this.latestResourceByKind[kind];
    const bucket = resource ? this.usage.rateLimits[resource] : null;
    if (!bucket || bucket.remaining > bucket.reserve) return;

    const waitMs = (bucket.reset * 1_000) - this.now() + RESET_BOUNDARY_BUFFER_MS;
    if (waitMs > 0) await this.recordWait(waitMs);
  }

  private async waitForPacing() {
    if (this.minimumRequestIntervalMs === 0 || !this.usage.lastRequestAt) return;
    const elapsedMs = this.now() - Date.parse(this.usage.lastRequestAt);
    if (!Number.isFinite(elapsedMs)) return;
    const waitMs = this.minimumRequestIntervalMs - elapsedMs;
    if (waitMs <= 0) return;
    const boundedWaitMs = Math.ceil(waitMs);
    let waitedMs = 0;
    try {
      await this.guardedSleep(boundedWaitMs, elapsed => {
        waitedMs += elapsed;
      });
    } finally {
      if (waitedMs > 0) {
        this.usage.pacingWaitCount += 1;
        this.usage.pacingWaitMs += waitedMs;
        this.emit('pace');
      }
    }
  }

  private async recordRetryAndWait(waitMs: number) {
    this.usage.retryCount += 1;
    this.emit('retry');
    await this.recordWait(waitMs);
  }

  private async recordWait(waitMs: number) {
    const boundedWaitMs = Math.max(0, Math.ceil(waitMs));
    if (boundedWaitMs === 0) return;
    let waitedMs = 0;
    try {
      await this.guardedSleep(boundedWaitMs, elapsed => {
        waitedMs += elapsed;
      });
    } finally {
      if (waitedMs > 0) {
        this.usage.throttleCount += 1;
        this.usage.throttleWaitMs += waitedMs;
        this.emit('wait');
      }
    }
  }

  private async guardedSleep(
    milliseconds: number,
    onElapsed: (milliseconds: number) => void
  ) {
    if (!this.beforeRequest) {
      await this.sleep(milliseconds);
      onElapsed(milliseconds);
      return;
    }
    let remainingMs = milliseconds;
    while (remainingMs > 0) {
      await this.beforeRequest();
      const intervalMs = Math.min(remainingMs, CONTROL_CHECK_INTERVAL_MS);
      await this.sleep(intervalMs);
      onElapsed(intervalMs);
      remainingMs -= intervalMs;
    }
    await this.beforeRequest();
  }

  private emit(reason: AssessmentUsageUpdateReason) {
    this.onUpdate?.(this.snapshot(), reason);
  }
}

function calculateRetryWaitMs(
  error: unknown,
  attempt: number,
  now: number,
  random: number
): number {
  const headers = readErrorHeaders(error);
  const retryAfter = headers
    ? readIntegerHeader(headers, 'retry-after')
    : null;
  const reset = headers
    ? readIntegerHeader(headers, 'x-ratelimit-reset')
    : null;
  const remaining = headers
    ? readIntegerHeader(headers, 'x-ratelimit-remaining')
    : null;
  const jitterMs = Math.floor(Math.max(0, Math.min(1, random)) * 1_000);

  if (retryAfter !== null) return retryAfter * 1_000 + jitterMs;
  if (remaining === 0 && reset !== null) {
    return Math.max(0, reset * 1_000 - now) + RESET_BOUNDARY_BUFFER_MS + jitterMs;
  }
  return Math.min(
    SECONDARY_BACKOFF_MS * (2 ** attempt),
    MAX_SECONDARY_BACKOFF_MS
  ) + jitterMs;
}

function isRateLimitError(error: unknown): boolean {
  const status = readErrorStatus(error);
  const headers = readErrorHeaders(error);
  const remaining = headers
    ? readIntegerHeader(headers, 'x-ratelimit-remaining')
    : null;
  const retryAfter = headers
    ? readIntegerHeader(headers, 'retry-after')
    : null;
  const message = readErrorMessage(error).toLowerCase();
  const messageIndicatesRateLimit = message.includes('secondary rate limit')
    || message.includes('rate limit exceeded')
    || message.includes('abuse detection');

  return status === 429
    || messageIndicatesRateLimit
    || (status === 403 && (remaining === 0 || retryAfter !== null));
}

function createExhaustedError(
  error: unknown,
  maxRetries: number
): AssessmentRateLimitError {
  const status = readErrorStatus(error) ?? 429;
  const message = readErrorMessage(error);
  return new AssessmentRateLimitError(
    `GitHub continued to rate limit the assessment after ${maxRetries} retries`
      + (message ? `: ${message}` : ''),
    status
  );
}

function readErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

function readErrorHeaders(
  error: unknown
): Record<string, string | number | undefined> | null {
  if (!error || typeof error !== 'object') return null;
  const directHeaders = (error as { headers?: unknown }).headers;
  if (isHeaderRecord(directHeaders)) return directHeaders;
  const response = (error as { response?: unknown }).response;
  if (!response || typeof response !== 'object') return null;
  const responseHeaders = (response as { headers?: unknown }).headers;
  return isHeaderRecord(responseHeaders) ? responseHeaders : null;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return '';
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : '';
}

function isHeaderRecord(
  value: unknown
): value is Record<string, string | number | undefined> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readIntegerHeader(
  headers: Record<string, string | number | undefined>,
  name: string
): number | null {
  const value = headers[name];
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function readStringHeader(
  headers: Record<string, string | number | undefined>,
  name: string
): string | null {
  const value = headers[name];
  return typeof value === 'string' && value.trim() ? value : null;
}
