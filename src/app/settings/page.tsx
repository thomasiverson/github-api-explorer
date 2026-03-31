'use client';

import React, { useState, useEffect } from 'react';
import { TopBar } from '@/components/TopBar';

interface EnvironmentRow {
  id: string; name: string; base_url: string; enterprise_slug: string;
  org_name: string; auth_method: string; is_active: number;
}

interface Variable {
  id: string; name: string; value: string;
}

export default function SettingsPage() {
  const [environments, setEnvironments] = useState<EnvironmentRow[]>([]);
  const [editingEnv, setEditingEnv] = useState<Partial<EnvironmentRow> & { token?: string; appId?: string; privateKey?: string; installationId?: string } | null>(null);
  const [validationResult, setValidationResult] = useState<{ valid?: boolean; user?: string; error?: string } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [importStatus, setImportStatus] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [selectedEnvForVars, setSelectedEnvForVars] = useState<string>('');

  useEffect(() => { loadEnvironments(); }, []);

  useEffect(() => {
    if (selectedEnvForVars) loadVariables(selectedEnvForVars);
  }, [selectedEnvForVars]);

  async function loadEnvironments() {
    const res = await fetch('/api/environments');
    const envs = await res.json();
    setEnvironments(envs);
    const active = envs.find((e: EnvironmentRow) => e.is_active === 1);
    if (active && !selectedEnvForVars) setSelectedEnvForVars(active.id);
  }

  async function loadVariables(envId: string) {
    const res = await fetch(`/api/variables?environmentId=${envId}`);
    setVariables(await res.json());
  }

  async function saveVariable(name: string, value: string, id?: string) {
    await fetch('/api/variables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set', environmentId: selectedEnvForVars, id, name, value }),
    });
    loadVariables(selectedEnvForVars);
  }

  async function deleteVar(id: string) {
    await fetch('/api/variables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    loadVariables(selectedEnvForVars);
  }

  async function saveEnvironment() {
    if (!editingEnv) return;
    const isNew = !editingEnv.id;
    const body: Record<string, unknown> = {
      action: isNew ? 'create' : 'update',
      name: editingEnv.name,
      baseUrl: editingEnv.base_url,
      enterpriseSlug: editingEnv.enterprise_slug,
      orgName: editingEnv.org_name,
      authMethod: editingEnv.auth_method,
    };
    if (!isNew) body.id = editingEnv.id;
    if (editingEnv.auth_method === 'pat' && editingEnv.token) {
      body.token = editingEnv.token;
    }
    if (editingEnv.auth_method === 'github-app') {
      body.appCredentials = {
        appId: editingEnv.appId,
        privateKey: editingEnv.privateKey,
        installationId: editingEnv.installationId,
      };
    }

    await fetch('/api/environments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setEditingEnv(null);
    loadEnvironments();
  }

  async function deleteEnv(id: string) {
    await fetch('/api/environments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    loadEnvironments();
  }

  async function validateEnv(id: string) {
    setIsValidating(true);
    setValidationResult(null);
    const res = await fetch('/api/environments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'validate', id }),
    });
    setValidationResult(await res.json());
    setIsValidating(false);
  }

  async function reimportSpec() {
    setIsImporting(true);
    setImportStatus('Importing...');
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specVersion: 'api.github.com' }),
      });
      const data = await res.json();
      if (data.error) {
        setImportStatus(`Error: ${data.error}`);
      } else {
        setImportStatus(`Imported ${data.count} endpoints across ${data.categories} categories (${data.total} total)`);
      }
    } catch (err: unknown) {
      setImportStatus(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setIsImporting(false);
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-8 px-6 space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
            <p className="text-sm text-text-secondary mt-1">Manage environments, authentication, and API catalog</p>
          </div>

          {/* Environments */}
          <section className="bg-panel border border-border rounded-lg overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-medium text-text-primary">Environments</h2>
              <button
                onClick={() => setEditingEnv({
                  name: '', base_url: 'https://api.github.com', enterprise_slug: '',
                  org_name: '', auth_method: 'pat'
                })}
                className="px-3 py-1.5 bg-accent-emphasis text-white text-sm rounded-md hover:opacity-90 transition-opacity"
              >
                + New Environment
              </button>
            </div>

            {environments.length === 0 && !editingEnv && (
              <div className="p-8 text-center">
                <p className="text-text-secondary text-sm">No environments configured</p>
                <p className="text-text-muted text-xs mt-1">Create one to get started</p>
              </div>
            )}

            {environments.map(env => (
              <div key={env.id} className="p-4 border-b border-border flex items-center gap-4">
                <div className={`w-2 h-2 rounded-full ${env.is_active ? 'bg-success' : 'bg-text-muted'}`} />
                <div className="flex-1">
                  <div className="font-medium text-text-primary text-sm">{env.name}</div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    {env.base_url} · {env.auth_method} · {env.enterprise_slug || 'no slug'}
                  </div>
                </div>
                <button onClick={() => validateEnv(env.id)}
                  className="px-2.5 py-1 text-xs text-text-secondary border border-border rounded-md hover:bg-surface transition-colors">
                  Test
                </button>
                <button onClick={() => setEditingEnv(env)}
                  className="px-2.5 py-1 text-xs text-text-secondary border border-border rounded-md hover:bg-surface transition-colors">
                  Edit
                </button>
                <button onClick={() => deleteEnv(env.id)}
                  className="px-2.5 py-1 text-xs text-danger border border-border rounded-md hover:bg-surface transition-colors">
                  Delete
                </button>
              </div>
            ))}

            {/* Validation result */}
            {validationResult && (
              <div className={`p-4 border-b border-border ${validationResult.valid ? 'bg-success/10' : 'bg-danger/10'}`}>
                {validationResult.valid ? (
                  <p className="text-sm text-success">✓ Connected as <strong>{validationResult.user}</strong></p>
                ) : (
                  <p className="text-sm text-danger">✗ {validationResult.error}</p>
                )}
              </div>
            )}
            {isValidating && (
              <div className="p-4 border-b border-border text-sm text-text-secondary">Validating...</div>
            )}
          </section>

          {/* Edit/Create form */}
          {editingEnv && (
            <section className="bg-panel border border-border rounded-lg p-4 space-y-4">
              <h3 className="font-medium text-text-primary">
                {editingEnv.id ? 'Edit Environment' : 'New Environment'}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-text-secondary block mb-1">Name</label>
                  <input type="text" value={editingEnv.name || ''} onChange={e => setEditingEnv(p => p ? { ...p, name: e.target.value } : p)}
                    placeholder="e.g. TPI Test EMU" className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
                </div>
                <div>
                  <label className="text-sm text-text-secondary block mb-1">API Base URL</label>
                  <input type="text" value={editingEnv.base_url || ''} onChange={e => setEditingEnv(p => p ? { ...p, base_url: e.target.value } : p)}
                    placeholder="https://api.github.com" className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
                </div>
                <div>
                  <label className="text-sm text-text-secondary block mb-1">Enterprise Slug</label>
                  <input type="text" value={editingEnv.enterprise_slug || ''} onChange={e => setEditingEnv(p => p ? { ...p, enterprise_slug: e.target.value } : p)}
                    placeholder="e.g. tpitest" className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
                </div>
                <div>
                  <label className="text-sm text-text-secondary block mb-1">Organization Login</label>
                  <input type="text" value={editingEnv.org_name || ''} onChange={e => setEditingEnv(p => p ? { ...p, org_name: e.target.value } : p)}
                    placeholder="e.g. tpitest-org" className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
                  <p className="text-xs text-text-muted mt-1">The org slug from the URL, not the display name. Used for {'{org}'} and {'{owner}'} params.</p>
                </div>
              </div>

              {/* Auth method */}
              <div>
                <label className="text-sm text-text-secondary block mb-1">Auth Method</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                    <input type="radio" checked={editingEnv.auth_method === 'pat'}
                      onChange={() => setEditingEnv(p => p ? { ...p, auth_method: 'pat' } : p)} className="accent-accent" />
                    Personal Access Token
                  </label>
                  <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                    <input type="radio" checked={editingEnv.auth_method === 'github-app'}
                      onChange={() => setEditingEnv(p => p ? { ...p, auth_method: 'github-app' } : p)} className="accent-accent" />
                    GitHub App
                  </label>
                </div>
              </div>

              {editingEnv.auth_method === 'pat' && (
                <div>
                  <label className="text-sm text-text-secondary block mb-1">Token</label>
                  <input type="password" value={editingEnv.token || ''} onChange={e => setEditingEnv(p => p ? { ...p, token: e.target.value } : p)}
                    placeholder="ghp_... or github_pat_..." className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
                </div>
              )}

              {editingEnv.auth_method === 'github-app' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-text-secondary block mb-1">App ID</label>
                    <input type="text" value={editingEnv.appId || ''} onChange={e => setEditingEnv(p => p ? { ...p, appId: e.target.value } : p)}
                      placeholder="12345" className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
                  </div>
                  <div>
                    <label className="text-sm text-text-secondary block mb-1">Installation ID</label>
                    <input type="text" value={editingEnv.installationId || ''} onChange={e => setEditingEnv(p => p ? { ...p, installationId: e.target.value } : p)}
                      placeholder="67890" className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm text-text-secondary block mb-1">Private Key (PEM)</label>
                    <textarea value={editingEnv.privateKey || ''} onChange={e => setEditingEnv(p => p ? { ...p, privateKey: e.target.value } : p)}
                      placeholder="-----BEGIN RSA PRIVATE KEY-----" rows={4}
                      className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text-primary font-mono resize-y focus:outline-none focus:ring-1 focus:ring-accent" />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={saveEnvironment}
                  className="px-4 py-1.5 bg-accent-emphasis text-white text-sm rounded-md hover:opacity-90 transition-opacity">
                  Save
                </button>
                <button onClick={() => setEditingEnv(null)}
                  className="px-4 py-1.5 border border-border text-text-secondary text-sm rounded-md hover:bg-surface transition-colors">
                  Cancel
                </button>
              </div>
            </section>
          )}

          {/* Environment Variables */}
          <section className="bg-panel border border-border rounded-lg overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="text-lg font-medium text-text-primary">Environment Variables</h2>
              <p className="text-xs text-text-secondary mt-0.5">
                Define custom variables like <code className="px-1 py-0.5 bg-surface rounded text-accent text-[11px]">{'{{repo}}'}</code>,{' '}
                <code className="px-1 py-0.5 bg-surface rounded text-accent text-[11px]">{'{{username}}'}</code> — they auto-fill in any parameter field
              </p>
            </div>
            <div className="p-4">
              <select
                value={selectedEnvForVars}
                onChange={e => setSelectedEnvForVars(e.target.value)}
                className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary mb-3 focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {environments.map(env => (
                  <option key={env.id} value={env.id}>{env.name}</option>
                ))}
              </select>
              <div className="space-y-2">
                {variables.map(v => (
                  <div key={v.id} className="flex items-center gap-2">
                    <input type="text" defaultValue={v.name} readOnly
                      className="w-40 bg-surface border border-border rounded-md px-3 py-1.5 text-sm font-mono text-text-primary" />
                    <input type="text" defaultValue={v.value}
                      onBlur={e => saveVariable(v.name, e.target.value, v.id)}
                      className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
                    <button onClick={() => deleteVar(v.id)}
                      className="text-text-muted hover:text-danger p-1">✕</button>
                  </div>
                ))}
                <VariableAddRow onAdd={(name, value) => saveVariable(name, value)} />
              </div>
            </div>
          </section>

          {/* API Catalog */}
          <section className="bg-panel border border-border rounded-lg overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-text-primary">API Catalog</h2>
                <p className="text-xs text-text-secondary mt-0.5">Auto-imported from GitHub&apos;s OpenAPI spec</p>
              </div>
              <button onClick={reimportSpec} disabled={isImporting}
                className="px-3 py-1.5 border border-border text-text-secondary text-sm rounded-md hover:bg-surface disabled:opacity-50 transition-colors">
                {isImporting ? 'Importing...' : 'Refresh Catalog'}
              </button>
            </div>
            {importStatus && (
              <div className="p-4 text-sm text-text-secondary">{importStatus}</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function VariableAddRow({ onAdd }: { onAdd: (name: string, value: string) => void }) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');

  function handleAdd() {
    if (!name.trim()) return;
    onAdd(name.trim(), value);
    setName('');
    setValue('');
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <input type="text" value={name} onChange={e => setName(e.target.value)}
        placeholder="variable_name" onKeyDown={e => e.key === 'Enter' && handleAdd()}
        className="w-40 bg-surface border border-border rounded-md px-3 py-1.5 text-sm font-mono text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent" />
      <input type="text" value={value} onChange={e => setValue(e.target.value)}
        placeholder="value" onKeyDown={e => e.key === 'Enter' && handleAdd()}
        className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-sm font-mono text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent" />
      <button onClick={handleAdd}
        className="px-3 py-1.5 text-sm text-accent border border-border rounded-md hover:bg-surface transition-colors">Add</button>
    </div>
  );
}
