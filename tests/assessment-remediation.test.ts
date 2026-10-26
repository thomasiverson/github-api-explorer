import assert from 'node:assert/strict';
import test from 'node:test';
import { ASSESSMENT_FINDING_RULE_KEYS } from '../src/lib/assessment';
import {
  ASSESSMENT_REMEDIATION_REGISTRY,
  createRemediationHandoffUrl,
  findRemediationCatalogGaps,
  formatRemediationValue,
  getAssessmentRemediationDefinition,
  getUnresolvedRemediationParameters,
  parseRemediationHandoff,
  readRemediationValue,
  resolveRemediationPathValues,
  supportsRemediationProduct,
} from '../src/lib/assessment-remediation';

test('classifies every assessment finding rule for remediation', () => {
  assert.equal(ASSESSMENT_FINDING_RULE_KEYS.length, 42);
  assert.deepEqual(
    [...Object.keys(ASSESSMENT_REMEDIATION_REGISTRY)].sort(),
    [...ASSESSMENT_FINDING_RULE_KEYS].sort()
  );

  for (const ruleKey of ASSESSMENT_FINDING_RULE_KEYS) {
    const definition = ASSESSMENT_REMEDIATION_REGISTRY[ruleKey];
    assert.ok(definition.rationale.length > 0, `${ruleKey} needs a rationale`);
    assert.match(definition.apiVersion, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(definition.lastReviewedOn, /^\d{4}-\d{2}-\d{2}$/);
    if (definition.mode === 'advisory') {
      assert.equal(definition.apiTargets.length, 0);
    } else {
      assert.ok(definition.apiTargets.length > 0, `${ruleKey} needs an API target`);
    }
  }
});

test('keeps executable remediation preview-only until write execution is implemented', () => {
  const definition = getAssessmentRemediationDefinition(
    'organization-default-repository-admin'
  );
  assert.equal(definition?.mode, 'executable');
  assert.equal(definition?.previewRecipe?.execution, 'preview-only');
  assert.equal(definition?.previewRecipe?.inspection.method, 'GET');
  assert.equal(definition?.previewRecipe?.mutation.method, 'PATCH');
  assert.deepEqual(definition?.previewRecipe?.mutation.body, {
    default_repository_permission: 'read',
  });
  assert.equal(definition?.previewRecipe?.verification.method, 'GET');
  assert.equal(definition?.previewRecipe?.batchAllowed, false);
});

test('round-trips a registered remediation handoff without accepting request-body input', () => {
  const definition = ASSESSMENT_REMEDIATION_REGISTRY['organization-default-repository-write'];
  const target = definition.apiTargets[0];
  const url = createRemediationHandoffUrl(
    'organization-default-repository-write',
    target,
    {
      enterpriseSlug: 'octo-enterprise',
      defaultOrganization: 'fallback-org',
      affectedResource: 'affected-org',
    }
  );
  const serialized = new URL(url, 'http://localhost').searchParams.get('remediation');
  assert.ok(serialized);

  const parsed = parseRemediationHandoff(serialized);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.method, 'PATCH');
  assert.equal(parsed.value.path, '/orgs/{org}');
  assert.deepEqual(parsed.value.pathValues, { org: 'affected-org' });
  assert.deepEqual(parsed.value.body, { default_repository_permission: 'read' });
});

test('rejects remediation handoffs that do not match the server-defined registry', () => {
  const parsed = parseRemediationHandoff(JSON.stringify({
    version: 1,
    ruleKey: 'organization-default-repository-write',
    method: 'DELETE',
    path: '/enterprises/{enterprise}',
    label: 'Delete enterprise',
    pathValues: { enterprise: 'octo-enterprise' },
  }));
  assert.deepEqual(parsed, {
    ok: false,
    error: 'Remediation handoff does not match a registered API target.',
  });
});

test('rejects inherited object property names as remediation rule keys', () => {
  const parsed = parseRemediationHandoff(JSON.stringify({
    version: 1,
    ruleKey: '__proto__',
    method: 'GET',
    path: '/orgs/{org}',
    label: 'Unregistered request',
    pathValues: { org: 'octo-org' },
  }));
  assert.deepEqual(parsed, {
    ok: false,
    error: 'Remediation handoff does not match a registered API target.',
  });
});

test('prefills only unambiguous enterprise, organization, and repository parameters', () => {
  assert.deepEqual(
    resolveRemediationPathValues('/enterprises/{enterprise}/rulesets', {
      enterpriseSlug: 'octo-enterprise',
      defaultOrganization: 'octo-org',
    }),
    { enterprise: 'octo-enterprise' }
  );
  assert.deepEqual(
    resolveRemediationPathValues('/orgs/{org}', {
      enterpriseSlug: 'octo-enterprise',
      defaultOrganization: 'octo-org',
      affectedResource: 'affected-org',
    }),
    { org: 'affected-org' }
  );
  assert.deepEqual(
    resolveRemediationPathValues('/repos/{owner}/{repo}', {
      enterpriseSlug: 'octo-enterprise',
      defaultOrganization: 'octo-org',
      affectedResource: 'octo/repository',
    }),
    { owner: 'octo', repo: 'repository' }
  );
  assert.deepEqual(
    resolveRemediationPathValues('/orgs/{org}/rulesets', {
      enterpriseSlug: 'octo-enterprise',
      defaultOrganization: 'fallback-org',
      affectedResource: 'octo/repository',
    }),
    { org: 'octo' }
  );
  assert.deepEqual(
    resolveRemediationPathValues('/repos/{owner}/{repo}/collaborators/{username}', {
      enterpriseSlug: 'octo-enterprise',
      defaultOrganization: 'octo-org',
      affectedResource: 'octo/repository:octocat',
    }),
    {}
  );
});

test('reports remediation parameters that still require user input', () => {
  assert.deepEqual(
    getUnresolvedRemediationParameters(
      '/repos/{owner}/{repo}/rulesets/{ruleset_id}',
      { owner: 'octo', repo: 'repository' }
    ),
    ['ruleset_id']
  );
});

test('reads and formats inspected values without manufacturing missing data', () => {
  const body = {
    organization: {
      default_repository_permission: 'write',
    },
  };
  assert.equal(
    readRemediationValue(body, 'organization.default_repository_permission'),
    'write'
  );
  assert.equal(readRemediationValue(body, 'organization.missing'), undefined);
  assert.equal(formatRemediationValue({ setting: true }), '{"setting":true}');
  assert.equal(formatRemediationValue(undefined), 'Not returned');
});

test('limits cloud-only remediation definitions to GitHub Enterprise Cloud', () => {
  const billing = ASSESSMENT_REMEDIATION_REGISTRY['billing-budgets-missing'];
  assert.equal(supportsRemediationProduct(billing, 'https://api.github.com'), true);
  assert.equal(supportsRemediationProduct(billing, 'https://github.example.com/api/v3'), false);

  const organization = ASSESSMENT_REMEDIATION_REGISTRY[
    'organization-default-repository-write'
  ];
  assert.equal(
    supportsRemediationProduct(organization, 'https://github.example.com/api/v3'),
    true
  );
});

test('reports registered remediation targets omitted from an imported API catalog', () => {
  const cloudTargets = Object.values(ASSESSMENT_REMEDIATION_REGISTRY)
    .filter(definition => definition.supportedProducts.includes('ghec'))
    .flatMap(definition => definition.apiTargets);
  const completeCatalog = cloudTargets.map(target => ({
    method: target.method,
    path: target.path,
  }));
  assert.deepEqual(findRemediationCatalogGaps(completeCatalog, 'ghec'), []);

  const incompleteCatalog = completeCatalog.filter(target => !(
    target.method === 'PATCH'
    && target.path === '/enterprises/{enterprise}/actions/runner-groups/{runner_group_id}'
  ));
  const gaps = findRemediationCatalogGaps(incompleteCatalog, 'ghec');
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].method, 'PATCH');
  assert.equal(
    gaps[0].path,
    '/enterprises/{enterprise}/actions/runner-groups/{runner_group_id}'
  );
  assert.ok(gaps[0].ruleKeys.includes('actions-runner-groups-broadly-accessible'));
});
