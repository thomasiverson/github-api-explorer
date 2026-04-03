'use client';

import React, { useState, useEffect } from 'react';
import { TopBar } from '@/components/TopBar';

interface HistoryRow {
  id: string; method: string; path: string; resolved_url: string;
  status: number; timing: number; created_at: string;
  operation_id: string | null; category: string | null;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'method-get-bg', POST: 'method-post-bg', PUT: 'method-put-bg',
  PATCH: 'method-patch-bg', DELETE: 'method-delete-bg',
};

interface DiffDataFull {
  leftBody: unknown;
  rightBody: unknown;
  leftHeaders: Record<string, string>;
  rightHeaders: Record<string, string>;
  leftLabel: string;
  rightLabel: string;
  leftStatus: number;
  rightStatus: number;
  leftTiming: number;
  rightTiming: number;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [filter, setFilter] = useState('');
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [diffData, setDiffData] = useState<DiffDataFull | null>(null);

  useEffect(() => { loadHistory(); }, []);

  async function loadHistory() {
    const res = await fetch('/api/history?limit=200');
    setHistory(await res.json());
  }

  async function deleteEntry(id: string) {
    await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    setHistory(prev => prev.filter(h => h.id !== id));
  }

  async function clearAll() {
    await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear' }),
    });
    setHistory([]);
  }

  const filtered = filter
    ? history.filter(h =>
        h.path.toLowerCase().includes(filter.toLowerCase()) ||
        h.resolved_url.toLowerCase().includes(filter.toLowerCase()) ||
        h.method.toLowerCase().includes(filter.toLowerCase()) ||
        (h.category || '').toLowerCase().includes(filter.toLowerCase())
      )
    : history;

  function statusClass(status: number) {
    if (status >= 500) return 'text-danger';
    if (status >= 400) return 'text-warning';
    if (status >= 300) return 'text-info';
    return 'text-success';
  }

  function toggleCompare(id: string) {
    setCompareIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else {
        if (next.size >= 2) return prev; // max 2
        next.add(id);
      }
      return next;
    });
  }

  async function showDiff() {
    const ids = Array.from(compareIds);
    if (ids.length !== 2) return;
    try {
      const responses = await Promise.all(
        ids.map(async (id) => {
          const res = await fetch(`/api/history?id=${encodeURIComponent(id)}`);
          if (!res.ok) throw new Error(`Failed to fetch history entry ${id}: ${res.status}`);
          return res.json();
        })
      );
      const [a, b] = responses;
      if (!a || !b) {
        alert('Could not load one or both history entries.');
        return;
      }
      setDiffData({
        leftBody: safeParseJson(a.response_body),
        rightBody: safeParseJson(b.response_body),
        leftHeaders: safeParseJson(a.response_headers) as Record<string, string> || {},
        rightHeaders: safeParseJson(b.response_headers) as Record<string, string> || {},
        leftLabel: `${a.method} ${a.path} (${new Date(a.created_at).toLocaleString()})`,
        rightLabel: `${b.method} ${b.path} (${new Date(b.created_at).toLocaleString()})`,
        leftStatus: a.status,
        rightStatus: b.status,
        leftTiming: a.timing,
        rightTiming: b.timing,
      });
    } catch (err) {
      alert(`Compare failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto py-8 px-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-text-primary">Request History</h1>
              <p className="text-sm text-text-secondary mt-1">{history.length} requests recorded</p>
            </div>
            <div className="flex items-center gap-3">
              {compareIds.size === 2 && (
                <button onClick={showDiff}
                  className="px-3 py-1.5 bg-accent-emphasis text-white text-sm rounded-md hover:opacity-90 transition-opacity">
                  Compare ({compareIds.size})
                </button>
              )}
              {compareIds.size > 0 && compareIds.size < 2 && (
                <span className="text-xs text-text-muted">Select 1 more to compare</span>
              )}
              <input
                type="text" value={filter} onChange={e => setFilter(e.target.value)}
                placeholder="Filter..."
                className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent w-60"
              />
              {history.length > 0 && (
                <button onClick={clearAll}
                  className="px-3 py-1.5 text-sm text-danger border border-border rounded-md hover:bg-surface transition-colors">
                  Clear All
                </button>
              )}
            </div>
          </div>
          {/* Diff viewer - above the table */}
          {diffData && (
            <DiffViewer data={diffData} onClose={() => { setDiffData(null); setCompareIds(new Set()); }} />
          )}
          <div className="bg-panel border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-secondary text-left">
                  <th className="px-2 py-2 w-8"></th>
                  <th className="px-4 py-2 font-medium">Method</th>
                  <th className="px-4 py-2 font-medium">Path</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium w-16"></th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const maxTiming = Math.max(...filtered.map(h => h.timing), 1);
                  return filtered.map(h => (
                  <tr key={h.id} className="border-b border-border hover:bg-surface/50 transition-colors">
                    <td className="px-2 py-2">
                      <input type="checkbox" checked={compareIds.has(h.id)}
                        onChange={() => toggleCompare(h.id)} className="accent-accent"
                        disabled={!compareIds.has(h.id) && compareIds.size >= 2} />
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${METHOD_COLORS[h.method] || 'bg-text-muted'} leading-none`}>
                        {h.method}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-text-primary truncate max-w-md" title={`${h.resolved_url}\n\nTemplate: ${h.path}`}>
                      {getDisplayPath(h.resolved_url, h.path)}
                    </td>
                    <td className={`px-4 py-2 font-mono font-bold ${statusClass(h.status)}`}>
                      {h.status}
                    </td>
                    <td className="px-4 py-2 text-text-secondary">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs w-12">{h.timing}ms</span>
                        <div className="w-16 h-1.5 rounded-full bg-surface overflow-hidden">
                          <div className={`h-full rounded-full ${h.timing > 1000 ? 'bg-danger' : h.timing > 500 ? 'bg-warning' : 'bg-success'}`}
                            style={{ width: `${Math.min(100, (h.timing / maxTiming) * 100)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-text-muted">
                      {new Date(h.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        <a href={`/?replay=${h.id}`}
                          className="text-text-muted hover:text-accent transition-colors p-1" title="Replay">
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z" />
                          </svg>
                        </a>
                        <button onClick={() => deleteEntry(h.id)}
                          className="text-text-muted hover:text-danger transition-colors p-1" title="Delete">
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ));
                })()}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-text-muted">
                      {history.length === 0 ? 'No history yet' : 'No matching results'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
}

function getDisplayPath(resolvedUrl: string, templatePath: string): string {
  try {
    const url = new URL(resolvedUrl);
    return url.pathname + (url.search || '');
  } catch {
    return templatePath;
  }
}

function safeParseJson(body: string | null | undefined): unknown {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

interface DiffEntry {
  key: string;
  status: 'same' | 'changed' | 'added' | 'removed';
  left?: unknown;
  right?: unknown;
}

function computeDiff(left: unknown, right: unknown): { identical: boolean; entries: DiffEntry[]; summary: string } {
  const leftStr = JSON.stringify(left);
  const rightStr = JSON.stringify(right);

  if (leftStr === rightStr) {
    return { identical: true, entries: [], summary: 'Responses are identical.' };
  }

  // Both are objects — do key-level diff
  if (left && right && typeof left === 'object' && typeof right === 'object' && !Array.isArray(left) && !Array.isArray(right)) {
    const l = left as Record<string, unknown>;
    const r = right as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(l), ...Object.keys(r)]);
    const entries: DiffEntry[] = [];
    let changed = 0, added = 0, removed = 0;

    for (const key of allKeys) {
      const inLeft = key in l;
      const inRight = key in r;
      if (inLeft && inRight) {
        if (JSON.stringify(l[key]) === JSON.stringify(r[key])) {
          entries.push({ key, status: 'same', left: l[key], right: r[key] });
        } else {
          entries.push({ key, status: 'changed', left: l[key], right: r[key] });
          changed++;
        }
      } else if (inLeft) {
        entries.push({ key, status: 'removed', left: l[key] });
        removed++;
      } else {
        entries.push({ key, status: 'added', right: r[key] });
        added++;
      }
    }

    // Sort: changed first, then added, removed, same
    const order = { changed: 0, added: 1, removed: 2, same: 3 };
    entries.sort((a, b) => order[a.status] - order[b.status]);

    const parts: string[] = [];
    if (changed > 0) parts.push(`${changed} changed`);
    if (added > 0) parts.push(`${added} added`);
    if (removed > 0) parts.push(`${removed} removed`);
    const same = entries.filter(e => e.status === 'same').length;
    if (same > 0) parts.push(`${same} unchanged`);

    return { identical: false, entries, summary: parts.join(', ') };
  }

  // Both are arrays — compare counts and items
  if (Array.isArray(left) && Array.isArray(right)) {
    const summary = `Left: ${left.length} items, Right: ${right.length} items. ${left.length === right.length ? 'Same count but content differs.' : 'Different counts.'}`;
    return { identical: false, entries: [], summary };
  }

  // Different types or primitives
  return { identical: false, entries: [], summary: `Values differ. Left: ${typeof left}, Right: ${typeof right}` };
}

function DiffViewer({ data, onClose }: { data: DiffDataFull; onClose: () => void }) {
  const diff = computeDiff(data.leftBody, data.rightBody);
  const headerDiff = computeDiff(data.leftHeaders, data.rightHeaders);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'diff' | 'headers' | 'raw' | 'preview'>('diff');

  const statusColor = (s: number) => s >= 500 ? 'text-danger' : s >= 400 ? 'text-warning' : 'text-success';

  return (
    <div className="mb-6 bg-panel border border-border rounded-lg overflow-hidden">
      {/* Collapsible header */}
      <div className="p-3 flex items-center justify-between cursor-pointer hover:bg-surface/50 transition-colors"
        onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
            className={`text-text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}>
            <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
          </svg>
          <span className="text-sm font-medium text-text-primary">Response Comparison</span>
          {diff.identical ? (
            <span className="text-xs px-2 py-0.5 rounded bg-success/20 text-success font-medium">Identical</span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded bg-warning/20 text-warning font-medium">Differences found</span>
          )}
          <span className="text-xs text-text-muted">{diff.summary}</span>
        </div>
        <button onClick={e => { e.stopPropagation(); onClose(); }}
          className="text-xs text-text-muted hover:text-text-primary">✕ Close</button>
      </div>

      {expanded && (
        <>
          {/* Status + label bar */}
          <div className="flex border-t border-b border-border">
            <div className="flex-1 px-3 py-1.5 bg-surface text-xs font-mono truncate border-r border-border flex items-center gap-2">
              <span className={`font-bold ${statusColor(data.leftStatus)}`}>{data.leftStatus}</span>
              <span className="text-text-muted">{data.leftTiming}ms</span>
              <span className="text-text-secondary truncate">{data.leftLabel}</span>
            </div>
            <div className="flex-1 px-3 py-1.5 bg-surface text-xs font-mono truncate flex items-center gap-2">
              <span className={`font-bold ${statusColor(data.rightStatus)}`}>{data.rightStatus}</span>
              <span className="text-text-muted">{data.rightTiming}ms</span>
              <span className="text-text-secondary truncate">{data.rightLabel}</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border">
            {(['diff', 'headers', 'raw', 'preview'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
                  activeTab === tab
                    ? 'text-text-primary border-accent'
                    : 'text-text-secondary border-transparent hover:text-text-primary'
                }`}>
                {tab === 'diff' ? `Body Diff${!diff.identical ? ` (${diff.entries.filter(e => e.status !== 'same').length})` : ''}` :
                 tab === 'headers' ? `Headers${!headerDiff.identical ? ' ≠' : ''}` :
                 tab === 'raw' ? 'Raw' : 'Preview'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="max-h-96 overflow-auto">
            {activeTab === 'diff' && (
              diff.identical ? (
                <div className="p-6 text-center text-text-muted text-sm">✓ Both response bodies are exactly the same.</div>
              ) : diff.entries.length > 0 ? (
                <div>
                  {diff.entries.map(entry => (
                    <div key={entry.key} className={`flex border-b border-border/50 text-xs font-mono ${
                      entry.status === 'changed' ? 'bg-warning/5' :
                      entry.status === 'added' ? 'bg-success/5' :
                      entry.status === 'removed' ? 'bg-danger/5' : ''
                    }`}>
                      <div className="w-8 shrink-0 flex items-start justify-center pt-1.5 text-[10px]">
                        {entry.status === 'changed' && <span className="text-warning">≠</span>}
                        {entry.status === 'added' && <span className="text-success">+</span>}
                        {entry.status === 'removed' && <span className="text-danger">−</span>}
                        {entry.status === 'same' && <span className="text-text-muted">=</span>}
                      </div>
                      <div className="flex-1 px-2 py-1 border-r border-border/50 break-all">
                        <span className="text-text-muted">{entry.key}: </span>
                        {entry.left !== undefined ? (
                          <span className={entry.status === 'changed' ? 'text-danger' : 'text-text-secondary'}>{formatValue(entry.left)}</span>
                        ) : <span className="text-text-muted italic">—</span>}
                      </div>
                      <div className="flex-1 px-2 py-1 break-all">
                        <span className="text-text-muted">{entry.key}: </span>
                        {entry.right !== undefined ? (
                          <span className={entry.status === 'changed' ? 'text-success' : 'text-text-secondary'}>{formatValue(entry.right)}</span>
                        ) : <span className="text-text-muted italic">—</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex">
                  <pre className="flex-1 p-3 text-xs font-mono text-text-secondary whitespace-pre-wrap break-all overflow-auto border-r border-border">
                    {typeof data.leftBody === 'string' ? data.leftBody : JSON.stringify(data.leftBody, null, 2)}
                  </pre>
                  <pre className="flex-1 p-3 text-xs font-mono text-text-secondary whitespace-pre-wrap break-all overflow-auto">
                    {typeof data.rightBody === 'string' ? data.rightBody : JSON.stringify(data.rightBody, null, 2)}
                  </pre>
                </div>
              )
            )}

            {activeTab === 'headers' && (
              headerDiff.identical ? (
                <div className="p-6 text-center text-text-muted text-sm">✓ Both sets of headers are exactly the same.</div>
              ) : (
                <div className="flex">
                  <div className="flex-1 p-3 border-r border-border space-y-0.5">
                    {Object.entries(data.leftHeaders).map(([k, v]) => {
                      const changed = data.rightHeaders[k] !== v;
                      const removed = !(k in data.rightHeaders);
                      return (
                        <div key={k} className={`text-xs font-mono ${removed ? 'bg-danger/10' : changed ? 'bg-warning/10' : ''} px-1 rounded`}>
                          <span className="text-accent">{k}:</span> <span className="text-text-secondary">{v}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex-1 p-3 space-y-0.5">
                    {Object.entries(data.rightHeaders).map(([k, v]) => {
                      const changed = data.leftHeaders[k] !== v;
                      const added = !(k in data.leftHeaders);
                      return (
                        <div key={k} className={`text-xs font-mono ${added ? 'bg-success/10' : changed ? 'bg-warning/10' : ''} px-1 rounded`}>
                          <span className="text-accent">{k}:</span> <span className="text-text-secondary">{v}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            )}

            {activeTab === 'raw' && (
              <div className="flex">
                <pre className="flex-1 p-3 text-xs font-mono text-text-secondary whitespace-pre-wrap break-all overflow-auto border-r border-border">
                  {typeof data.leftBody === 'string' ? data.leftBody : JSON.stringify(data.leftBody, null, 2)}
                </pre>
                <pre className="flex-1 p-3 text-xs font-mono text-text-secondary whitespace-pre-wrap break-all overflow-auto">
                  {typeof data.rightBody === 'string' ? data.rightBody : JSON.stringify(data.rightBody, null, 2)}
                </pre>
              </div>
            )}

            {activeTab === 'preview' && (
              <div className="flex">
                <div className="flex-1 p-3 border-r border-border">
                  <DiffPreviewSide data={data.leftBody} />
                </div>
                <div className="flex-1 p-3">
                  <DiffPreviewSide data={data.rightBody} />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DiffPreviewSide({ data }: { data: unknown }) {
  if (!data || typeof data !== 'object') {
    return <span className="text-xs text-text-muted font-mono">{String(data ?? 'null')}</span>;
  }
  const entries = Object.entries(data as Record<string, unknown>);
  const urlRegex = /^https?:\/\//;
  return (
    <div className="space-y-0.5 text-xs font-mono">
      {entries.map(([key, val]) => {
        const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
        const isUrl = typeof val === 'string' && urlRegex.test(val);
        return (
          <div key={key} className="flex gap-1">
            <span className="text-text-muted shrink-0">{key}:</span>
            {isUrl ? (
              <a href={val as string} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline truncate">{val as string}</a>
            ) : (
              <span className="text-text-secondary truncate">{strVal.length > 100 ? strVal.slice(0, 100) + '...' : strVal}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatValue(val: unknown): string {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'string') return val.length > 80 ? `"${val.substring(0, 80)}..."` : `"${val}"`;
  if (typeof val === 'object') {
    const s = JSON.stringify(val);
    return s.length > 80 ? s.substring(0, 80) + '...' : s;
  }
  return String(val);
}
