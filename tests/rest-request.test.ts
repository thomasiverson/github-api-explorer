import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRestUrl,
  collectEnabledQueryParams,
  mergePaginatedBody,
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
