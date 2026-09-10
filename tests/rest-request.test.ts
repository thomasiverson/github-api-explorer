import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyBatchJsonLine,
  applyBatchValue,
  buildRestUrl,
  collectEnabledQueryParams,
  mergePaginatedBody,
  parseBatchJsonLines,
  serializeQueryParams,
  validatePaginationUrl,
} from '../src/lib/rest-request';

test('collects enabled scalar and array query parameters', () => {
  const result = collectEnabledQueryParams(
    {
      user: { value: 'octocat', enabled: true },
      disabled: { value: 'ignored', enabled: false },
      owners: { value: 'octocat, hubot', enabled: true },
    },
    [
      { name: 'user', type: 'string' },
      { name: 'disabled', type: 'string' },
      { name: 'owners', type: 'array' },
    ]
  );

  assert.deepEqual(result, {
    user: 'octocat',
    owners: ['octocat', 'hubot'],
  });
});

test('honors non-exploded and delimited array query parameters', () => {
  const values = {
    topics: { value: 'api, enterprise', enabled: true },
  };

  assert.deepEqual(
    collectEnabledQueryParams(values, [{ name: 'topics', type: 'array', explode: false }]),
    { topics: 'api,enterprise' }
  );
  assert.deepEqual(
    collectEnabledQueryParams(values, [{ name: 'topics', type: 'array', style: 'pipeDelimited' }]),
    { topics: 'api|enterprise' }
  );
});

test('serializes repeated array values and encodes path values', () => {
  const url = buildRestUrl(
    'https://api.github.com',
    '/repos/{owner}/{repo}/git/ref/{ref}',
    { owner: 'github', repo: 'docs', ref: 'heads/feature one' },
    { owner: ['octocat', 'hubot'], label: 'help wanted' }
  );

  assert.equal(
    url,
    'https://api.github.com/repos/github/docs/git/ref/heads%2Ffeature%20one?owner=octocat&owner=hubot&label=help+wanted'
  );
  assert.equal(serializeQueryParams({ empty: '', values: [] }), '');
});

test('rejects pagination URLs outside the configured API origin or base path', () => {
  assert.doesNotThrow(() => {
    validatePaginationUrl(
      'https://github.example.com/api/v3/orgs/example/repos?page=2',
      'https://github.example.com/api/v3'
    );
  });
  assert.throws(
    () => validatePaginationUrl('http://github.example.com/api/v3/user', 'https://github.example.com/api/v3'),
    /origin/
  );
  assert.throws(
    () => validatePaginationUrl('https://github.example.com/login', 'https://github.example.com/api/v3'),
    /outside configured API base/
  );
});

test('merges paginated arrays and common object collection fields', () => {
  assert.deepEqual(mergePaginatedBody([1, 2], [3]), [1, 2, 3]);
  assert.deepEqual(
    mergePaginatedBody(
      { total_count: 3, items: [{ id: 1 }] },
      { total_count: 3, items: [{ id: 2 }, { id: 3 }] }
    ),
    { total_count: 3, items: [{ id: 1 }, { id: 2 }, { id: 3 }] }
  );
});

test('applies batch values to path, query, and top-level body targets', () => {
  const request = {
    pathParams: { enterprise: 'acme' },
    queryParams: { user: 'octocat' },
    body: { budget_entity_name: 'octocat', budget_amount: 25 },
  };

  assert.deepEqual(
    applyBatchValue(request, { location: 'query', name: 'user' }, 'hubot'),
    { ...request, queryParams: { user: 'hubot' } }
  );
  assert.deepEqual(
    applyBatchValue(request, { location: 'body', name: 'budget_entity_name' }, 'hubot'),
    { ...request, body: { budget_entity_name: 'hubot', budget_amount: 25 } }
  );
  assert.deepEqual(
    applyBatchValue(request, { location: 'body', name: 'budget_amount' }, '50'),
    { ...request, body: { budget_entity_name: 'octocat', budget_amount: 50 } }
  );
  assert.deepEqual(request, {
    pathParams: { enterprise: 'acme' },
    queryParams: { user: 'octocat' },
    body: { budget_entity_name: 'octocat', budget_amount: 25 },
  });
});

test('rejects invalid batch values for typed body properties', () => {
  const request = { pathParams: {}, queryParams: {}, body: { enabled: false, amount: 10 } };

  assert.throws(
    () => applyBatchValue(request, { location: 'body', name: 'enabled' }, 'yes'),
    /Expected true or false/
  );
  assert.throws(
    () => applyBatchValue(request, { location: 'body', name: 'amount' }, 'many'),
    /Expected a number/
  );
});

test('parses JSONL rows and reports line-specific errors before execution', () => {
  const result = parseBatchJsonLines([
    '{"user":"alice","amount":25}',
    '',
    'not json',
    '["not", "an", "object"]',
  ].join('\n'));

  assert.deepEqual(result.rows, [
    { lineNumber: 1, input: { user: 'alice', amount: 25 } },
  ]);
  assert.equal(result.errors.length, 2);
  assert.deepEqual(result.errors.map(error => error.lineNumber), [3, 4]);
});

test('applies plain JSONL body patches with recursive merging', () => {
  const request = {
    pathParams: { enterprise: 'acme' },
    queryParams: {},
    body: {
      budget_amount: 100,
      budget_alerting: { will_alert: false, alert_recipients: ['ops@example.com'] },
    },
  };

  assert.deepEqual(
    applyBatchJsonLine(request, {
      budget_entity_name: 'alice',
      budget_alerting: { will_alert: true },
    }),
    {
      ...request,
      body: {
        budget_amount: 100,
        budget_entity_name: 'alice',
        budget_alerting: { will_alert: true, alert_recipients: ['ops@example.com'] },
      },
    }
  );
});

test('applies JSONL envelopes across path, query, and body', () => {
  const request = {
    pathParams: { enterprise: 'acme' },
    queryParams: { page: '1' },
    body: { budget_amount: 100 },
  };

  assert.deepEqual(
    applyBatchJsonLine(request, {
      path: { enterprise: 'contoso' },
      query: { user: 'alice', labels: ['bug', 'help wanted'] },
      body: { budget_entity_name: 'alice' },
    }),
    {
      pathParams: { enterprise: 'contoso' },
      queryParams: { page: '1', user: 'alice', labels: ['bug', 'help wanted'] },
      body: { budget_amount: 100, budget_entity_name: 'alice' },
    }
  );
});

test('rejects invalid JSONL envelope value types and oversized batches', () => {
  const request = { pathParams: {}, queryParams: {}, body: {} };
  assert.throws(() => applyBatchJsonLine(request, { path: { org: 42 } }), /path values must be strings/);
  assert.throws(() => applyBatchJsonLine(request, { query: { user: true } }), /query values/);
  assert.equal(parseBatchJsonLines('{"a":1}\n{"a":2}', 1).errors[0]?.message, 'Batch limit is 1 requests');
});
