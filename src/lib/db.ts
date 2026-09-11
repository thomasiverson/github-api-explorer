import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import type { ImportedEndpoint } from './openapi-import';
import type {
  AssessmentActionsEvidence,
  AssessmentActionsPolicy,
  AssessmentBudget,
  AssessmentCopilotSeatInventory,
  AssessmentEvaluation,
  AssessmentRepositoryRules,
  AssessmentRepositoryRulesFailure,
  AssessmentRepositorySecurity,
  AssessmentRepositorySecurityFailure,
  AssessmentSecurityDefault,
} from './assessment';

const DB_PATH = path.join(process.cwd(), 'data', 'harness.db');

let _db: Database.Database | null = null;

function ensureDataDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getDb(): Database.Database {
  if (!_db) {
    ensureDataDir();
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL DEFAULT 'https://api.github.com',
      enterprise_slug TEXT NOT NULL DEFAULT '',
      org_name TEXT NOT NULL DEFAULT '',
      auth_method TEXT NOT NULL DEFAULT 'pat',
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS credentials (
      environment_id TEXT PRIMARY KEY REFERENCES environments(id) ON DELETE CASCADE,
      auth_type TEXT NOT NULL,
      encrypted_data TEXT NOT NULL,
      iv TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS endpoints (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      subcategory TEXT NOT NULL DEFAULT '',
      operation_id TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      path_params TEXT NOT NULL DEFAULT '[]',
      query_params TEXT NOT NULL DEFAULT '[]',
      body_schema TEXT,
      response_schema TEXT,
      is_deprecated INTEGER NOT NULL DEFAULT 0,
      spec_version TEXT NOT NULL DEFAULT 'api.github.com'
    );

    CREATE INDEX IF NOT EXISTS idx_endpoints_category ON endpoints(category);
    CREATE INDEX IF NOT EXISTS idx_endpoints_method ON endpoints(method);
    CREATE INDEX IF NOT EXISTS idx_endpoints_operation_id ON endpoints(operation_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_endpoints_spec_method_path
      ON endpoints(spec_version, method, path);

    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      resolved_url TEXT NOT NULL,
      status INTEGER NOT NULL,
      timing REAL NOT NULL,
      request_body TEXT,
      response_body TEXT,
      response_headers TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      operation_id TEXT,
      category TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_history_env ON history(environment_id);
    CREATE INDEX IF NOT EXISTS idx_history_created ON history(created_at DESC);

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      environment_id TEXT REFERENCES environments(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS collection_items (
      id TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      operation_id TEXT,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      path_params TEXT NOT NULL DEFAULT '{}',
      query_params TEXT NOT NULL DEFAULT '{}',
      headers TEXT NOT NULL DEFAULT '{}',
      body TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_collection_items_coll ON collection_items(collection_id);

    CREATE TABLE IF NOT EXISTS env_variables (
      id TEXT PRIMARY KEY,
      environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      UNIQUE(environment_id, name)
    );

    CREATE TABLE IF NOT EXISTS favorites (
      operation_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assessment_runs (
      id TEXT PRIMARY KEY,
      environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      duration_ms INTEGER,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_assessment_runs_environment
      ON assessment_runs(environment_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS assessment_collector_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      collector_key TEXT NOT NULL,
      status TEXT NOT NULL,
      item_count INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      UNIQUE(run_id, collector_key)
    );

    CREATE TABLE IF NOT EXISTS assessment_metrics (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      metric_key TEXT NOT NULL,
      value INTEGER NOT NULL,
      PRIMARY KEY(run_id, metric_key)
    );

    CREATE TABLE IF NOT EXISTS assessment_organizations (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      github_id INTEGER NOT NULL,
      node_id TEXT NOT NULL,
      login TEXT NOT NULL,
      description TEXT,
      PRIMARY KEY(run_id, login)
    );

    CREATE TABLE IF NOT EXISTS assessment_members (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      login TEXT NOT NULL,
      name TEXT,
      is_owner INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(run_id, login)
    );

    CREATE TABLE IF NOT EXISTS assessment_repositories (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      github_id INTEGER NOT NULL,
      node_id TEXT NOT NULL,
      organization_login TEXT NOT NULL,
      name_with_owner TEXT NOT NULL,
      visibility TEXT NOT NULL,
      is_archived INTEGER NOT NULL DEFAULT 0,
      is_fork INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(run_id, name_with_owner)
    );

    CREATE TABLE IF NOT EXISTS assessment_teams (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      github_id INTEGER NOT NULL,
      node_id TEXT NOT NULL,
      organization_login TEXT NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      privacy TEXT NOT NULL,
      PRIMARY KEY(run_id, organization_login, slug)
    );

    CREATE TABLE IF NOT EXISTS assessment_findings (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      rule_key TEXT NOT NULL,
      domain TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      affected_resources TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY(run_id, rule_key)
    );

    CREATE TABLE IF NOT EXISTS assessment_security_defaults (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      default_scope TEXT NOT NULL,
      configuration_id INTEGER NOT NULL,
      configuration_name TEXT NOT NULL,
      advanced_security TEXT NOT NULL,
      dependency_graph TEXT NOT NULL,
      dependabot_alerts TEXT NOT NULL,
      code_scanning_default_setup TEXT NOT NULL,
      secret_scanning TEXT NOT NULL,
      secret_scanning_push_protection TEXT NOT NULL,
      enforcement TEXT NOT NULL,
      PRIMARY KEY(run_id, default_scope, configuration_id)
    );

    CREATE TABLE IF NOT EXISTS assessment_repository_security (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      name_with_owner TEXT NOT NULL,
      visibility TEXT NOT NULL,
      is_archived INTEGER NOT NULL DEFAULT 0,
      is_fork INTEGER NOT NULL DEFAULT 0,
      default_branch TEXT,
      code_security TEXT,
      code_scanning_default_setup TEXT,
      secret_scanning TEXT,
      secret_scanning_push_protection TEXT,
      dependabot_alerts TEXT,
      dependabot_security_updates TEXT,
      configuration_status TEXT,
      configuration_id INTEGER,
      configuration_name TEXT,
      configuration_enforcement TEXT,
      PRIMARY KEY(run_id, name_with_owner)
    );

    CREATE TABLE IF NOT EXISTS assessment_repository_rules (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      name_with_owner TEXT NOT NULL,
      visibility TEXT NOT NULL,
      is_archived INTEGER NOT NULL DEFAULT 0,
      is_fork INTEGER NOT NULL DEFAULT 0,
      default_branch TEXT,
      branch_exists INTEGER,
      classic_protection INTEGER,
      has_protection INTEGER,
      active_ruleset_ids TEXT,
      active_ruleset_sources TEXT,
      rule_types TEXT,
      requires_pull_request INTEGER,
      required_approving_review_count INTEGER,
      requires_status_checks INTEGER,
      blocks_force_pushes INTEGER,
      blocks_deletions INTEGER,
      enforces_admins INTEGER,
      PRIMARY KEY(run_id, name_with_owner)
    );

    CREATE TABLE IF NOT EXISTS assessment_repository_rules_failures (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      name_with_owner TEXT NOT NULL,
      check_key TEXT NOT NULL,
      error TEXT NOT NULL,
      PRIMARY KEY(run_id, name_with_owner, check_key)
    );

    CREATE TABLE IF NOT EXISTS assessment_actions_policies (
      run_id TEXT PRIMARY KEY REFERENCES assessment_runs(id) ON DELETE CASCADE,
      enabled_organizations TEXT NOT NULL,
      allowed_actions TEXT NOT NULL,
      sha_pinning_required INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS assessment_actions_details (
      run_id TEXT PRIMARY KEY REFERENCES assessment_runs(id) ON DELETE CASCADE,
      github_owned_allowed INTEGER,
      verified_allowed INTEGER,
      patterns_allowed TEXT,
      default_workflow_permissions TEXT,
      can_approve_pull_request_reviews INTEGER,
      run_workflows_from_fork_pull_requests INTEGER,
      send_write_tokens_to_workflows INTEGER,
      send_secrets_and_variables INTEGER,
      require_approval_for_fork_pr_workflows INTEGER,
      self_hosted_runners_disabled_for_all_orgs INTEGER
    );

    CREATE TABLE IF NOT EXISTS assessment_actions_runner_groups (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      github_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      visibility TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      allows_public_repositories INTEGER NOT NULL DEFAULT 0,
      restricted_to_workflows INTEGER NOT NULL DEFAULT 0,
      selected_workflows TEXT NOT NULL,
      PRIMARY KEY(run_id, github_id)
    );

    CREATE TABLE IF NOT EXISTS assessment_actions_runners (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      github_id INTEGER NOT NULL,
      runner_group_id INTEGER,
      name TEXT NOT NULL,
      os TEXT NOT NULL,
      status TEXT NOT NULL,
      busy INTEGER NOT NULL DEFAULT 0,
      ephemeral INTEGER NOT NULL DEFAULT 0,
      version TEXT,
      labels TEXT NOT NULL,
      PRIMARY KEY(run_id, github_id)
    );

    CREATE TABLE IF NOT EXISTS assessment_actions_failures (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      check_key TEXT NOT NULL,
      error TEXT NOT NULL,
      PRIMARY KEY(run_id, check_key)
    );

    CREATE TABLE IF NOT EXISTS assessment_copilot_seats (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      login TEXT NOT NULL,
      plan_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_authenticated_at TEXT,
      last_activity_at TEXT,
      pending_cancellation_date TEXT,
      assignment_count INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY(run_id, login)
    );

    CREATE TABLE IF NOT EXISTS assessment_budgets (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      budget_id TEXT NOT NULL,
      budget_type TEXT NOT NULL,
      product_sku TEXT NOT NULL,
      scope TEXT NOT NULL,
      amount REAL NOT NULL,
      consumed_amount REAL,
      prevents_further_usage INTEGER NOT NULL DEFAULT 0,
      alerting_enabled INTEGER NOT NULL DEFAULT 0,
      alert_recipient_count INTEGER NOT NULL DEFAULT 0,
      entity_name TEXT,
      user_login TEXT,
      expires_at TEXT,
      PRIMARY KEY(run_id, budget_id)
    );
  `);

  const repositorySecurityColumns = db.prepare(
    'PRAGMA table_info(assessment_repository_security)'
  ).all() as Array<{ name: string }>;
  if (!repositorySecurityColumns.some(column => column.name === 'default_branch')) {
    db.exec('ALTER TABLE assessment_repository_security ADD COLUMN default_branch TEXT');
  }
}

// === Encryption Helpers ===

function getEncryptionKey(): Buffer {
  let key = process.env.ENCRYPTION_KEY;
  if (!key || key.length === 0) {
    // Auto-generate and persist if missing
    key = crypto.randomBytes(32).toString('hex');
    const envPath = path.join(process.cwd(), '.env.local');
    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf-8');
    }
    content = content.replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${key}`);
    if (!content.includes('ENCRYPTION_KEY=')) {
      content += `\nENCRYPTION_KEY=${key}\n`;
    }
    fs.writeFileSync(envPath, content);
    process.env.ENCRYPTION_KEY = key;
  }
  return Buffer.from(key, 'hex');
}

export function encrypt(text: string): { encrypted: string; iv: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return { encrypted, iv: iv.toString('hex') };
}

export function decrypt(encrypted: string, ivHex: string): string {
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// === Environment CRUD ===

export function getEnvironments() {
  return getDb().prepare('SELECT * FROM environments ORDER BY is_active DESC, name').all() as Array<{
    id: string; name: string; base_url: string; enterprise_slug: string;
    org_name: string; auth_method: string; is_active: number;
    created_at: string; updated_at: string;
  }>;
}

export function getActiveEnvironment() {
  return getDb().prepare('SELECT * FROM environments WHERE is_active = 1 LIMIT 1').get() as {
    id: string; name: string; base_url: string; enterprise_slug: string;
    org_name: string; auth_method: string; is_active: number;
    created_at: string; updated_at: string;
  } | undefined;
}

export function getEnvironment(environmentId: string) {
  return getDb().prepare('SELECT * FROM environments WHERE id = ?').get(environmentId) as {
    id: string; name: string; base_url: string; enterprise_slug: string;
    org_name: string; auth_method: string; is_active: number;
    created_at: string; updated_at: string;
  } | undefined;
}

export function createEnvironment(env: {
  id: string; name: string; baseUrl: string; enterpriseSlug: string;
  orgName: string; authMethod: string;
}) {
  getDb().prepare(`
    INSERT INTO environments (id, name, base_url, enterprise_slug, org_name, auth_method)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(env.id, env.name, env.baseUrl, env.enterpriseSlug, env.orgName, env.authMethod);
}

export function updateEnvironment(id: string, updates: {
  name?: string; baseUrl?: string; enterpriseSlug?: string;
  orgName?: string; authMethod?: string;
}) {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.baseUrl !== undefined) { fields.push('base_url = ?'); values.push(updates.baseUrl); }
  if (updates.enterpriseSlug !== undefined) { fields.push('enterprise_slug = ?'); values.push(updates.enterpriseSlug); }
  if (updates.orgName !== undefined) { fields.push('org_name = ?'); values.push(updates.orgName); }
  if (updates.authMethod !== undefined) { fields.push('auth_method = ?'); values.push(updates.authMethod); }
  fields.push("updated_at = datetime('now')");
  values.push(id);
  getDb().prepare(`UPDATE environments SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function setActiveEnvironment(id: string) {
  const db = getDb();
  db.prepare('UPDATE environments SET is_active = 0').run();
  db.prepare('UPDATE environments SET is_active = 1 WHERE id = ?').run(id);
}

export function deleteEnvironment(id: string) {
  getDb().prepare('DELETE FROM environments WHERE id = ?').run(id);
}

// === Credential CRUD ===

export function saveCredential(environmentId: string, authType: string, data: string) {
  const { encrypted, iv } = encrypt(data);
  getDb().prepare(`
    INSERT OR REPLACE INTO credentials (environment_id, auth_type, encrypted_data, iv)
    VALUES (?, ?, ?, ?)
  `).run(environmentId, authType, encrypted, iv);
}

export function getCredential(environmentId: string): { authType: string; data: string } | null {
  const row = getDb().prepare(
    'SELECT auth_type, encrypted_data, iv FROM credentials WHERE environment_id = ?'
  ).get(environmentId) as { auth_type: string; encrypted_data: string; iv: string } | undefined;
  if (!row) return null;
  return { authType: row.auth_type, data: decrypt(row.encrypted_data, row.iv) };
}

// === Endpoint Queries ===

export function getEndpointCategories(specVersion?: string): Array<{ category: string; count: number }> {
  if (specVersion) {
    return getDb().prepare(`
      SELECT category, COUNT(*) as count FROM endpoints WHERE spec_version = ? GROUP BY category ORDER BY category
    `).all(specVersion) as Array<{ category: string; count: number }>;
  }
  return getDb().prepare(`
    SELECT category, COUNT(*) as count FROM endpoints GROUP BY category ORDER BY category
  `).all() as Array<{ category: string; count: number }>;
}

export function getEndpointsByCategory(category: string, specVersion?: string) {
  if (specVersion) {
    return getDb().prepare(
      'SELECT * FROM endpoints WHERE category = ? AND spec_version = ? ORDER BY path, method'
    ).all(category, specVersion);
  }
  return getDb().prepare(
    'SELECT * FROM endpoints WHERE category = ? ORDER BY path, method'
  ).all(category);
}

export function lookupCategory(operationId: string | null, path: string): string | null {
  if (operationId) {
    const row = getDb().prepare(
      'SELECT category FROM endpoints WHERE operation_id = ? LIMIT 1'
    ).get(operationId) as { category: string } | undefined;
    if (row) return row.category;
  }
  // Try matching by path template
  const row = getDb().prepare(
    'SELECT category FROM endpoints WHERE path = ? LIMIT 1'
  ).get(path) as { category: string } | undefined;
  if (row) return row.category;
  return null;
}

export function searchEndpoints(query: string, limit = 50, specVersion?: string) {
  const pattern = `%${query}%`;
  if (specVersion) {
    return getDb().prepare(`
      SELECT * FROM endpoints
      WHERE spec_version = ? AND (operation_id LIKE ? OR path LIKE ? OR summary LIKE ? OR category LIKE ?)
      ORDER BY category, path, method
      LIMIT ?
    `).all(specVersion, pattern, pattern, pattern, pattern, limit);
  }
  return getDb().prepare(`
    SELECT * FROM endpoints
    WHERE operation_id LIKE ? OR path LIKE ? OR summary LIKE ? OR category LIKE ?
    ORDER BY category, path, method
    LIMIT ?
  `).all(pattern, pattern, pattern, pattern, limit);
}

export function getEndpointCount(specVersion?: string): number {
  if (specVersion) {
    const row = getDb().prepare('SELECT COUNT(*) as count FROM endpoints WHERE spec_version = ?').get(specVersion) as { count: number };
    return row.count;
  }
  const row = getDb().prepare('SELECT COUNT(*) as count FROM endpoints').get() as { count: number };
  return row.count;
}

export function clearEndpoints(specVersion?: string) {
  if (specVersion) {
    getDb().prepare('DELETE FROM endpoints WHERE spec_version = ?').run(specVersion);
  } else {
    getDb().prepare('DELETE FROM endpoints').run();
  }
}

export function insertEndpoint(endpoint: ImportedEndpoint) {
  insertEndpointRow(getDb().prepare(INSERT_ENDPOINT_SQL), endpoint);
}

export function replaceEndpoints(specVersion: string, endpoints: ImportedEndpoint[]) {
  const db = getDb();
  const clear = db.prepare('DELETE FROM endpoints WHERE spec_version = ?');
  const insert = db.prepare(INSERT_ENDPOINT_SQL);
  const replace = db.transaction(() => {
    clear.run(specVersion);
    for (const endpoint of endpoints) {
      insertEndpointRow(insert, endpoint);
    }
  });
  replace();
}

const INSERT_ENDPOINT_SQL = `
  INSERT INTO endpoints
  (id, category, subcategory, operation_id, method, path, summary, description,
   path_params, query_params, body_schema, response_schema, is_deprecated, spec_version)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

function insertEndpointRow(
  statement: Database.Statement,
  endpoint: ImportedEndpoint
) {
  statement.run(
    endpoint.id, endpoint.category, endpoint.subcategory, endpoint.operationId,
    endpoint.method, endpoint.path, endpoint.summary, endpoint.description,
    endpoint.pathParams, endpoint.queryParams, endpoint.bodySchema,
    endpoint.responseSchema, endpoint.isDeprecated ? 1 : 0, endpoint.specVersion
  );
}

// === Version Compare Queries ===

export function getSpecVersions(): Array<{ spec_version: string; count: number }> {
  return getDb().prepare(`
    SELECT spec_version, COUNT(*) as count FROM endpoints GROUP BY spec_version ORDER BY spec_version
  `).all() as Array<{ spec_version: string; count: number }>;
}

export function getEndpointsByVersion(specVersion: string) {
  return getDb().prepare(
    'SELECT * FROM endpoints WHERE spec_version = ? ORDER BY category, path, method'
  ).all(specVersion) as Array<{
    id: string; category: string; subcategory: string; operation_id: string;
    method: string; path: string; summary: string; description: string;
    path_params: string; query_params: string; body_schema: string | null;
    response_schema: string | null; is_deprecated: number; spec_version: string;
  }>;
}

// === History CRUD ===

export function addHistory(entry: {
  id: string; environmentId: string; method: string; path: string;
  resolvedUrl: string; status: number; timing: number;
  requestBody: string | null; responseBody: string | null;
  responseHeaders: string | null; operationId: string | null; category: string | null;
}) {
  getDb().prepare(`
    INSERT INTO history
    (id, environment_id, method, path, resolved_url, status, timing,
     request_body, response_body, response_headers, operation_id, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.id, entry.environmentId, entry.method, entry.path,
    entry.resolvedUrl, entry.status, entry.timing,
    entry.requestBody, entry.responseBody, entry.responseHeaders,
    entry.operationId, entry.category
  );
}

export function getHistory(environmentId?: string, limit = 100, offset = 0) {
  if (environmentId) {
    return getDb().prepare(
      'SELECT * FROM history WHERE environment_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(environmentId, limit, offset);
  }
  return getDb().prepare(
    'SELECT * FROM history ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset);
}

export function getHistoryEntry(id: string) {
  return getDb().prepare('SELECT * FROM history WHERE id = ?').get(id);
}

export function deleteHistory(id: string) {
  getDb().prepare('DELETE FROM history WHERE id = ?').run(id);
}

export function clearHistory(environmentId?: string) {
  if (environmentId) {
    getDb().prepare('DELETE FROM history WHERE environment_id = ?').run(environmentId);
  } else {
    getDb().prepare('DELETE FROM history').run();
  }
}

export function backfillHistoryCategories(): number {
  const rows = getDb().prepare(
    'SELECT id, operation_id, path FROM history WHERE category IS NULL'
  ).all() as Array<{ id: string; operation_id: string | null; path: string }>;

  const update = getDb().prepare('UPDATE history SET category = ? WHERE id = ?');
  let count = 0;
  for (const row of rows) {
    const cat = lookupCategory(row.operation_id, row.path);
    if (cat) {
      update.run(cat, row.id);
      count++;
    }
  }
  return count;
}

// === Environment Variables CRUD ===

export function getVariables(environmentId: string): Array<{ id: string; name: string; value: string }> {
  return getDb().prepare(
    'SELECT id, name, value FROM env_variables WHERE environment_id = ? ORDER BY name'
  ).all(environmentId) as Array<{ id: string; name: string; value: string }>;
}

export function setVariable(environmentId: string, id: string, name: string, value: string) {
  getDb().prepare(`
    INSERT OR REPLACE INTO env_variables (id, environment_id, name, value)
    VALUES (?, ?, ?, ?)
  `).run(id, environmentId, name, value);
}

export function deleteVariable(id: string) {
  getDb().prepare('DELETE FROM env_variables WHERE id = ?').run(id);
}

// === Collections CRUD ===

export function getCollections(): Array<{
  id: string; name: string; description: string; environment_id: string | null;
  created_at: string; updated_at: string; item_count: number;
}> {
  return getDb().prepare(`
    SELECT c.*, COUNT(ci.id) as item_count
    FROM collections c LEFT JOIN collection_items ci ON c.id = ci.collection_id
    GROUP BY c.id ORDER BY c.updated_at DESC
  `).all() as Array<{
    id: string; name: string; description: string; environment_id: string | null;
    created_at: string; updated_at: string; item_count: number;
  }>;
}

export function createCollection(id: string, name: string, description: string, environmentId: string | null) {
  getDb().prepare(`
    INSERT INTO collections (id, name, description, environment_id) VALUES (?, ?, ?, ?)
  `).run(id, name, description, environmentId);
}

export function updateCollection(id: string, name: string, description: string) {
  getDb().prepare(`
    UPDATE collections SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?
  `).run(name, description, id);
}

export function deleteCollection(id: string) {
  getDb().prepare('DELETE FROM collections WHERE id = ?').run(id);
}

export function getCollectionItems(collectionId: string) {
  return getDb().prepare(
    'SELECT * FROM collection_items WHERE collection_id = ? ORDER BY sort_order'
  ).all(collectionId);
}

export function addCollectionItem(item: {
  id: string; collectionId: string; operationId: string | null; method: string;
  path: string; pathParams: string; queryParams: string; headers: string;
  body: string | null; sortOrder: number;
}) {
  getDb().prepare(`
    INSERT INTO collection_items (id, collection_id, operation_id, method, path, path_params, query_params, headers, body, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(item.id, item.collectionId, item.operationId, item.method, item.path,
    item.pathParams, item.queryParams, item.headers, item.body, item.sortOrder);
}

export function deleteCollectionItem(id: string) {
  getDb().prepare('DELETE FROM collection_items WHERE id = ?').run(id);
}

export function updateCollectionItem(id: string, updates: {
  pathParams?: string; queryParams?: string; headers?: string; body?: string | null;
}) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (updates.pathParams !== undefined) { sets.push('path_params = ?'); vals.push(updates.pathParams); }
  if (updates.queryParams !== undefined) { sets.push('query_params = ?'); vals.push(updates.queryParams); }
  if (updates.headers !== undefined) { sets.push('headers = ?'); vals.push(updates.headers); }
  if (updates.body !== undefined) { sets.push('body = ?'); vals.push(updates.body); }
  if (sets.length === 0) return;
  vals.push(id);
  getDb().prepare(`UPDATE collection_items SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function reorderCollectionItems(collectionId: string, itemIds: string[]) {
  const db = getDb();
  const stmt = db.prepare('UPDATE collection_items SET sort_order = ? WHERE id = ? AND collection_id = ?');
  const tx = db.transaction(() => {
    itemIds.forEach((id, i) => stmt.run(i, id, collectionId));
  });
  tx();
}

// === Favorites CRUD ===

export function getFavorites(): string[] {
  const rows = getDb().prepare('SELECT operation_id FROM favorites ORDER BY created_at').all() as Array<{ operation_id: string }>;
  return rows.map(r => r.operation_id);
}

export function addFavorite(operationId: string) {
  getDb().prepare('INSERT OR IGNORE INTO favorites (operation_id) VALUES (?)').run(operationId);
}

export function removeFavorite(operationId: string) {
  getDb().prepare('DELETE FROM favorites WHERE operation_id = ?').run(operationId);
}

export function isFavorite(operationId: string): boolean {
  const row = getDb().prepare('SELECT 1 FROM favorites WHERE operation_id = ?').get(operationId);
  return !!row;
}

// === Assessment CRUD ===

interface AssessmentRunRow {
  id: string;
  environment_id: string;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error: string | null;
}

export function createAssessmentRun(id: string, environmentId: string) {
  getDb().prepare(`
    INSERT INTO assessment_runs (id, environment_id, status)
    VALUES (?, ?, 'running')
  `).run(id, environmentId);
}

function nullableBooleanToInteger(value: boolean | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  return value ? 1 : 0;
}

function nullableIntegerToBoolean(value: number | null): boolean | null {
  if (value === null) return null;
  return value === 1;
}

export function completeAssessment(input: {
  runId: string;
  durationMs: number;
  organizationCollector: { id: string; durationMs: number };
  identityCollector: { id: string; durationMs: number };
  repositoryCollector: { id: string; durationMs: number };
  teamCollector: { id: string; durationMs: number };
  securityCollector: { id: string; durationMs: number; error: string | null };
  repositorySecurityCollector: { id: string; durationMs: number };
  repositoryRulesCollector: { id: string; durationMs: number };
  actionsCollector: { id: string; durationMs: number; error: string | null };
  actionsDepthCollector: { id: string; durationMs: number; error: string | null };
  copilotCollector: { id: string; durationMs: number; error: string | null };
  billingCollector: { id: string; durationMs: number; error: string | null };
  organizations: Array<{
    githubId: number;
    nodeId: string;
    login: string;
    description: string | null;
  }>;
  members: Array<{
    login: string;
    name: string | null;
    isOwner: boolean;
  }>;
  ownerCount: number;
  repositories: Array<{
    githubId: number;
    nodeId: string;
    organizationLogin: string;
    nameWithOwner: string;
    visibility: string;
    isArchived: boolean;
    isFork: boolean;
    updatedAt: string;
  }>;
  repositoryFailures: Array<{ organizationLogin: string; error: string }>;
  teams: Array<{
    githubId: number;
    nodeId: string;
    organizationLogin: string;
    slug: string;
    name: string;
    privacy: string;
  }>;
  teamFailures: Array<{ organizationLogin: string; error: string }>;
  securityDefaults: AssessmentSecurityDefault[] | null;
  repositorySecurity: AssessmentRepositorySecurity[];
  repositorySecurityFailures: AssessmentRepositorySecurityFailure[];
  repositoryRules: AssessmentRepositoryRules[];
  repositoryRulesFailures: AssessmentRepositoryRulesFailure[];
  actionsPolicy: AssessmentActionsPolicy | null;
  actionsEvidence: AssessmentActionsEvidence | null;
  copilotSeats: AssessmentCopilotSeatInventory | null;
  budgets: AssessmentBudget[] | null;
  evaluation: AssessmentEvaluation;
}) {
  const db = getDb();
  const insertOrganization = db.prepare(`
    INSERT INTO assessment_organizations (run_id, github_id, node_id, login, description)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertMember = db.prepare(`
    INSERT INTO assessment_members (run_id, login, name, is_owner)
    VALUES (?, ?, ?, ?)
  `);
  const insertRepository = db.prepare(`
    INSERT INTO assessment_repositories
      (run_id, github_id, node_id, organization_login, name_with_owner, visibility, is_archived, is_fork, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTeam = db.prepare(`
    INSERT INTO assessment_teams
      (run_id, github_id, node_id, organization_login, slug, name, privacy)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFinding = db.prepare(`
    INSERT INTO assessment_findings
      (run_id, rule_key, domain, severity, title, summary, recommendation, affected_resources)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSecurityDefault = db.prepare(`
    INSERT INTO assessment_security_defaults
      (run_id, default_scope, configuration_id, configuration_name, advanced_security,
       dependency_graph, dependabot_alerts, code_scanning_default_setup, secret_scanning,
       secret_scanning_push_protection, enforcement)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRepositorySecurity = db.prepare(`
    INSERT INTO assessment_repository_security
      (run_id, name_with_owner, visibility, is_archived, is_fork, default_branch, code_security,
       code_scanning_default_setup, secret_scanning, secret_scanning_push_protection, dependabot_alerts,
       dependabot_security_updates, configuration_status, configuration_id,
       configuration_name, configuration_enforcement)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRepositoryRules = db.prepare(`
    INSERT INTO assessment_repository_rules
      (run_id, name_with_owner, visibility, is_archived, is_fork, default_branch,
       branch_exists, classic_protection, has_protection, active_ruleset_ids,
       active_ruleset_sources, rule_types, requires_pull_request,
       required_approving_review_count, requires_status_checks, blocks_force_pushes,
       blocks_deletions, enforces_admins)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRepositoryRulesFailure = db.prepare(`
    INSERT INTO assessment_repository_rules_failures
      (run_id, name_with_owner, check_key, error)
    VALUES (?, ?, ?, ?)
  `);
  const insertActionsDetails = db.prepare(`
    INSERT INTO assessment_actions_details
      (run_id, github_owned_allowed, verified_allowed, patterns_allowed,
       default_workflow_permissions, can_approve_pull_request_reviews,
       run_workflows_from_fork_pull_requests, send_write_tokens_to_workflows,
       send_secrets_and_variables, require_approval_for_fork_pr_workflows,
       self_hosted_runners_disabled_for_all_orgs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertActionsRunnerGroup = db.prepare(`
    INSERT INTO assessment_actions_runner_groups
      (run_id, github_id, name, visibility, is_default, allows_public_repositories,
       restricted_to_workflows, selected_workflows)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertActionsRunner = db.prepare(`
    INSERT INTO assessment_actions_runners
      (run_id, github_id, runner_group_id, name, os, status, busy, ephemeral, version, labels)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertActionsFailure = db.prepare(`
    INSERT INTO assessment_actions_failures (run_id, check_key, error)
    VALUES (?, ?, ?)
  `);
  const insertCopilotSeat = db.prepare(`
    INSERT INTO assessment_copilot_seats
      (run_id, login, plan_type, created_at, last_authenticated_at, last_activity_at,
       pending_cancellation_date, assignment_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertBudget = db.prepare(`
    INSERT INTO assessment_budgets
      (run_id, budget_id, budget_type, product_sku, scope, amount, consumed_amount,
       prevents_further_usage, alerting_enabled, alert_recipient_count, entity_name,
       user_login, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const complete = db.transaction(() => {
    for (const organization of input.organizations) {
      insertOrganization.run(
        input.runId,
        organization.githubId,
        organization.nodeId,
        organization.login,
        organization.description
      );
    }
    for (const member of input.members) {
      insertMember.run(input.runId, member.login, member.name, member.isOwner ? 1 : 0);
    }
    for (const repository of input.repositories) {
      insertRepository.run(
        input.runId,
        repository.githubId,
        repository.nodeId,
        repository.organizationLogin,
        repository.nameWithOwner,
        repository.visibility,
        repository.isArchived ? 1 : 0,
        repository.isFork ? 1 : 0,
        repository.updatedAt
      );
    }
    for (const team of input.teams) {
      insertTeam.run(
        input.runId,
        team.githubId,
        team.nodeId,
        team.organizationLogin,
        team.slug,
        team.name,
        team.privacy
      );
    }
    db.prepare(`
      INSERT INTO assessment_metrics (run_id, metric_key, value)
      VALUES (?, 'organizations', ?)
    `).run(input.runId, input.organizations.length);
    const insertMetric = db.prepare(`
      INSERT INTO assessment_metrics (run_id, metric_key, value)
      VALUES (?, ?, ?)
    `);
    insertMetric.run(input.runId, 'members', input.members.length);
    insertMetric.run(input.runId, 'enterpriseOwners', input.ownerCount);
    insertMetric.run(input.runId, 'repositories', input.repositories.length);
    insertMetric.run(input.runId, 'teams', input.teams.length);
    insertMetric.run(input.runId, 'healthScore', input.evaluation.healthScore);
    insertMetric.run(input.runId, 'assessedDomains', input.evaluation.assessedDomainCount);
    for (const [metricKey, value] of Object.entries(input.evaluation.metrics)) {
      insertMetric.run(input.runId, metricKey, value);
    }
    for (const finding of input.evaluation.findings) {
      insertFinding.run(
        input.runId,
        finding.ruleKey,
        finding.domain,
        finding.severity,
        finding.title,
        finding.summary,
        finding.recommendation,
        JSON.stringify(finding.affectedResources)
      );
    }
    for (const securityDefault of input.securityDefaults || []) {
      insertSecurityDefault.run(
        input.runId,
        securityDefault.defaultForNewRepositories,
        securityDefault.configurationId,
        securityDefault.configurationName,
        securityDefault.advancedSecurity,
        securityDefault.dependencyGraph,
        securityDefault.dependabotAlerts,
        securityDefault.codeScanningDefaultSetup,
        securityDefault.secretScanning,
        securityDefault.secretScanningPushProtection,
        securityDefault.enforcement
      );
    }
    for (const repositorySecurity of input.repositorySecurity) {
      insertRepositorySecurity.run(
        input.runId,
        repositorySecurity.nameWithOwner,
        repositorySecurity.visibility,
        repositorySecurity.isArchived ? 1 : 0,
        repositorySecurity.isFork ? 1 : 0,
        repositorySecurity.defaultBranch,
        repositorySecurity.codeSecurity,
        repositorySecurity.codeScanningDefaultSetup,
        repositorySecurity.secretScanning,
        repositorySecurity.secretScanningPushProtection,
        repositorySecurity.dependabotAlerts,
        repositorySecurity.dependabotSecurityUpdates,
        repositorySecurity.configurationStatus,
        repositorySecurity.configurationId,
        repositorySecurity.configurationName,
        repositorySecurity.configurationEnforcement
      );
    }
    for (const repositoryRules of input.repositoryRules) {
      insertRepositoryRules.run(
        input.runId,
        repositoryRules.nameWithOwner,
        repositoryRules.visibility,
        repositoryRules.isArchived ? 1 : 0,
        repositoryRules.isFork ? 1 : 0,
        repositoryRules.defaultBranch,
        nullableBooleanToInteger(repositoryRules.branchExists),
        nullableBooleanToInteger(repositoryRules.classicProtection),
        nullableBooleanToInteger(repositoryRules.hasProtection),
        repositoryRules.activeRulesetIds === null
          ? null
          : JSON.stringify(repositoryRules.activeRulesetIds),
        repositoryRules.activeRulesetSources === null
          ? null
          : JSON.stringify(repositoryRules.activeRulesetSources),
        repositoryRules.ruleTypes === null ? null : JSON.stringify(repositoryRules.ruleTypes),
        nullableBooleanToInteger(repositoryRules.requiresPullRequest),
        repositoryRules.requiredApprovingReviewCount,
        nullableBooleanToInteger(repositoryRules.requiresStatusChecks),
        nullableBooleanToInteger(repositoryRules.blocksForcePushes),
        nullableBooleanToInteger(repositoryRules.blocksDeletions),
        nullableBooleanToInteger(repositoryRules.enforcesAdmins)
      );
    }
    for (const failure of input.repositoryRulesFailures) {
      insertRepositoryRulesFailure.run(
        input.runId,
        failure.nameWithOwner,
        failure.check,
        failure.error
      );
    }
    if (input.actionsPolicy) {
      db.prepare(`
        INSERT INTO assessment_actions_policies
          (run_id, enabled_organizations, allowed_actions, sha_pinning_required)
        VALUES (?, ?, ?, ?)
      `).run(
        input.runId,
        input.actionsPolicy.enabledOrganizations,
        input.actionsPolicy.allowedActions,
        input.actionsPolicy.shaPinningRequired ? 1 : 0
      );
    }
    if (input.actionsEvidence) {
      const selected = input.actionsEvidence.selectedActions;
      const workflow = input.actionsEvidence.workflowPermissions;
      const fork = input.actionsEvidence.forkPullRequestPolicy;
      const runnerPolicy = input.actionsEvidence.selfHostedRunnerPolicy;
      insertActionsDetails.run(
        input.runId,
        nullableBooleanToInteger(selected?.githubOwnedAllowed),
        nullableBooleanToInteger(selected?.verifiedAllowed),
        selected?.patternsAllowed ? JSON.stringify(selected.patternsAllowed) : null,
        workflow?.defaultWorkflowPermissions ?? null,
        nullableBooleanToInteger(workflow?.canApprovePullRequestReviews),
        nullableBooleanToInteger(fork?.runWorkflowsFromForkPullRequests),
        nullableBooleanToInteger(fork?.sendWriteTokensToWorkflows),
        nullableBooleanToInteger(fork?.sendSecretsAndVariables),
        nullableBooleanToInteger(fork?.requireApprovalForForkPullRequestWorkflows),
        nullableBooleanToInteger(runnerPolicy?.disabledForAllOrganizations)
      );
      for (const runnerGroup of input.actionsEvidence.runnerGroups ?? []) {
        insertActionsRunnerGroup.run(
          input.runId,
          runnerGroup.githubId,
          runnerGroup.name,
          runnerGroup.visibility,
          runnerGroup.isDefault ? 1 : 0,
          runnerGroup.allowsPublicRepositories ? 1 : 0,
          runnerGroup.restrictedToWorkflows === null
            ? -1
            : runnerGroup.restrictedToWorkflows ? 1 : 0,
          JSON.stringify(runnerGroup.selectedWorkflows)
        );
      }
      for (const runner of input.actionsEvidence.runners ?? []) {
        insertActionsRunner.run(
          input.runId,
          runner.githubId,
          runner.runnerGroupId,
          runner.name,
          runner.os,
          runner.status,
          runner.busy ? 1 : 0,
          runner.ephemeral ? 1 : 0,
          runner.version,
          JSON.stringify(runner.labels)
        );
      }
      for (const failure of input.actionsEvidence.failures) {
        insertActionsFailure.run(input.runId, failure.check, failure.error);
      }
    }
    for (const seat of input.copilotSeats?.seats || []) {
      insertCopilotSeat.run(
        input.runId,
        seat.login,
        seat.planType,
        seat.createdAt,
        seat.lastAuthenticatedAt,
        seat.lastActivityAt,
        seat.pendingCancellationDate,
        seat.assignmentCount
      );
    }
    for (const budget of input.budgets || []) {
      insertBudget.run(
        input.runId,
        budget.id,
        budget.budgetType,
        budget.productSku,
        budget.scope,
        budget.amount,
        budget.consumedAmount,
        budget.preventsFurtherUsage ? 1 : 0,
        budget.alertingEnabled ? 1 : 0,
        budget.alertRecipientCount,
        budget.entityName,
        budget.user,
        budget.expiresAt
      );
    }
    db.prepare(`
      INSERT INTO assessment_collector_results
        (id, run_id, collector_key, status, item_count, duration_ms)
      VALUES (?, ?, 'organizations', 'completed', ?, ?)
    `).run(
      input.organizationCollector.id,
      input.runId,
      input.organizations.length,
      input.organizationCollector.durationMs
    );
    db.prepare(`
      INSERT INTO assessment_collector_results
        (id, run_id, collector_key, status, item_count, duration_ms)
      VALUES (?, ?, 'identity', 'completed', ?, ?)
    `).run(
      input.identityCollector.id,
      input.runId,
      input.members.length,
      input.identityCollector.durationMs
    );
    db.prepare(`
      INSERT INTO assessment_collector_results
        (id, run_id, collector_key, status, item_count, duration_ms, error)
      VALUES (?, ?, 'repositories', ?, ?, ?, ?)
    `).run(
      input.repositoryCollector.id,
      input.runId,
      input.repositoryFailures.length > 0 ? 'partial' : 'completed',
      input.repositories.length,
      input.repositoryCollector.durationMs,
      formatAssessmentFailures(input.repositoryFailures)
    );
    db.prepare(`
      INSERT INTO assessment_collector_results
        (id, run_id, collector_key, status, item_count, duration_ms, error)
      VALUES (?, ?, 'teams', ?, ?, ?, ?)
    `).run(
      input.teamCollector.id,
      input.runId,
      input.teamFailures.length > 0 ? 'partial' : 'completed',
      input.teams.length,
      input.teamCollector.durationMs,
      formatAssessmentFailures(input.teamFailures)
    );
    db.prepare(`
      INSERT INTO assessment_collector_results
        (id, run_id, collector_key, status, item_count, duration_ms, error)
      VALUES (?, ?, 'security', ?, ?, ?, ?)
    `).run(
      input.securityCollector.id,
      input.runId,
      input.securityCollector.error ? 'failed' : 'completed',
      input.securityDefaults?.length || 0,
      input.securityCollector.durationMs,
      input.securityCollector.error
    );
    db.prepare(`
      INSERT INTO assessment_collector_results
        (id, run_id, collector_key, status, item_count, duration_ms, error)
      VALUES (?, ?, 'repositorySecurity', ?, ?, ?, ?)
    `).run(
      input.repositorySecurityCollector.id,
      input.runId,
      input.repositorySecurityFailures.length > 0 ? 'partial' : 'completed',
      input.repositorySecurity.length,
      input.repositorySecurityCollector.durationMs,
      formatRepositorySecurityFailures(input.repositorySecurityFailures)
    );
    db.prepare(`
      INSERT INTO assessment_collector_results
        (id, run_id, collector_key, status, item_count, duration_ms, error)
      VALUES (?, ?, 'repositoryRules', ?, ?, ?, ?)
    `).run(
      input.repositoryRulesCollector.id,
      input.runId,
      input.repositoryRulesFailures.length > 0 ? 'partial' : 'completed',
      input.repositoryRules.length,
      input.repositoryRulesCollector.durationMs,
      formatRepositoryRulesFailures(input.repositoryRulesFailures)
    );
    db.prepare(`
      INSERT INTO assessment_collector_results
        (id, run_id, collector_key, status, item_count, duration_ms, error)
      VALUES (?, ?, 'actions', ?, ?, ?, ?)
    `).run(
      input.actionsCollector.id,
      input.runId,
      input.actionsCollector.error ? 'failed' : 'completed',
      input.actionsPolicy ? 1 : 0,
      input.actionsCollector.durationMs,
      input.actionsCollector.error
    );
    const actionsDepthFailures = input.actionsEvidence?.failures ?? [];
    db.prepare(`
      INSERT INTO assessment_collector_results
        (id, run_id, collector_key, status, item_count, duration_ms, error)
      VALUES (?, ?, 'actionsDepth', ?, ?, ?, ?)
    `).run(
      input.actionsDepthCollector.id,
      input.runId,
      input.actionsDepthCollector.error
        ? 'failed'
        : actionsDepthFailures.length > 0 ? 'partial' : 'completed',
      input.actionsEvidence
        ? (input.actionsEvidence.runnerGroups?.length ?? 0)
          + (input.actionsEvidence.runners?.length ?? 0)
          + [
            input.actionsEvidence.selectedActions,
            input.actionsEvidence.workflowPermissions,
            input.actionsEvidence.forkPullRequestPolicy,
            input.actionsEvidence.selfHostedRunnerPolicy,
          ].filter(Boolean).length
        : 0,
      input.actionsDepthCollector.durationMs,
      input.actionsDepthCollector.error ?? formatActionsFailures(actionsDepthFailures)
    );
    db.prepare(`
      INSERT INTO assessment_collector_results
        (id, run_id, collector_key, status, item_count, duration_ms, error)
      VALUES (?, ?, 'copilot', ?, ?, ?, ?)
    `).run(
      input.copilotCollector.id,
      input.runId,
      input.copilotCollector.error ? 'failed' : 'completed',
      input.copilotSeats?.totalSeats || 0,
      input.copilotCollector.durationMs,
      input.copilotCollector.error
    );
    db.prepare(`
      INSERT INTO assessment_collector_results
        (id, run_id, collector_key, status, item_count, duration_ms, error)
      VALUES (?, ?, 'billing', ?, ?, ?, ?)
    `).run(
      input.billingCollector.id,
      input.runId,
      input.billingCollector.error ? 'failed' : 'completed',
      input.budgets?.length || 0,
      input.billingCollector.durationMs,
      input.billingCollector.error
    );
    db.prepare(`
      UPDATE assessment_runs
      SET status = 'completed', completed_at = datetime('now'), duration_ms = ?
      WHERE id = ?
    `).run(input.durationMs, input.runId);
  });
  complete();
}

export function failAssessmentRun(input: {
  runId: string;
  collectorResultId: string;
  durationMs: number;
  error: string;
  collectorKey: 'organizations' | 'identity' | 'repositories' | 'teams';
}) {
  const db = getDb();
  const fail = db.transaction(() => {
    db.prepare(`
      INSERT INTO assessment_collector_results
        (id, run_id, collector_key, status, item_count, duration_ms, error)
      VALUES (?, ?, ?, 'failed', 0, ?, ?)
    `).run(input.collectorResultId, input.runId, input.collectorKey, input.durationMs, input.error);
    db.prepare(`
      UPDATE assessment_runs
      SET status = 'failed', completed_at = datetime('now'), duration_ms = ?, error = ?
      WHERE id = ?
    `).run(input.durationMs, input.error, input.runId);
  });
  fail();
}

export function getLatestAssessment(environmentId: string) {
  const run = getDb().prepare(`
    SELECT * FROM assessment_runs
    WHERE environment_id = ? AND status = 'completed'
    ORDER BY started_at DESC, rowid DESC
    LIMIT 1
  `).get(environmentId) as AssessmentRunRow | undefined;
  return run ? getAssessmentSnapshot(run) : null;
}

function formatAssessmentFailures(failures: Array<{ organizationLogin: string; error: string }>): string | null {
  if (failures.length === 0) return null;
  return failures
    .map(failure => `${failure.organizationLogin}: ${failure.error.replace(/\s+/g, ' ').trim()}`)
    .join('\n');
}

function formatRepositorySecurityFailures(
  failures: AssessmentRepositorySecurityFailure[]
): string | null {
  if (failures.length === 0) return null;
  return failures
    .map(failure => (
      `${failure.nameWithOwner} [${failure.check}]: ${failure.error.replace(/\s+/g, ' ').trim()}`
    ))
    .join('\n');
}

function formatRepositoryRulesFailures(
  failures: AssessmentRepositoryRulesFailure[]
): string | null {
  if (failures.length === 0) return null;
  return failures
    .map(failure => (
      `${failure.nameWithOwner} [${failure.check}]: ${failure.error.replace(/\s+/g, ' ').trim()}`
    ))
    .join('\n');
}

function formatActionsFailures(
  failures: AssessmentActionsEvidence['failures']
): string | null {
  if (failures.length === 0) return null;
  return failures
    .map(failure => `${failure.check}: ${failure.error.replace(/\s+/g, ' ').trim()}`)
    .join('\n');
}

export function getAssessmentById(runId: string) {
  const run = getDb().prepare('SELECT * FROM assessment_runs WHERE id = ?').get(runId) as AssessmentRunRow | undefined;
  return run ? getAssessmentSnapshot(run) : null;
}

function getAssessmentSnapshot(run: AssessmentRunRow) {
  const metrics = getDb().prepare(
    'SELECT metric_key, value FROM assessment_metrics WHERE run_id = ?'
  ).all(run.id) as Array<{ metric_key: string; value: number }>;
  const collectors = getDb().prepare(`
    SELECT collector_key, status, item_count, duration_ms, error
    FROM assessment_collector_results
    WHERE run_id = ?
    ORDER BY collector_key
  `).all(run.id);
  const findings = getDb().prepare(`
    SELECT rule_key, domain, severity, title, summary, recommendation, affected_resources
    FROM assessment_findings
    WHERE run_id = ?
    ORDER BY
      CASE severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        ELSE 4
      END,
      title
  `).all(run.id) as Array<{
    rule_key: string;
    domain: string;
    severity: string;
    title: string;
    summary: string;
    recommendation: string;
    affected_resources: string;
  }>;
  const repositorySecurity = getDb().prepare(`
    SELECT name_with_owner, visibility, is_archived, is_fork, default_branch, code_security,
      code_scanning_default_setup, secret_scanning, secret_scanning_push_protection, dependabot_alerts,
      dependabot_security_updates, configuration_status, configuration_id,
      configuration_name, configuration_enforcement
    FROM assessment_repository_security
    WHERE run_id = ?
    ORDER BY name_with_owner
  `).all(run.id) as Array<{
    name_with_owner: string;
    visibility: string;
    is_archived: number;
    is_fork: number;
    default_branch: string | null;
    code_security: string | null;
    code_scanning_default_setup: string | null;
    secret_scanning: string | null;
    secret_scanning_push_protection: string | null;
    dependabot_alerts: string | null;
    dependabot_security_updates: string | null;
    configuration_status: string | null;
    configuration_id: number | null;
    configuration_name: string | null;
    configuration_enforcement: string | null;
  }>;
  const repositoryRules = getDb().prepare(`
    SELECT name_with_owner, visibility, is_archived, is_fork, default_branch,
      branch_exists, classic_protection, has_protection, active_ruleset_ids,
      active_ruleset_sources, rule_types, requires_pull_request,
      required_approving_review_count, requires_status_checks, blocks_force_pushes,
      blocks_deletions, enforces_admins
    FROM assessment_repository_rules
    WHERE run_id = ?
    ORDER BY name_with_owner
  `).all(run.id) as Array<{
    name_with_owner: string;
    visibility: string;
    is_archived: number;
    is_fork: number;
    default_branch: string | null;
    branch_exists: number | null;
    classic_protection: number | null;
    has_protection: number | null;
    active_ruleset_ids: string | null;
    active_ruleset_sources: string | null;
    rule_types: string | null;
    requires_pull_request: number | null;
    required_approving_review_count: number | null;
    requires_status_checks: number | null;
    blocks_force_pushes: number | null;
    blocks_deletions: number | null;
    enforces_admins: number | null;
  }>;
  const actionsDetails = getDb().prepare(`
    SELECT github_owned_allowed, verified_allowed, patterns_allowed,
      default_workflow_permissions, can_approve_pull_request_reviews,
      run_workflows_from_fork_pull_requests, send_write_tokens_to_workflows,
      send_secrets_and_variables, require_approval_for_fork_pr_workflows,
      self_hosted_runners_disabled_for_all_orgs
    FROM assessment_actions_details
    WHERE run_id = ?
  `).get(run.id) as {
    github_owned_allowed: number | null;
    verified_allowed: number | null;
    patterns_allowed: string | null;
    default_workflow_permissions: string | null;
    can_approve_pull_request_reviews: number | null;
    run_workflows_from_fork_pull_requests: number | null;
    send_write_tokens_to_workflows: number | null;
    send_secrets_and_variables: number | null;
    require_approval_for_fork_pr_workflows: number | null;
    self_hosted_runners_disabled_for_all_orgs: number | null;
  } | undefined;
  const actionsRunnerGroups = getDb().prepare(`
    SELECT github_id, name, visibility, is_default, allows_public_repositories,
      restricted_to_workflows, selected_workflows
    FROM assessment_actions_runner_groups
    WHERE run_id = ?
    ORDER BY name
  `).all(run.id) as Array<{
    github_id: number;
    name: string;
    visibility: string;
    is_default: number;
    allows_public_repositories: number;
    restricted_to_workflows: number;
    selected_workflows: string;
  }>;
  const actionsRunners = getDb().prepare(`
    SELECT github_id, runner_group_id, name, os, status, busy, ephemeral, version, labels
    FROM assessment_actions_runners
    WHERE run_id = ?
    ORDER BY name
  `).all(run.id) as Array<{
    github_id: number;
    runner_group_id: number | null;
    name: string;
    os: string;
    status: string;
    busy: number;
    ephemeral: number;
    version: string | null;
    labels: string;
  }>;
  const actionsFailures = getDb().prepare(`
    SELECT check_key, error
    FROM assessment_actions_failures
    WHERE run_id = ?
    ORDER BY check_key
  `).all(run.id) as Array<{
    check_key: AssessmentActionsEvidence['failures'][number]['check'];
    error: string;
  }>;
  const failedActionsChecks = new Set(actionsFailures.map(failure => failure.check_key));

  return {
    id: run.id,
    environmentId: run.environment_id,
    status: run.status,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    durationMs: run.duration_ms,
    error: run.error,
    metrics: Object.fromEntries(metrics.map(metric => [metric.metric_key, metric.value])),
    collectors,
    repositorySecurity: repositorySecurity.map(repository => ({
      nameWithOwner: repository.name_with_owner,
      visibility: repository.visibility,
      isArchived: repository.is_archived === 1,
      isFork: repository.is_fork === 1,
      defaultBranch: repository.default_branch,
      codeSecurity: repository.code_security,
      codeScanningDefaultSetup: repository.code_scanning_default_setup,
      secretScanning: repository.secret_scanning,
      secretScanningPushProtection: repository.secret_scanning_push_protection,
      dependabotAlerts: repository.dependabot_alerts,
      dependabotSecurityUpdates: repository.dependabot_security_updates,
      configurationStatus: repository.configuration_status,
      configurationId: repository.configuration_id,
      configurationName: repository.configuration_name,
      configurationEnforcement: repository.configuration_enforcement,
    })),
    repositoryRules: repositoryRules.map(repository => ({
      nameWithOwner: repository.name_with_owner,
      visibility: repository.visibility,
      isArchived: repository.is_archived === 1,
      isFork: repository.is_fork === 1,
      defaultBranch: repository.default_branch,
      branchExists: nullableIntegerToBoolean(repository.branch_exists),
      classicProtection: nullableIntegerToBoolean(repository.classic_protection),
      hasProtection: nullableIntegerToBoolean(repository.has_protection),
      activeRulesetIds: repository.active_ruleset_ids === null
        ? null
        : JSON.parse(repository.active_ruleset_ids) as number[],
      activeRulesetSources: repository.active_ruleset_sources === null
        ? null
        : JSON.parse(repository.active_ruleset_sources) as string[],
      ruleTypes: repository.rule_types === null
        ? null
        : JSON.parse(repository.rule_types) as string[],
      requiresPullRequest: nullableIntegerToBoolean(repository.requires_pull_request),
      requiredApprovingReviewCount: repository.required_approving_review_count,
      requiresStatusChecks: nullableIntegerToBoolean(repository.requires_status_checks),
      blocksForcePushes: nullableIntegerToBoolean(repository.blocks_force_pushes),
      blocksDeletions: nullableIntegerToBoolean(repository.blocks_deletions),
      enforcesAdmins: nullableIntegerToBoolean(repository.enforces_admins),
    })),
    actionsEvidence: actionsDetails ? {
      selectedActions:
        actionsDetails.github_owned_allowed === null
        && actionsDetails.verified_allowed === null
        && actionsDetails.patterns_allowed === null
          ? null
          : {
              githubOwnedAllowed: actionsDetails.github_owned_allowed === null
                ? null
                : actionsDetails.github_owned_allowed === 1,
              verifiedAllowed: actionsDetails.verified_allowed === null
                ? null
                : actionsDetails.verified_allowed === 1,
              patternsAllowed: actionsDetails.patterns_allowed === null
                ? null
                : JSON.parse(actionsDetails.patterns_allowed) as string[],
            },
      workflowPermissions: actionsDetails.default_workflow_permissions === null ? null : {
        defaultWorkflowPermissions: actionsDetails.default_workflow_permissions,
        canApprovePullRequestReviews:
          actionsDetails.can_approve_pull_request_reviews === 1,
      },
      forkPullRequestPolicy:
        actionsDetails.run_workflows_from_fork_pull_requests === null ? null : {
          runWorkflowsFromForkPullRequests:
            actionsDetails.run_workflows_from_fork_pull_requests === 1,
          sendWriteTokensToWorkflows: actionsDetails.send_write_tokens_to_workflows === 1,
          sendSecretsAndVariables: actionsDetails.send_secrets_and_variables === 1,
          requireApprovalForForkPullRequestWorkflows:
            actionsDetails.require_approval_for_fork_pr_workflows === 1,
        },
      selfHostedRunnerPolicy:
        actionsDetails.self_hosted_runners_disabled_for_all_orgs === null ? null : {
          disabledForAllOrganizations:
            actionsDetails.self_hosted_runners_disabled_for_all_orgs === 1,
        },
      runnerGroups: failedActionsChecks.has('runner-groups')
        ? null
        : actionsRunnerGroups.map(group => ({
            githubId: group.github_id,
            name: group.name,
            visibility: group.visibility,
            isDefault: group.is_default === 1,
            allowsPublicRepositories: group.allows_public_repositories === 1,
            restrictedToWorkflows: group.restricted_to_workflows === -1
              ? null
              : group.restricted_to_workflows === 1,
            selectedWorkflows: JSON.parse(group.selected_workflows) as string[] | null,
          })),
      runners: failedActionsChecks.has('self-hosted-runners')
        ? null
        : actionsRunners.map(runner => ({
            githubId: runner.github_id,
            runnerGroupId: runner.runner_group_id,
            name: runner.name,
            os: runner.os,
            status: runner.status,
            busy: runner.busy === 1,
            ephemeral: runner.ephemeral === 1,
            version: runner.version,
            labels: JSON.parse(runner.labels) as string[],
          })),
      failures: actionsFailures.map(failure => ({
        check: failure.check_key,
        error: failure.error,
      })),
    } : null,
    findings: findings.map(finding => ({
      ruleKey: finding.rule_key,
      domain: finding.domain,
      severity: finding.severity,
      title: finding.title,
      summary: finding.summary,
      recommendation: finding.recommendation,
      affectedResources: JSON.parse(finding.affected_resources) as string[],
    })),
  };
}
