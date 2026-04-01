'use client';

import React, { useState, useEffect } from 'react';
import { TopBar } from '@/components/TopBar';

interface VersionInfo {
  spec_version: string;
  count: number;
}

interface DiffEntry {
  method: string;
  path: string;
  category: string;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
  summary: string;
  changes?: string[];
  fromEndpoint?: Record<string, unknown>;
  toEndpoint?: Record<string, unknown>;
}

interface DiffResult {
  entries: DiffEntry[];
  summary: {
    added: number; removed: number; changed: number; unchanged: number;
    totalFrom: number; totalTo: number; categories: string[];
  };
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'method-get-bg', POST: 'method-post-bg', PUT: 'method-put-bg',
  PATCH: 'method-patch-bg', DELETE: 'method-delete-bg',
};

const STATUS_COLORS: Record<string, string> = {
  added: 'bg-success/15 text-success',
  removed: 'bg-danger/15 text-danger',
  changed: 'bg-warning/15 text-warning',
  unchanged: 'text-text-muted',
};

const STATUS_LABELS: Record<string, string> = {
  added: '+ Added',
  removed: '− Removed',
  changed: '≠ Changed',
  unchanged: '= Unchanged',
};

export default function ComparePage() {
  const [importedVersions, setImportedVersions] = useState<VersionInfo[]>([]);
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  const [fromVersion, setFromVersion] = useState('');
  const [toVersion, setToVersion] = useState('');
  const [isImporting, setIsImporting] = useState<string | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterQuery, setFilterQuery] = useState('');
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  useEffect(() => { loadVersions(); }, []);

  async function loadVersions() {
    const res = await fetch('/api/compare?action=versions');
    const data = await res.json();
    setImportedVersions(data.imported);
    setAvailableVersions(data.available);
    // Auto-select if only one or two versions imported
    if (data.imported.length >= 2) {
      setFromVersion(data.imported[data.imported.length - 1].spec_version);
      setToVersion(data.imported[0].spec_version);
    } else if (data.imported.length === 1) {
      setFromVersion(data.imported[0].spec_version);
    }
  }

  async function importVersion(version: string) {
    setIsImporting(version);
    try {
      await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specVersion: version }),
      });
      await loadVersions();
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setIsImporting(null);
  }

  async function runCompare() {
    if (!fromVersion || !toVersion) return;
    setIsComparing(true);
    setDiffResult(null);
    try {
      const res = await fetch(`/api/compare?action=diff&from=${encodeURIComponent(fromVersion)}&to=${encodeURIComponent(toVersion)}`);
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        setDiffResult(data);
      }
    } catch (err) {
      alert(`Compare failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setIsComparing(false);
  }

  const importedSet = new Set(importedVersions.map(v => v.spec_version));

  // Filter entries
  const filtered = diffResult?.entries.filter(e => {
    if (filterStatus !== 'all' && e.status !== filterStatus) return false;
    if (filterCategory !== 'all' && e.category !== filterCategory) return false;
    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      if (!e.path.toLowerCase().includes(q) && !e.summary.toLowerCase().includes(q) && !e.category.toLowerCase().includes(q)) return false;
    }
    return true;
  }) || [];

  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto py-8 px-6 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">API Version Comparison</h1>
            <p className="text-sm text-text-secondary mt-1">Compare GitHub REST API endpoints across GHES versions or between GHES and Cloud</p>
          </div>

          {/* Version selector */}
          <div className="bg-panel border border-border rounded-lg p-4">
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="text-sm text-text-secondary block mb-1">From (older)</label>
                <select value={fromVersion} onChange={e => setFromVersion(e.target.value)}
                  className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent">
                  <option value="">Select version...</option>
                  {importedVersions.map(v => (
                    <option key={v.spec_version} value={v.spec_version}>{v.spec_version} ({v.count} endpoints)</option>
                  ))}
                </select>
              </div>
              <div className="text-text-muted text-lg pb-2">→</div>
              <div className="flex-1">
                <label className="text-sm text-text-secondary block mb-1">To (newer)</label>
                <select value={toVersion} onChange={e => setToVersion(e.target.value)}
                  className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent">
                  <option value="">Select version...</option>
                  {importedVersions.map(v => (
                    <option key={v.spec_version} value={v.spec_version}>{v.spec_version} ({v.count} endpoints)</option>
                  ))}
                </select>
              </div>
              <button onClick={runCompare} disabled={!fromVersion || !toVersion || fromVersion === toVersion || isComparing}
                className="px-5 py-2 bg-accent-emphasis text-white text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity">
                {isComparing ? 'Comparing...' : 'Compare'}
              </button>
            </div>

            {/* Import section */}
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-text-secondary mb-2">Import additional versions to compare:</p>
              <div className="flex flex-wrap gap-2">
                {availableVersions.filter(v => !importedSet.has(v)).slice(0, 12).map(v => (
                  <button key={v} onClick={() => importVersion(v)}
                    disabled={isImporting !== null}
                    className="px-2.5 py-1 text-xs border border-border rounded-md text-text-secondary hover:bg-surface disabled:opacity-50 transition-colors">
                    {isImporting === v ? 'Importing...' : `+ ${v}`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results */}
          {diffResult && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-3">
                <SummaryCard label="Added" count={diffResult.summary.added} color="text-success" bg="bg-success/10" active={filterStatus === 'added'} onClick={() => setFilterStatus(filterStatus === 'added' ? 'all' : 'added')} />
                <SummaryCard label="Removed" count={diffResult.summary.removed} color="text-danger" bg="bg-danger/10" active={filterStatus === 'removed'} onClick={() => setFilterStatus(filterStatus === 'removed' ? 'all' : 'removed')} />
                <SummaryCard label="Changed" count={diffResult.summary.changed} color="text-warning" bg="bg-warning/10" active={filterStatus === 'changed'} onClick={() => setFilterStatus(filterStatus === 'changed' ? 'all' : 'changed')} />
                <SummaryCard label="Unchanged" count={diffResult.summary.unchanged} color="text-text-muted" bg="bg-surface" active={filterStatus === 'unchanged'} onClick={() => setFilterStatus(filterStatus === 'unchanged' ? 'all' : 'unchanged')} />
              </div>

              {/* Filters */}
              <div className="flex items-center gap-3">
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent">
                  <option value="all">All statuses</option>
                  <option value="added">Added ({diffResult.summary.added})</option>
                  <option value="removed">Removed ({diffResult.summary.removed})</option>
                  <option value="changed">Changed ({diffResult.summary.changed})</option>
                  <option value="unchanged">Unchanged ({diffResult.summary.unchanged})</option>
                </select>
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                  className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent">
                  <option value="all">All categories</option>
                  {diffResult.summary.categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input type="text" value={filterQuery} onChange={e => setFilterQuery(e.target.value)}
                  placeholder="Search endpoints..."
                  className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent flex-1" />
                <span className="text-xs text-text-muted">{filtered.length} results</span>
              </div>

              {/* Results table */}
              <div className="bg-panel border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-text-secondary text-left">
                      <th className="px-4 py-2 font-medium w-20">Status</th>
                      <th className="px-4 py-2 font-medium w-16">Method</th>
                      <th className="px-4 py-2 font-medium">Path</th>
                      <th className="px-4 py-2 font-medium w-32">Category</th>
                      <th className="px-4 py-2 font-medium">Changes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 200).map(entry => {
                      const entryKey = `${entry.method} ${entry.path}`;
                      const isExpanded = expandedEntry === entryKey;
                      return (
                        <React.Fragment key={entryKey}>
                          <tr
                            className={`border-b border-border/50 hover:bg-surface/30 transition-colors ${entry.status !== 'unchanged' ? 'cursor-pointer' : ''}`}
                            onClick={() => entry.status !== 'unchanged' && setExpandedEntry(isExpanded ? null : entryKey)}
                          >
                            <td className="px-4 py-2">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLORS[entry.status]}`}>
                                {STATUS_LABELS[entry.status]}
                              </span>
                            </td>
                            <td className="px-4 py-2">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${METHOD_COLORS[entry.method] || 'bg-text-muted'}`}>
                                {entry.method}
                              </span>
                            </td>
                            <td className="px-4 py-2 font-mono text-text-primary text-xs truncate max-w-sm" title={entry.path}>
                              {entry.path}
                            </td>
                            <td className="px-4 py-2 text-text-secondary text-xs">{entry.category}</td>
                            <td className="px-4 py-2 text-text-muted text-xs">
                              {entry.changes ? entry.changes.slice(0, 2).join(', ') + (entry.changes.length > 2 ? ` +${entry.changes.length - 2} more` : '') : '—'}
                            </td>
                          </tr>
                          {isExpanded && entry.status !== 'unchanged' && (
                            <tr className="border-b border-border">
                              <td colSpan={5} className="px-4 py-3 bg-surface/30">
                                <EndpointDiffDetail entry={entry} fromVersion={fromVersion} toVersion={toVersion} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-text-muted">No matching endpoints</td></tr>
                    )}
                    {filtered.length > 200 && (
                      <tr><td colSpan={5} className="px-4 py-3 text-center text-text-muted text-xs">Showing first 200 of {filtered.length} results</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, count, color, bg, active, onClick }: {
  label: string; count: number; color: string; bg: string; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`${bg} border rounded-lg p-4 text-center w-full transition-all cursor-pointer hover:opacity-80
        ${active ? 'border-accent ring-2 ring-accent/30' : 'border-border'}`}>
      <div className={`text-2xl font-bold ${color}`}>{count}</div>
      <div className="text-xs text-text-secondary mt-1">{label}</div>
    </button>
  );
}

function EndpointDiffDetail({ entry, fromVersion, toVersion }: {
  entry: DiffEntry; fromVersion: string; toVersion: string;
}) {
  const [activeTab, setActiveTab] = useState<'changes' | 'params' | 'body' | 'response'>('changes');

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${METHOD_COLORS[entry.method]}`}>{entry.method}</span>
        <span className="font-mono text-sm text-text-primary">{entry.path}</span>
        <span className="text-xs text-text-muted ml-auto">{entry.summary}</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3">
        {(['changes', 'params', 'body', 'response'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 text-xs rounded-md ${activeTab === tab
              ? 'bg-accent/20 text-accent font-medium'
              : 'text-text-secondary hover:bg-surface'
            }`}>
            {tab === 'changes' ? `Changes (${entry.changes?.length || 0})` :
             tab === 'params' ? 'Parameters' :
             tab === 'body' ? 'Body Schema' : 'Response Schema'}
          </button>
        ))}
      </div>

      {activeTab === 'changes' && (
        <div className="space-y-1">
          {(entry.changes || []).map((change, i) => (
            <div key={i} className="text-xs font-mono px-2 py-1 rounded bg-surface flex items-center gap-2">
              <span className={change.includes('added') || change.includes('Added') ? 'text-success' :
                              change.includes('removed') || change.includes('Removed') ? 'text-danger' : 'text-warning'}>
                {change.includes('added') || change.includes('Added') ? '+' :
                 change.includes('removed') || change.includes('Removed') ? '−' : '≠'}
              </span>
              <span className="text-text-secondary">{change}</span>
            </div>
          ))}
          {(!entry.changes || entry.changes.length === 0) && (
            <p className="text-xs text-text-muted">No changes.</p>
          )}
        </div>
      )}

      {activeTab === 'params' && (
        <div className="flex gap-4">
          <div className="flex-1">
            <div className="text-[10px] text-text-muted uppercase mb-1">{fromVersion}</div>
            <ParamsList params={entry.fromEndpoint?.path_params as string} label="Path" />
            <ParamsList params={entry.fromEndpoint?.query_params as string} label="Query" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] text-text-muted uppercase mb-1">{toVersion}</div>
            <ParamsList params={entry.toEndpoint?.path_params as string} label="Path" />
            <ParamsList params={entry.toEndpoint?.query_params as string} label="Query" />
          </div>
        </div>
      )}

      {activeTab === 'body' && (
        <div className="flex gap-4">
          <div className="flex-1">
            <div className="text-[10px] text-text-muted uppercase mb-1">{fromVersion}</div>
            <SchemaView schema={entry.fromEndpoint?.body_schema as string | null} />
          </div>
          <div className="flex-1">
            <div className="text-[10px] text-text-muted uppercase mb-1">{toVersion}</div>
            <SchemaView schema={entry.toEndpoint?.body_schema as string | null} />
          </div>
        </div>
      )}

      {activeTab === 'response' && (
        <div className="flex gap-4">
          <div className="flex-1">
            <div className="text-[10px] text-text-muted uppercase mb-1">{fromVersion}</div>
            <SchemaView schema={entry.fromEndpoint?.response_schema as string | null} />
          </div>
          <div className="flex-1">
            <div className="text-[10px] text-text-muted uppercase mb-1">{toVersion}</div>
            <SchemaView schema={entry.toEndpoint?.response_schema as string | null} />
          </div>
        </div>
      )}
    </div>
  );
}

function ParamsList({ params, label }: { params: string | undefined; label: string }) {
  if (!params) return <p className="text-xs text-text-muted italic">No {label.toLowerCase()} params</p>;
  try {
    const parsed = JSON.parse(params) as Array<{ name: string; required: boolean; type: string; description: string }>;
    if (parsed.length === 0) return <p className="text-xs text-text-muted italic">No {label.toLowerCase()} params</p>;
    return (
      <div className="space-y-0.5 mb-2">
        <div className="text-[10px] text-text-muted font-semibold">{label}</div>
        {parsed.map(p => (
          <div key={p.name} className="text-xs font-mono text-text-secondary px-1">
            {p.name}{p.required ? '*' : ''} <span className="text-text-muted">({p.type})</span>
          </div>
        ))}
      </div>
    );
  } catch { return <p className="text-xs text-text-muted italic">Parse error</p>; }
}

function SchemaView({ schema }: { schema: string | null | undefined }) {
  if (!schema) return <p className="text-xs text-text-muted italic">No schema</p>;
  try {
    const parsed = JSON.parse(schema);
    return (
      <pre className="text-[11px] font-mono text-text-secondary bg-surface rounded-md p-2 max-h-48 overflow-auto whitespace-pre-wrap">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    );
  } catch { return <pre className="text-[11px] font-mono text-text-muted">{schema}</pre>; }
}
