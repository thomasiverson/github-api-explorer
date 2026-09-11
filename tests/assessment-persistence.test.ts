import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('persists and reloads repository security evidence', async () => {
  const originalWorkingDirectory = process.cwd();
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'github-api-explorer-assessment-'));
  let closeDatabase: (() => void) | null = null;

  try {
    process.chdir(temporaryDirectory);
    const {
      completeAssessment,
      createAssessmentRun,
      getAssessmentById,
      getDb,
    } = await import('../src/lib/db');
    const db = getDb();
    closeDatabase = () => db.close();
    db.prepare(`
      INSERT INTO environments (id, name, base_url, enterprise_slug, auth_method, is_active)
      VALUES ('environment-1', 'Test', 'https://api.github.com', 'acme', 'pat', 1)
    `).run();
    createAssessmentRun('run-1', 'environment-1');

    completeAssessment({
      runId: 'run-1',
      durationMs: 100,
      organizationCollector: { id: 'collector-organizations', durationMs: 1 },
      identityCollector: { id: 'collector-identity', durationMs: 1 },
      repositoryCollector: { id: 'collector-repositories', durationMs: 1 },
      teamCollector: { id: 'collector-teams', durationMs: 1 },
      securityCollector: { id: 'collector-security', durationMs: 1, error: null },
      repositorySecurityCollector: { id: 'collector-repository-security', durationMs: 1 },
      actionsCollector: { id: 'collector-actions', durationMs: 1, error: null },
      copilotCollector: { id: 'collector-copilot', durationMs: 1, error: null },
      billingCollector: { id: 'collector-billing', durationMs: 1, error: null },
      organizations: [],
      members: [],
      ownerCount: 0,
      repositories: [],
      repositoryFailures: [],
      teams: [],
      teamFailures: [],
      securityDefaults: [],
      repositorySecurity: [{
        nameWithOwner: 'acme/repository',
        visibility: 'PRIVATE',
        isArchived: false,
        isFork: false,
        codeSecurity: 'enabled',
        codeScanningDefaultSetup: 'configured',
        secretScanning: 'enabled',
        secretScanningPushProtection: 'enabled',
        dependabotAlerts: 'enabled',
        dependabotSecurityUpdates: 'enabled',
        configurationStatus: 'enforced',
        configurationId: 17,
        configurationName: 'Enterprise baseline',
        configurationEnforcement: 'enforced',
      }],
      repositorySecurityFailures: [],
      actionsPolicy: null,
      copilotSeats: null,
      budgets: null,
      evaluation: {
        healthScore: 100,
        assessedDomainCount: 3,
        findings: [],
        metrics: {
          codeScanningDefaultSetupRepositories: 1,
          eligibleSecurityRepositories: 1,
        },
      },
    });

    const snapshot = getAssessmentById('run-1');
    assert.ok(snapshot);
    assert.deepEqual(snapshot.repositorySecurity, [{
      nameWithOwner: 'acme/repository',
      visibility: 'PRIVATE',
      isArchived: false,
      isFork: false,
      codeSecurity: 'enabled',
      codeScanningDefaultSetup: 'configured',
      secretScanning: 'enabled',
      secretScanningPushProtection: 'enabled',
      dependabotAlerts: 'enabled',
      dependabotSecurityUpdates: 'enabled',
      configurationStatus: 'enforced',
      configurationId: 17,
      configurationName: 'Enterprise baseline',
      configurationEnforcement: 'enforced',
    }]);
    assert.equal(snapshot.metrics.codeScanningDefaultSetupRepositories, 1);
    assert.deepEqual(snapshot.collectors.find(
      collector => collector.collector_key === 'repositorySecurity'
    ), {
      collector_key: 'repositorySecurity',
      status: 'completed',
      item_count: 1,
      duration_ms: 1,
      error: null,
    });
  } finally {
    closeDatabase?.();
    process.chdir(originalWorkingDirectory);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
