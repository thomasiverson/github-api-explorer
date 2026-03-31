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

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [filter, setFilter] = useState('');
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [diffData, setDiffData] = useState<{ left: unknown; right: unknown; leftLabel: string; rightLabel: string } | null>(null);

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
        left: safeParseJson(a.response_body),
        right: safeParseJson(b.response_body),
        leftLabel: `${a.method} ${a.path} (${new Date(a.created_at).toLocaleString()})`,
        rightLabel: `${b.method} ${b.path} (${new Date(b.created_at).toLocaleString()})`,
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
                {filtered.map(h => (
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
                    <td className="px-4 py-2 font-mono text-text-primary truncate max-w-md" title={h.path}>
                      {h.path}
                    </td>
                    <td className={`px-4 py-2 font-mono font-bold ${statusClass(h.status)}`}>
                      {h.status}
                    </td>
                    <td className="px-4 py-2 text-text-secondary">{h.timing}ms</td>
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
                ))}
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

          {/* Diff viewer */}
          {diffData && (
            <div className="mt-6 bg-panel border border-border rounded-lg overflow-hidden" ref={el => el?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              <div className="p-3 border-b border-border flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary">Response Comparison</span>
                <button onClick={() => { setDiffData(null); setCompareIds(new Set()); }}
                  className="text-xs text-text-muted hover:text-text-primary">✕ Close</button>
              </div>
              <div className="flex">
                <div className="flex-1 border-r border-border">
                  <div className="px-3 py-2 bg-surface text-xs text-text-secondary font-mono truncate">{diffData.leftLabel}</div>
                  <pre className="p-3 text-xs font-mono text-text-secondary whitespace-pre-wrap break-all max-h-96 overflow-auto">
                    {typeof diffData.left === 'string' ? diffData.left : JSON.stringify(diffData.left, null, 2)}
                  </pre>
                </div>
                <div className="flex-1">
                  <div className="px-3 py-2 bg-surface text-xs text-text-secondary font-mono truncate">{diffData.rightLabel}</div>
                  <pre className="p-3 text-xs font-mono text-text-secondary whitespace-pre-wrap break-all max-h-96 overflow-auto">
                    {typeof diffData.right === 'string' ? diffData.right : JSON.stringify(diffData.right, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function safeParseJson(body: string | null | undefined): unknown {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    // Truncated or invalid JSON — return as raw string
    return body;
  }
}
