import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import type { ImportedEndpoint } from './openapi-import';
import type {
  AssessmentActionsEvidence,
  AssessmentActionsPolicy,
  AssessmentBillingEvidence,
  AssessmentBudget,
  AssessmentCopilotEvidence,
  AssessmentCopilotSeatInventory,
  AssessmentEvaluation,
  AssessmentOrganizationAccess,
  AssessmentOrganizationAccessFailure,
  AssessmentRepositoryAccess,
  AssessmentRepositoryAccessFailure,
  AssessmentRepositoryRules,
  AssessmentRepositoryRulesFailure,
  AssessmentRepositorySecurity,
  AssessmentRepositorySecurityFailure,
  AssessmentRulesetDetail,
  AssessmentRulesetDetailFailure,
  AssessmentSecurityDefault,
  AssessmentScimInventory,
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

    CREATE TABLE IF NOT EXISTS assessment_organization_access (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      organization_login TEXT NOT NULL,
      default_repository_permission TEXT,
      members_can_create_repositories INTEGER,
      members_can_create_public_repositories INTEGER,
      members_can_create_private_repositories INTEGER,
      members_can_create_internal_repositories INTEGER,
      members_can_fork_private_repositories INTEGER,
      two_factor_requirement_enabled INTEGER,
      admin_logins TEXT,
      outside_collaborator_logins TEXT,
      PRIMARY KEY(run_id, organization_login)
    );

    CREATE TABLE IF NOT EXISTS assessment_organization_access_failures (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      organization_login TEXT NOT NULL,
      check_key TEXT NOT NULL,
      error TEXT NOT NULL,
      PRIMARY KEY(run_id, organization_login, check_key)
    );

    CREATE TABLE IF NOT EXISTS assessment_repository_access (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      name_with_owner TEXT NOT NULL,
      visibility TEXT NOT NULL,
      is_archived INTEGER NOT NULL DEFAULT 0,
      is_fork INTEGER NOT NULL DEFAULT 0,
      direct_collaborators_available INTEGER NOT NULL DEFAULT 0,
      team_grants_available INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(run_id, name_with_owner)
    );

    CREATE TABLE IF NOT EXISTS assessment_repository_direct_collaborators (
      run_id TEXT NOT NULL,
      name_with_owner TEXT NOT NULL,
      login TEXT NOT NULL,
      role_name TEXT NOT NULL,
      permission TEXT NOT NULL,
      PRIMARY KEY(run_id, name_with_owner, login),
      FOREIGN KEY(run_id, name_with_owner)
        REFERENCES assessment_repository_access(run_id, name_with_owner) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assessment_repository_team_grants (
      run_id TEXT NOT NULL,
      name_with_owner TEXT NOT NULL,
      team_slug TEXT NOT NULL,
      team_name TEXT NOT NULL,
      permission TEXT NOT NULL,
      PRIMARY KEY(run_id, name_with_owner, team_slug),
      FOREIGN KEY(run_id, name_with_owner)
        REFERENCES assessment_repository_access(run_id, name_with_owner) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assessment_repository_access_failures (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      name_with_owner TEXT NOT NULL,
      check_key TEXT NOT NULL,
      error TEXT NOT NULL,
      PRIMARY KEY(run_id, name_with_owner, check_key)
    );

    CREATE TABLE IF NOT EXISTS assessment_scim_inventory (
      run_id TEXT PRIMARY KEY REFERENCES assessment_runs(id) ON DELETE CASCADE,
      total_results INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assessment_scim_identities (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      scim_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      display_name TEXT,
      active INTEGER NOT NULL,
      roles TEXT NOT NULL,
      PRIMARY KEY(run_id, scim_id)
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
      active_rulesets TEXT,
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

    CREATE TABLE IF NOT EXISTS assessment_rulesets (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      github_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      target TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source TEXT NOT NULL,
      enforcement TEXT NOT NULL,
      conditions TEXT NOT NULL,
      rule_types TEXT NOT NULL,
      applied_repositories TEXT NOT NULL,
      PRIMARY KEY(run_id, github_id)
    );

    CREATE TABLE IF NOT EXISTS assessment_ruleset_bypass_actors (
      run_id TEXT NOT NULL,
      ruleset_id INTEGER NOT NULL,
      ordinal INTEGER NOT NULL,
      actor_id INTEGER,
      actor_type TEXT NOT NULL,
      bypass_mode TEXT NOT NULL,
      PRIMARY KEY(run_id, ruleset_id, ordinal),
      FOREIGN KEY(run_id, ruleset_id)
        REFERENCES assessment_rulesets(run_id, github_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assessment_ruleset_failures (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      ruleset_id INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      source TEXT NOT NULL,
      error TEXT NOT NULL,
      PRIMARY KEY(run_id, ruleset_id, source_type, source)
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
      last_activity_editor TEXT,
      pending_cancellation_date TEXT,
      assignment_count INTEGER NOT NULL DEFAULT 1,
      assignment_sources TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY(run_id, login)
    );

    CREATE TABLE IF NOT EXISTS assessment_copilot_governance (
      run_id TEXT PRIMARY KEY REFERENCES assessment_runs(id) ON DELETE CASCADE,
      content_exclusion_rule_count INTEGER
    );

    CREATE TABLE IF NOT EXISTS assessment_copilot_organizations (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      organization_login TEXT NOT NULL,
      seat_total INTEGER,
      seats_added_this_cycle INTEGER,
      seats_pending_cancellation INTEGER,
      seats_pending_invitation INTEGER,
      active_seats_this_cycle INTEGER,
      inactive_seats_this_cycle INTEGER,
      plan_type TEXT,
      seat_management_setting TEXT,
      public_code_suggestions TEXT,
      ide_chat TEXT,
      platform_chat TEXT,
      cli TEXT,
      coding_agent_repository_scope TEXT,
      PRIMARY KEY(run_id, organization_login)
    );

    CREATE TABLE IF NOT EXISTS assessment_copilot_failures (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      scope TEXT NOT NULL,
      check_key TEXT NOT NULL,
      error TEXT NOT NULL,
      PRIMARY KEY(run_id, scope, check_key)
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
      alert_recipients TEXT NOT NULL DEFAULT '[]',
      entity_name TEXT,
      user_login TEXT,
      expires_at TEXT,
      PRIMARY KEY(run_id, budget_id)
    );

    CREATE TABLE IF NOT EXISTS assessment_cost_centers (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      cost_center_id TEXT NOT NULL,
      name TEXT NOT NULL,
      state TEXT NOT NULL,
      azure_subscription TEXT,
      ai_credit_pool_enabled INTEGER NOT NULL DEFAULT 0,
      ai_credit_pool_target_amount REAL,
      ai_credit_pool_current_amount REAL,
      resources_available INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(run_id, cost_center_id)
    );

    CREATE TABLE IF NOT EXISTS assessment_cost_center_resources (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      cost_center_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      resource_type TEXT NOT NULL,
      resource_name TEXT NOT NULL,
      PRIMARY KEY(run_id, cost_center_id, ordinal)
    );

    CREATE TABLE IF NOT EXISTS assessment_effective_budgets (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      user_login TEXT NOT NULL,
      budget_id TEXT,
      amount REAL,
      consumed_amount REAL,
      applicable_budget_ids TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY(run_id, user_login)
    );

    CREATE TABLE IF NOT EXISTS assessment_budget_user_states (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      budget_id TEXT NOT NULL,
      user_login TEXT NOT NULL,
      consumed_amount REAL NOT NULL,
      target_amount REAL NOT NULL,
      override_budget_id TEXT,
      PRIMARY KEY(run_id, budget_id, user_login)
    );

    CREATE TABLE IF NOT EXISTS assessment_billing_usage (
      run_id TEXT PRIMARY KEY REFERENCES assessment_runs(id) ON DELETE CASCADE,
      period_year INTEGER NOT NULL,
      period_month INTEGER,
      period_day INTEGER,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assessment_billing_failures (
      run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
      scope TEXT NOT NULL,
      check_key TEXT NOT NULL,
      error TEXT NOT NULL,
      PRIMARY KEY(run_id, scope, check_key)
    );
  `);

  const repositorySecurityColumns = db.prepare(
    'PRAGMA table_info(assessment_repository_security)'
  ).all() as Array<{ name: string }>;
  if (!repositorySecurityColumns.some(column => column.name === 'default_branch')) {
    db.exec('ALTER TABLE assessment_repository_security ADD COLUMN default_branch TEXT');
  }
  const repositoryRulesColumns = db.prepare(
    'PRAGMA table_info(assessment_repository_rules)'
  ).all() as Array<{ name: string }>;
  if (!repositoryRulesColumns.some(column => column.name === 'active_rulesets')) {
    db.exec('ALTER TABLE assessment_repository_rules ADD COLUMN active_rulesets TEXT');
  }
  const copilotSeatColumns = db.prepare(
    'PRAGMA table_info(assessment_copilot_seats)'
  ).all() as Array<{ name: string }>;
  if (!copilotSeatColumns.some(column => column.name === 'last_activity_editor')) {
    db.exec('ALTER TABLE assessment_copilot_seats ADD COLUMN last_activity_editor TEXT');
  }
  if (!copilotSeatColumns.some(column => column.name === 'assignment_sources')) {
    db.exec("ALTER TABLE assessment_copilot_seats ADD COLUMN assignment_sources TEXT NOT NULL DEFAULT '[]'");
  }
  const budgetColumns = db.prepare(
    'PRAGMA table_info(assessment_budgets)'
  ).all() as Array<{ name: string }>;
  if (!budgetColumns.some(column => column.name === 'alert_recipients')) {
    db.exec("ALTER TABLE assessment_budgets ADD COLUMN alert_recipients TEXT NOT NULL DEFAULT '[]'");
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
  organizationAccessCollector: { id: string; durationMs: number };
  repositoryCollector: { id: string; durationMs: number };
  repositoryAccessCollector: { id: string; durationMs: number };
  teamCollector: { id: string; durationMs: number };
  securityCollector: { id: string; durationMs: number; error: string | null };
  repositorySecurityCollector: { id: string; durationMs: number };
  repositoryRulesCollector: { id: string; durationMs: number };
  rulesetDetailsCollector: { id: string; durationMs: number };
  actionsCollector: { id: string; durationMs: number; error: string | null };
  actionsDepthCollector: { id: string; durationMs: number; error: string | null };
  copilotCollector: { id: string; durationMs: number; error: string | null };
  copilotDepthCollector: { id: string; durationMs: number; error: string | null };
  billingCollector: { id: string; durationMs: number; error: string | null };
  billingDepthCollector: { id: string; durationMs: number; error: string | null };
  scimCollector: { id: string; durationMs: number; error: string | null };
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
  organizationAccess: AssessmentOrganizationAccess[];
  organizationAccessFailures: AssessmentOrganizationAccessFailure[];
  repositoryAccess: AssessmentRepositoryAccess[];
  repositoryAccessFailures: AssessmentRepositoryAccessFailure[];
  scim: AssessmentScimInventory | null;
  securityDefaults: AssessmentSecurityDefault[] | null;
  repositorySecurity: AssessmentRepositorySecurity[];
  repositorySecurityFailures: AssessmentRepositorySecurityFailure[];
  repositoryRules: AssessmentRepositoryRules[];
  repositoryRulesFailures: AssessmentRepositoryRulesFailure[];
  rulesets: AssessmentRulesetDetail[];
  rulesetDetailFailures: AssessmentRulesetDetailFailure[];
  actionsPolicy: AssessmentActionsPolicy | null;
  actionsEvidence: AssessmentActionsEvidence | null;
  copilotSeats: AssessmentCopilotSeatInventory | null;
  copilotEvidence: AssessmentCopilotEvidence | null;
  budgets: AssessmentBudget[] | null;
  billingEvidence: AssessmentBillingEvidence | null;
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
  const insertOrganizationAccess = db.prepare(`
    INSERT INTO assessment_organization_access
      (run_id, organization_login, default_repository_permission,
       members_can_create_repositories, members_can_create_public_repositories,
       members_can_create_private_repositories, members_can_create_internal_repositories,
       members_can_fork_private_repositories, two_factor_requirement_enabled,
       admin_logins, outside_collaborator_logins)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertOrganizationAccessFailure = db.prepare(`
    INSERT INTO assessment_organization_access_failures
      (run_id, organization_login, check_key, error)
    VALUES (?, ?, ?, ?)
  `);
  const insertRepositoryAccess = db.prepare(`
    INSERT INTO assessment_repository_access
      (run_id, name_with_owner, visibility, is_archived, is_fork,
       direct_collaborators_available, team_grants_available)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRepositoryDirectCollaborator = db.prepare(`
    INSERT INTO assessment_repository_direct_collaborators
      (run_id, name_with_owner, login, role_name, permission)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertRepositoryTeamGrant = db.prepare(`
    INSERT INTO assessment_repository_team_grants
      (run_id, name_with_owner, team_slug, team_name, permission)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertRepositoryAccessFailure = db.prepare(`
    INSERT INTO assessment_repository_access_failures
      (run_id, name_with_owner, check_key, error)
    VALUES (?, ?, ?, ?)
  `);
  const insertScimIdentity = db.prepare(`
    INSERT INTO assessment_scim_identities
      (run_id, scim_id, user_name, display_name, active, roles)
    VALUES (?, ?, ?, ?, ?, ?)
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
        active_ruleset_sources, active_rulesets, rule_types, requires_pull_request,
       required_approving_review_count, requires_status_checks, blocks_force_pushes,
       blocks_deletions, enforces_admins)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRepositoryRulesFailure = db.prepare(`
    INSERT INTO assessment_repository_rules_failures
      (run_id, name_with_owner, check_key, error)
    VALUES (?, ?, ?, ?)
  `);
  const insertRuleset = db.prepare(`
    INSERT INTO assessment_rulesets
      (run_id, github_id, name, target, source_type, source, enforcement,
       conditions, rule_types, applied_repositories)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRulesetBypassActor = db.prepare(`
    INSERT INTO assessment_ruleset_bypass_actors
      (run_id, ruleset_id, ordinal, actor_id, actor_type, bypass_mode)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertRulesetFailure = db.prepare(`
    INSERT INTO assessment_ruleset_failures
      (run_id, ruleset_id, source_type, source, error)
    VALUES (?, ?, ?, ?, ?)
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
       last_activity_editor, pending_cancellation_date, assignment_count, assignment_sources)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCopilotOrganization = db.prepare(`
    INSERT INTO assessment_copilot_organizations
      (run_id, organization_login, seat_total, seats_added_this_cycle,
       seats_pending_cancellation, seats_pending_invitation, active_seats_this_cycle,
       inactive_seats_this_cycle, plan_type, seat_management_setting,
       public_code_suggestions, ide_chat, platform_chat, cli,
       coding_agent_repository_scope)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCopilotFailure = db.prepare(`
    INSERT INTO assessment_copilot_failures (run_id, scope, check_key, error)
    VALUES (?, ?, ?, ?)
  `);
  const insertBudget = db.prepare(`
    INSERT INTO assessment_budgets
      (run_id, budget_id, budget_type, product_sku, scope, amount, consumed_amount,
       prevents_further_usage, alerting_enabled, alert_recipient_count, alert_recipients,
       entity_name, user_login, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCostCenter = db.prepare(`
    INSERT INTO assessment_cost_centers
      (run_id, cost_center_id, name, state, azure_subscription,
       ai_credit_pool_enabled, ai_credit_pool_target_amount,
       ai_credit_pool_current_amount, resources_available)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCostCenterResource = db.prepare(`
    INSERT INTO assessment_cost_center_resources
      (run_id, cost_center_id, ordinal, resource_type, resource_name)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertEffectiveBudget = db.prepare(`
    INSERT INTO assessment_effective_budgets
      (run_id, user_login, budget_id, amount, consumed_amount, applicable_budget_ids)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertBudgetUserState = db.prepare(`
    INSERT INTO assessment_budget_user_states
      (run_id, budget_id, user_login, consumed_amount, target_amount, override_budget_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertBillingFailure = db.prepare(`
    INSERT INTO assessment_billing_failures (run_id, scope, check_key, error)
    VALUES (?, ?, ?, ?)
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
    for (const organization of input.organizationAccess) {
      insertOrganizationAccess.run(
        input.runId,
        organization.organizationLogin,
        organization.defaultRepositoryPermission,
        nullableBooleanToInteger(organization.membersCanCreateRepositories),
        nullableBooleanToInteger(organization.membersCanCreatePublicRepositories),
        nullableBooleanToInteger(organization.membersCanCreatePrivateRepositories),
        nullableBooleanToInteger(organization.membersCanCreateInternalRepositories),
        nullableBooleanToInteger(organization.membersCanForkPrivateRepositories),
        nullableBooleanToInteger(organization.twoFactorRequirementEnabled),
        organization.adminLogins === null ? null : JSON.stringify(organization.adminLogins),
        organization.outsideCollaboratorLogins === null
          ? null
          : JSON.stringify(organization.outsideCollaboratorLogins)
      );
    }
    for (const failure of input.organizationAccessFailures) {
      insertOrganizationAccessFailure.run(
        input.runId,
        failure.organizationLogin,
        failure.check,
        failure.error
      );
    }
    for (const repository of input.repositoryAccess) {
      insertRepositoryAccess.run(
        input.runId,
        repository.nameWithOwner,
        repository.visibility,
        repository.isArchived ? 1 : 0,
        repository.isFork ? 1 : 0,
        repository.directCollaborators === null ? 0 : 1,
        repository.teamGrants === null ? 0 : 1
      );
      for (const collaborator of repository.directCollaborators ?? []) {
        insertRepositoryDirectCollaborator.run(
          input.runId,
          repository.nameWithOwner,
          collaborator.login,
          collaborator.roleName,
          collaborator.permission
        );
      }
      for (const team of repository.teamGrants ?? []) {
        insertRepositoryTeamGrant.run(
          input.runId,
          repository.nameWithOwner,
          team.slug,
          team.name,
          team.permission
        );
      }
    }
    for (const failure of input.repositoryAccessFailures) {
      insertRepositoryAccessFailure.run(
        input.runId,
        failure.nameWithOwner,
        failure.check,
        failure.error
      );
    }
    if (input.scim) {
      db.prepare(`
        INSERT INTO assessment_scim_inventory (run_id, total_results)
        VALUES (?, ?)
      `).run(input.runId, input.scim.totalResults);
      for (const identity of input.scim.identities) {
        insertScimIdentity.run(
          input.runId,
          identity.scimId,
          identity.userName,
          identity.displayName,
          identity.active ? 1 : 0,
          JSON.stringify(identity.roles)
        );
      }
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
        repositoryRules.activeRulesets === null
          ? null
          : JSON.stringify(repositoryRules.activeRulesets),
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
    for (const ruleset of input.rulesets) {
      insertRuleset.run(
        input.runId,
        ruleset.githubId,
        ruleset.name,
        ruleset.target,
        ruleset.sourceType,
        ruleset.source,
        ruleset.enforcement,
        JSON.stringify(ruleset.conditions),
        JSON.stringify(ruleset.ruleTypes),
        JSON.stringify(ruleset.appliedRepositories)
      );
      ruleset.bypassActors.forEach((actor, index) => {
        insertRulesetBypassActor.run(
          input.runId,
          ruleset.githubId,
          index,
          actor.actorId,
          actor.actorType,
          actor.bypassMode
        );
      });
    }
    for (const failure of input.rulesetDetailFailures) {
      insertRulesetFailure.run(
        input.runId,
        failure.githubId,
        failure.sourceType,
        failure.source,
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
        seat.lastActivityEditor,
        seat.pendingCancellationDate,
        seat.assignmentCount,
        JSON.stringify(seat.assignmentSources)
      );
    }
    if (input.copilotEvidence) {
      db.prepare(`
        INSERT INTO assessment_copilot_governance (run_id, content_exclusion_rule_count)
        VALUES (?, ?)
      `).run(input.runId, input.copilotEvidence.contentExclusionRuleCount);
      for (const organization of input.copilotEvidence.organizations) {
        insertCopilotOrganization.run(
          input.runId,
          organization.organizationLogin,
          organization.seatTotal,
          organization.seatsAddedThisCycle,
          organization.seatsPendingCancellation,
          organization.seatsPendingInvitation,
          organization.activeSeatsThisCycle,
          organization.inactiveSeatsThisCycle,
          organization.planType,
          organization.seatManagementSetting,
          organization.publicCodeSuggestions,
          organization.ideChat,
          organization.platformChat,
          organization.cli,
          organization.codingAgentRepositoryScope
        );
      }
      for (const failure of input.copilotEvidence.failures) {
        insertCopilotFailure.run(
          input.runId,
          failure.scope,
          failure.check,
          failure.error
        );
      }
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
        JSON.stringify(budget.alertRecipients),
        budget.entityName,
        budget.user,
        budget.expiresAt
      );
    }
    if (input.billingEvidence) {
      for (const costCenter of input.billingEvidence.costCenters) {
        insertCostCenter.run(
          input.runId,
          costCenter.id,
          costCenter.name,
          costCenter.state,
          costCenter.azureSubscription,
          costCenter.aiCreditPoolEnabled ? 1 : 0,
          costCenter.aiCreditPoolTargetAmount,
          costCenter.aiCreditPoolCurrentAmount,
          costCenter.resources === null ? 0 : 1
        );
        for (const [index, resource] of (costCenter.resources ?? []).entries()) {
          insertCostCenterResource.run(
            input.runId,
            costCenter.id,
            index,
            resource.type,
            resource.name
          );
        }
      }
      for (const budget of input.billingEvidence.effectiveBudgets) {
        insertEffectiveBudget.run(
          input.runId,
          budget.user,
          budget.budgetId,
          budget.amount,
          budget.consumedAmount,
          JSON.stringify(budget.applicableBudgetIds)
        );
      }
      for (const state of input.billingEvidence.multiUserBudgetStates) {
        insertBudgetUserState.run(
          input.runId,
          state.budgetId,
          state.user,
          state.consumedAmount,
          state.targetAmount,
          state.overrideBudgetId
        );
      }
      if (input.billingEvidence.usage) {
        db.prepare(`
          INSERT INTO assessment_billing_usage
            (run_id, period_year, period_month, period_day, items)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          input.runId,
          input.billingEvidence.usage.year,
          input.billingEvidence.usage.month,
          input.billingEvidence.usage.day,
          JSON.stringify(input.billingEvidence.usage.items)
        );
      }
      for (const failure of input.billingEvidence.failures) {
        insertBillingFailure.run(
          input.runId,
          failure.scope,
          failure.check,
          failure.error
        );
      }
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
      VALUES (?, ?, 'organizationAccess', ?, ?, ?, ?)
    `).run(
      input.organizationAccessCollector.id,
      input.runId,
      input.organizationAccessFailures.length > 0 ? 'partial' : 'completed',
      input.organizationAccess.length,
      input.organizationAccessCollector.durationMs,
      formatOrganizationAccessFailures(input.organizationAccessFailures)
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
      VALUES (?, ?, 'repositoryAccess', ?, ?, ?, ?)
    `).run(
      input.repositoryAccessCollector.id,
      input.runId,
      input.repositoryAccessFailures.length > 0 ? 'partial' : 'completed',
      input.repositoryAccess.length,
      input.repositoryAccessCollector.durationMs,
      formatRepositoryAccessFailures(input.repositoryAccessFailures)
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
      VALUES (?, ?, 'rulesetDetails', ?, ?, ?, ?)
    `).run(
      input.rulesetDetailsCollector.id,
      input.runId,
      input.rulesetDetailFailures.length > 0 ? 'partial' : 'completed',
      input.rulesets.length,
      input.rulesetDetailsCollector.durationMs,
      formatRulesetDetailFailures(input.rulesetDetailFailures)
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
    const copilotDepthFailures = input.copilotEvidence?.failures ?? [];
    db.prepare(`
      INSERT INTO assessment_collector_results
        (id, run_id, collector_key, status, item_count, duration_ms, error)
      VALUES (?, ?, 'copilotDepth', ?, ?, ?, ?)
    `).run(
      input.copilotDepthCollector.id,
      input.runId,
      input.copilotDepthCollector.error
        ? 'failed'
        : copilotDepthFailures.length > 0 ? 'partial' : 'completed',
      input.copilotEvidence
        ? input.copilotEvidence.organizations.length
          + (input.copilotEvidence.contentExclusionRuleCount ?? 0)
        : 0,
      input.copilotDepthCollector.durationMs,
      input.copilotDepthCollector.error ?? formatCopilotFailures(copilotDepthFailures)
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
    const billingDepthFailures = input.billingEvidence?.failures ?? [];
    db.prepare(`
      INSERT INTO assessment_collector_results
        (id, run_id, collector_key, status, item_count, duration_ms, error)
      VALUES (?, ?, 'billingDepth', ?, ?, ?, ?)
    `).run(
      input.billingDepthCollector.id,
      input.runId,
      input.billingDepthCollector.error
        ? 'failed'
        : billingDepthFailures.length > 0 ? 'partial' : 'completed',
      input.billingEvidence
        ? input.billingEvidence.costCenters.length
          + input.billingEvidence.effectiveBudgets.length
          + input.billingEvidence.multiUserBudgetStates.length
          + (input.billingEvidence.usage?.items.length ?? 0)
        : 0,
      input.billingDepthCollector.durationMs,
      input.billingDepthCollector.error ?? formatBillingFailures(billingDepthFailures)
    );
    db.prepare(`
      INSERT INTO assessment_collector_results
        (id, run_id, collector_key, status, item_count, duration_ms, error)
      VALUES (?, ?, 'scim', ?, ?, ?, ?)
    `).run(
      input.scimCollector.id,
      input.runId,
      input.scimCollector.error ? 'failed' : 'completed',
      input.scim?.identities.length ?? 0,
      input.scimCollector.durationMs,
      input.scimCollector.error
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

function formatRulesetDetailFailures(
  failures: AssessmentRulesetDetailFailure[]
): string | null {
  if (failures.length === 0) return null;
  return failures
    .map(failure => (
      `${failure.sourceType} ${failure.source} [${failure.githubId}]: ${failure.error.replace(/\s+/g, ' ').trim()}`
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

function formatCopilotFailures(
  failures: AssessmentCopilotEvidence['failures']
): string | null {
  if (failures.length === 0) return null;
  return failures
    .map(failure => (
      `${failure.scope} [${failure.check}]: ${failure.error.replace(/\s+/g, ' ').trim()}`
    ))
    .join('\n');
}

function formatBillingFailures(
  failures: AssessmentBillingEvidence['failures']
): string | null {
  if (failures.length === 0) return null;
  return failures
    .map(failure => (
      `${failure.scope} [${failure.check}]: ${failure.error.replace(/\s+/g, ' ').trim()}`
    ))
    .join('\n');
}

function formatOrganizationAccessFailures(
  failures: AssessmentOrganizationAccessFailure[]
): string | null {
  if (failures.length === 0) return null;
  return failures
    .map(failure => (
      `${failure.organizationLogin} [${failure.check}]: ${failure.error.replace(/\s+/g, ' ').trim()}`
    ))
    .join('\n');
}

function formatRepositoryAccessFailures(
  failures: AssessmentRepositoryAccessFailure[]
): string | null {
  if (failures.length === 0) return null;
  return failures
    .map(failure => (
      `${failure.nameWithOwner} [${failure.check}]: ${failure.error.replace(/\s+/g, ' ').trim()}`
    ))
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
  `).all(run.id) as Array<{
    collector_key: string;
    status: string;
    item_count: number;
    duration_ms: number;
    error: string | null;
  }>;
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
  const organizationAccess = getDb().prepare(`
    SELECT organization_login, default_repository_permission,
      members_can_create_repositories, members_can_create_public_repositories,
      members_can_create_private_repositories, members_can_create_internal_repositories,
      members_can_fork_private_repositories, two_factor_requirement_enabled,
      admin_logins, outside_collaborator_logins
    FROM assessment_organization_access
    WHERE run_id = ?
    ORDER BY organization_login
  `).all(run.id) as Array<{
    organization_login: string;
    default_repository_permission: string | null;
    members_can_create_repositories: number | null;
    members_can_create_public_repositories: number | null;
    members_can_create_private_repositories: number | null;
    members_can_create_internal_repositories: number | null;
    members_can_fork_private_repositories: number | null;
    two_factor_requirement_enabled: number | null;
    admin_logins: string | null;
    outside_collaborator_logins: string | null;
  }>;
  const repositoryAccess = getDb().prepare(`
    SELECT name_with_owner, visibility, is_archived, is_fork,
      direct_collaborators_available, team_grants_available
    FROM assessment_repository_access
    WHERE run_id = ?
    ORDER BY name_with_owner
  `).all(run.id) as Array<{
    name_with_owner: string;
    visibility: string;
    is_archived: number;
    is_fork: number;
    direct_collaborators_available: number;
    team_grants_available: number;
  }>;
  const directCollaborators = getDb().prepare(`
    SELECT name_with_owner, login, role_name, permission
    FROM assessment_repository_direct_collaborators
    WHERE run_id = ?
    ORDER BY name_with_owner, login
  `).all(run.id) as Array<{
    name_with_owner: string;
    login: string;
    role_name: string;
    permission: 'admin' | 'maintain' | 'write' | 'triage' | 'read' | 'unknown';
  }>;
  const repositoryTeamGrants = getDb().prepare(`
    SELECT name_with_owner, team_slug, team_name, permission
    FROM assessment_repository_team_grants
    WHERE run_id = ?
    ORDER BY name_with_owner, team_slug
  `).all(run.id) as Array<{
    name_with_owner: string;
    team_slug: string;
    team_name: string;
    permission: string;
  }>;
  const scimInventory = getDb().prepare(`
    SELECT total_results
    FROM assessment_scim_inventory
    WHERE run_id = ?
  `).get(run.id) as { total_results: number } | undefined;
  const scimIdentities = getDb().prepare(`
    SELECT scim_id, user_name, display_name, active, roles
    FROM assessment_scim_identities
    WHERE run_id = ?
    ORDER BY user_name
  `).all(run.id) as Array<{
    scim_id: string;
    user_name: string;
    display_name: string | null;
    active: number;
    roles: string;
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
      active_ruleset_sources, active_rulesets, rule_types, requires_pull_request,
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
    active_rulesets: string | null;
    rule_types: string | null;
    requires_pull_request: number | null;
    required_approving_review_count: number | null;
    requires_status_checks: number | null;
    blocks_force_pushes: number | null;
    blocks_deletions: number | null;
    enforces_admins: number | null;
  }>;
  const rulesets = getDb().prepare(`
    SELECT github_id, name, target, source_type, source, enforcement,
      conditions, rule_types, applied_repositories
    FROM assessment_rulesets
    WHERE run_id = ?
    ORDER BY name, github_id
  `).all(run.id) as Array<{
    github_id: number;
    name: string;
    target: string;
    source_type: string;
    source: string;
    enforcement: string;
    conditions: string;
    rule_types: string;
    applied_repositories: string;
  }>;
  const rulesetBypassActors = getDb().prepare(`
    SELECT ruleset_id, actor_id, actor_type, bypass_mode
    FROM assessment_ruleset_bypass_actors
    WHERE run_id = ?
    ORDER BY ruleset_id, ordinal
  `).all(run.id) as Array<{
    ruleset_id: number;
    actor_id: number | null;
    actor_type: string;
    bypass_mode: string;
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
  const copilotSeats = getDb().prepare(`
    SELECT login, plan_type, created_at, last_authenticated_at, last_activity_at,
      last_activity_editor, pending_cancellation_date, assignment_count, assignment_sources
    FROM assessment_copilot_seats
    WHERE run_id = ?
    ORDER BY login
  `).all(run.id) as Array<{
    login: string;
    plan_type: string;
    created_at: string;
    last_authenticated_at: string | null;
    last_activity_at: string | null;
    last_activity_editor: string | null;
    pending_cancellation_date: string | null;
    assignment_count: number;
    assignment_sources: string;
  }>;
  const copilotGovernance = getDb().prepare(`
    SELECT content_exclusion_rule_count
    FROM assessment_copilot_governance
    WHERE run_id = ?
  `).get(run.id) as { content_exclusion_rule_count: number | null } | undefined;
  const copilotOrganizations = getDb().prepare(`
    SELECT organization_login, seat_total, seats_added_this_cycle,
      seats_pending_cancellation, seats_pending_invitation, active_seats_this_cycle,
      inactive_seats_this_cycle, plan_type, seat_management_setting,
      public_code_suggestions, ide_chat, platform_chat, cli,
      coding_agent_repository_scope
    FROM assessment_copilot_organizations
    WHERE run_id = ?
    ORDER BY organization_login
  `).all(run.id) as Array<{
    organization_login: string;
    seat_total: number | null;
    seats_added_this_cycle: number | null;
    seats_pending_cancellation: number | null;
    seats_pending_invitation: number | null;
    active_seats_this_cycle: number | null;
    inactive_seats_this_cycle: number | null;
    plan_type: string | null;
    seat_management_setting: string | null;
    public_code_suggestions: string | null;
    ide_chat: string | null;
    platform_chat: string | null;
    cli: string | null;
    coding_agent_repository_scope: string | null;
  }>;
  const copilotFailures = getDb().prepare(`
    SELECT scope, check_key, error
    FROM assessment_copilot_failures
    WHERE run_id = ?
    ORDER BY scope, check_key
  `).all(run.id) as Array<{
    scope: string;
    check_key: AssessmentCopilotEvidence['failures'][number]['check'];
    error: string;
  }>;
  const budgets = getDb().prepare(`
    SELECT budget_id, budget_type, product_sku, scope, amount, consumed_amount,
      prevents_further_usage, alerting_enabled, alert_recipient_count,
      alert_recipients, entity_name, user_login, expires_at
    FROM assessment_budgets
    WHERE run_id = ?
    ORDER BY product_sku, scope, entity_name, user_login
  `).all(run.id) as Array<{
    budget_id: string;
    budget_type: string;
    product_sku: string;
    scope: string;
    amount: number;
    consumed_amount: number | null;
    prevents_further_usage: number;
    alerting_enabled: number;
    alert_recipient_count: number;
    alert_recipients: string;
    entity_name: string | null;
    user_login: string | null;
    expires_at: string | null;
  }>;
  const costCenters = getDb().prepare(`
    SELECT cost_center_id, name, state, azure_subscription, ai_credit_pool_enabled,
      ai_credit_pool_target_amount, ai_credit_pool_current_amount, resources_available
    FROM assessment_cost_centers
    WHERE run_id = ?
    ORDER BY name
  `).all(run.id) as Array<{
    cost_center_id: string;
    name: string;
    state: string;
    azure_subscription: string | null;
    ai_credit_pool_enabled: number;
    ai_credit_pool_target_amount: number | null;
    ai_credit_pool_current_amount: number | null;
    resources_available: number;
  }>;
  const costCenterResources = getDb().prepare(`
    SELECT cost_center_id, resource_type, resource_name
    FROM assessment_cost_center_resources
    WHERE run_id = ?
    ORDER BY cost_center_id, ordinal
  `).all(run.id) as Array<{
    cost_center_id: string;
    resource_type: string;
    resource_name: string;
  }>;
  const effectiveBudgets = getDb().prepare(`
    SELECT user_login, budget_id, amount, consumed_amount, applicable_budget_ids
    FROM assessment_effective_budgets
    WHERE run_id = ?
    ORDER BY user_login
  `).all(run.id) as Array<{
    user_login: string;
    budget_id: string | null;
    amount: number | null;
    consumed_amount: number | null;
    applicable_budget_ids: string;
  }>;
  const budgetUserStates = getDb().prepare(`
    SELECT budget_id, user_login, consumed_amount, target_amount, override_budget_id
    FROM assessment_budget_user_states
    WHERE run_id = ?
    ORDER BY budget_id, user_login
  `).all(run.id) as Array<{
    budget_id: string;
    user_login: string;
    consumed_amount: number;
    target_amount: number;
    override_budget_id: string | null;
  }>;
  const billingUsage = getDb().prepare(`
    SELECT period_year, period_month, period_day, items
    FROM assessment_billing_usage
    WHERE run_id = ?
  `).get(run.id) as {
    period_year: number;
    period_month: number | null;
    period_day: number | null;
    items: string;
  } | undefined;
  const billingFailures = getDb().prepare(`
    SELECT scope, check_key, error
    FROM assessment_billing_failures
    WHERE run_id = ?
    ORDER BY scope, check_key
  `).all(run.id) as Array<{
    scope: string;
    check_key: AssessmentBillingEvidence['failures'][number]['check'];
    error: string;
  }>;
  const bypassActorsByRuleset = new Map<number, AssessmentRulesetDetail['bypassActors']>();
  for (const actor of rulesetBypassActors) {
    const actors = bypassActorsByRuleset.get(actor.ruleset_id) ?? [];
    actors.push({
      actorId: actor.actor_id,
      actorType: actor.actor_type,
      bypassMode: actor.bypass_mode,
    });
    bypassActorsByRuleset.set(actor.ruleset_id, actors);
  }
  const failedActionsChecks = new Set(actionsFailures.map(failure => failure.check_key));
  const hasCopilotCollector = collectors.some(
    collector => collector.collector_key === 'copilot'
  );
  const hasCopilotDepthCollector = collectors.some(
    collector => collector.collector_key === 'copilotDepth'
  );
  const hasBillingCollector = collectors.some(
    collector => collector.collector_key === 'billing'
  );
  const hasBillingDepthCollector = collectors.some(
    collector => collector.collector_key === 'billingDepth'
  );
  const costCenterResourcesById = new Map<
    string,
    AssessmentBillingEvidence['costCenters'][number]['resources']
  >();
  for (const resource of costCenterResources) {
    const resources = costCenterResourcesById.get(resource.cost_center_id) ?? [];
    resources.push({
      type: resource.resource_type,
      name: resource.resource_name,
    });
    costCenterResourcesById.set(resource.cost_center_id, resources);
  }
  const directCollaboratorsByRepository = new Map<
    string,
    NonNullable<AssessmentRepositoryAccess['directCollaborators']>
  >();
  for (const collaborator of directCollaborators) {
    const entries = directCollaboratorsByRepository.get(collaborator.name_with_owner) ?? [];
    entries.push({
      login: collaborator.login,
      roleName: collaborator.role_name,
      permission: collaborator.permission,
    });
    directCollaboratorsByRepository.set(collaborator.name_with_owner, entries);
  }
  const teamGrantsByRepository = new Map<
    string,
    NonNullable<AssessmentRepositoryAccess['teamGrants']>
  >();
  for (const team of repositoryTeamGrants) {
    const entries = teamGrantsByRepository.get(team.name_with_owner) ?? [];
    entries.push({
      slug: team.team_slug,
      name: team.team_name,
      permission: team.permission,
    });
    teamGrantsByRepository.set(team.name_with_owner, entries);
  }

  const metricValues = Object.fromEntries(
    metrics.map(metric => [metric.metric_key, metric.value])
  ) as Record<string, number>;

  return {
    id: run.id,
    environmentId: run.environment_id,
    status: run.status,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    durationMs: run.duration_ms,
    error: run.error,
    metrics: metricValues,
    collectors,
    organizationAccess: organizationAccess.map(organization => ({
      organizationLogin: organization.organization_login,
      defaultRepositoryPermission: organization.default_repository_permission,
      membersCanCreateRepositories:
        nullableIntegerToBoolean(organization.members_can_create_repositories),
      membersCanCreatePublicRepositories:
        nullableIntegerToBoolean(organization.members_can_create_public_repositories),
      membersCanCreatePrivateRepositories:
        nullableIntegerToBoolean(organization.members_can_create_private_repositories),
      membersCanCreateInternalRepositories:
        nullableIntegerToBoolean(organization.members_can_create_internal_repositories),
      membersCanForkPrivateRepositories:
        nullableIntegerToBoolean(organization.members_can_fork_private_repositories),
      twoFactorRequirementEnabled:
        nullableIntegerToBoolean(organization.two_factor_requirement_enabled),
      adminLogins: organization.admin_logins === null
        ? null
        : JSON.parse(organization.admin_logins) as string[],
      outsideCollaboratorLogins: organization.outside_collaborator_logins === null
        ? null
        : JSON.parse(organization.outside_collaborator_logins) as string[],
    })),
    repositoryAccess: repositoryAccess.map(repository => ({
      nameWithOwner: repository.name_with_owner,
      visibility: repository.visibility,
      isArchived: repository.is_archived === 1,
      isFork: repository.is_fork === 1,
      directCollaborators: repository.direct_collaborators_available === 1
        ? directCollaboratorsByRepository.get(repository.name_with_owner) ?? []
        : null,
      teamGrants: repository.team_grants_available === 1
        ? teamGrantsByRepository.get(repository.name_with_owner) ?? []
        : null,
    })),
    scim: scimInventory ? {
      totalResults: scimInventory.total_results,
      identities: scimIdentities.map(identity => ({
        scimId: identity.scim_id,
        userName: identity.user_name,
        displayName: identity.display_name,
        active: identity.active === 1,
        roles: JSON.parse(identity.roles) as string[],
      })),
    } : null,
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
      activeRulesets: repository.active_rulesets === null
        ? null
        : JSON.parse(repository.active_rulesets) as AssessmentRepositoryRules['activeRulesets'],
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
    rulesets: rulesets.map(ruleset => ({
      githubId: ruleset.github_id,
      name: ruleset.name,
      target: ruleset.target,
      sourceType: ruleset.source_type,
      source: ruleset.source,
      enforcement: ruleset.enforcement,
      conditions: JSON.parse(ruleset.conditions) as AssessmentRulesetDetail['conditions'],
      ruleTypes: JSON.parse(ruleset.rule_types) as string[],
      appliedRepositories: JSON.parse(ruleset.applied_repositories) as string[],
      bypassActors: bypassActorsByRuleset.get(ruleset.github_id) ?? [],
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
    copilotSeats: hasCopilotCollector ? {
      totalSeats: metricValues.copilotSeats ?? copilotSeats.length,
      rawAssignmentCount: copilotSeats.reduce(
        (total, seat) => total + seat.assignment_count,
        0
      ),
      seats: copilotSeats.map(seat => ({
        login: seat.login,
        planType: seat.plan_type,
        createdAt: seat.created_at,
        lastAuthenticatedAt: seat.last_authenticated_at,
        lastActivityAt: seat.last_activity_at,
        lastActivityEditor: seat.last_activity_editor,
        pendingCancellationDate: seat.pending_cancellation_date,
        assignmentCount: seat.assignment_count,
        assignmentSources: JSON.parse(
          seat.assignment_sources
        ) as AssessmentCopilotSeatInventory['seats'][number]['assignmentSources'],
      })),
    } : null,
    copilotEvidence: hasCopilotDepthCollector ? {
      contentExclusionRuleCount: copilotGovernance?.content_exclusion_rule_count ?? null,
      organizations: copilotOrganizations.map(organization => ({
        organizationLogin: organization.organization_login,
        seatTotal: organization.seat_total,
        seatsAddedThisCycle: organization.seats_added_this_cycle,
        seatsPendingCancellation: organization.seats_pending_cancellation,
        seatsPendingInvitation: organization.seats_pending_invitation,
        activeSeatsThisCycle: organization.active_seats_this_cycle,
        inactiveSeatsThisCycle: organization.inactive_seats_this_cycle,
        planType: organization.plan_type,
        seatManagementSetting: organization.seat_management_setting,
        publicCodeSuggestions: organization.public_code_suggestions,
        ideChat: organization.ide_chat,
        platformChat: organization.platform_chat,
        cli: organization.cli,
        codingAgentRepositoryScope: organization.coding_agent_repository_scope,
      })),
      failures: copilotFailures.map(failure => ({
        scope: failure.scope,
        check: failure.check_key,
        error: failure.error,
      })),
    } : null,
    budgets: hasBillingCollector ? budgets.map(budget => ({
      id: budget.budget_id,
      budgetType: budget.budget_type,
      productSku: budget.product_sku,
      scope: budget.scope,
      amount: budget.amount,
      consumedAmount: budget.consumed_amount,
      preventsFurtherUsage: budget.prevents_further_usage === 1,
      alertingEnabled: budget.alerting_enabled === 1,
      alertRecipientCount: budget.alert_recipient_count,
      alertRecipients: JSON.parse(budget.alert_recipients) as string[],
      entityName: budget.entity_name,
      user: budget.user_login,
      expiresAt: budget.expires_at,
    })) : null,
    billingEvidence: hasBillingDepthCollector ? {
      costCenters: costCenters.map(costCenter => ({
        id: costCenter.cost_center_id,
        name: costCenter.name,
        state: costCenter.state,
        azureSubscription: costCenter.azure_subscription,
        aiCreditPoolEnabled: costCenter.ai_credit_pool_enabled === 1,
        aiCreditPoolTargetAmount: costCenter.ai_credit_pool_target_amount,
        aiCreditPoolCurrentAmount: costCenter.ai_credit_pool_current_amount,
        resources: costCenter.resources_available === 1
          ? costCenterResourcesById.get(costCenter.cost_center_id) ?? []
          : null,
      })),
      effectiveBudgets: effectiveBudgets.map(budget => ({
        user: budget.user_login,
        budgetId: budget.budget_id,
        amount: budget.amount,
        consumedAmount: budget.consumed_amount,
        applicableBudgetIds: JSON.parse(budget.applicable_budget_ids) as string[],
      })),
      multiUserBudgetStates: budgetUserStates.map(state => ({
        budgetId: state.budget_id,
        user: state.user_login,
        consumedAmount: state.consumed_amount,
        targetAmount: state.target_amount,
        overrideBudgetId: state.override_budget_id,
      })),
      usage: billingUsage ? {
        year: billingUsage.period_year,
        month: billingUsage.period_month,
        day: billingUsage.period_day,
        items: JSON.parse(
          billingUsage.items
        ) as NonNullable<AssessmentBillingEvidence['usage']>['items'],
      } : null,
      failures: billingFailures.map(failure => ({
        scope: failure.scope,
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
