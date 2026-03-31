import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

const DB_PATH = path.join(process.cwd(), 'data', 'harness.db');

let _db: Database.Database | null = null;

function ensureDataDir() {
  const fs = require('fs');
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
  `);
}

// === Encryption Helpers ===

function getEncryptionKey(): Buffer {
  let key = process.env.ENCRYPTION_KEY;
  if (!key || key.length === 0) {
    // Auto-generate and persist if missing
    const fs = require('fs');
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

export function getEndpointCategories(): Array<{ category: string; count: number }> {
  return getDb().prepare(`
    SELECT category, COUNT(*) as count FROM endpoints GROUP BY category ORDER BY category
  `).all() as Array<{ category: string; count: number }>;
}

export function getEndpointsByCategory(category: string) {
  return getDb().prepare(
    'SELECT * FROM endpoints WHERE category = ? ORDER BY path, method'
  ).all(category);
}

export function searchEndpoints(query: string, limit = 50) {
  const pattern = `%${query}%`;
  return getDb().prepare(`
    SELECT * FROM endpoints
    WHERE operation_id LIKE ? OR path LIKE ? OR summary LIKE ? OR category LIKE ?
    ORDER BY category, path, method
    LIMIT ?
  `).all(pattern, pattern, pattern, pattern, limit);
}

export function getEndpointCount(): number {
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

export function insertEndpoint(endpoint: {
  id: string; category: string; subcategory: string; operationId: string;
  method: string; path: string; summary: string; description: string;
  pathParams: string; queryParams: string; bodySchema: string | null;
  responseSchema: string | null; isDeprecated: boolean; specVersion: string;
}) {
  getDb().prepare(`
    INSERT OR REPLACE INTO endpoints
    (id, category, subcategory, operation_id, method, path, summary, description,
     path_params, query_params, body_schema, response_schema, is_deprecated, spec_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    endpoint.id, endpoint.category, endpoint.subcategory, endpoint.operationId,
    endpoint.method, endpoint.path, endpoint.summary, endpoint.description,
    endpoint.pathParams, endpoint.queryParams, endpoint.bodySchema,
    endpoint.responseSchema, endpoint.isDeprecated ? 1 : 0, endpoint.specVersion
  );
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
