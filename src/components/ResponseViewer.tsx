'use client';

import React, { useState, useCallback } from 'react';
import { useApp } from './AppContext';

export function ResponseViewer() {
  const { response, responseCollapsed, toggleResponse, isLoading, setResponse } = useApp();
  const [activeTab, setActiveTab] = useState<'body' | 'headers' | 'raw' | 'preview'>('body');
  const [pages, setPages] = useState<unknown[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bodyFilter, setBodyFilter] = useState('');

  // Track paginated data
  const displayBody = pages.length > 0
    ? (Array.isArray(response?.body) ? [...pages.flat(), ...response.body] : response?.body)
    : response?.body;

  const loadNextPage = useCallback(async () => {
    if (!response?.nextPageUrl) return;
    setLoadingMore(true);
    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextPageUrl: response.nextPageUrl }),
      });
      const data = await res.json();
      if (Array.isArray(data.body) && Array.isArray(response.body)) {
        setPages(prev => [...prev, response.body]);
        setResponse({
          ...data,
          body: [...(response.body as unknown[]), ...data.body],
        });
      } else {
        setResponse(data);
      }
    } catch (err: unknown) {
      console.error('Failed to load next page:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [response, setResponse]);

  if (responseCollapsed) {
    return (
      <div className="w-full h-full border-l border-border bg-panel flex flex-col items-center py-2">
        <button
          onClick={toggleResponse}
          className="p-1.5 rounded-md hover:bg-surface text-text-secondary hover:text-text-primary"
          title="Expand response"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.78 12.78a.75.75 0 0 1-1.06 0L4.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L6.06 8l3.72 3.72a.75.75 0 0 1 0 1.06Z" />
          </svg>
        </button>
      </div>
    );
  }

  if (!response && !isLoading) {
    return (
      <div className="w-full h-full border-l border-border bg-panel flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-muted text-sm">Response will appear here</p>
          <p className="text-text-muted text-xs mt-1">after you send a request</p>
        </div>
      </div>
    );
  }

  if (isLoading && !response) {
    return (
      <div className="w-full h-full border-l border-border bg-panel flex items-center justify-center">
        <div className="flex items-center gap-2 text-text-secondary">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Sending request...</span>
        </div>
      </div>
    );
  }

  if (!response) return null;

  const statusClass = response.status >= 500 ? 'status-5xx' :
                      response.status >= 400 ? 'status-4xx' :
                      response.status >= 300 ? 'status-3xx' : 'status-2xx';

  const statusBgClass = response.status >= 500 ? 'bg-danger/20 text-danger' :
                        response.status >= 400 ? 'bg-warning/20 text-warning' :
                        response.status >= 300 ? 'bg-info/20 text-info' : 'bg-success/20 text-success';

  return (
    <div className="w-full h-full border-l border-border bg-panel flex flex-col overflow-hidden">
      {/* Response header */}
      <div className="p-3 border-b border-border flex items-center gap-3">
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${statusBgClass}`}>
          {response.status} {response.statusText}
        </span>
        <span className="text-xs text-text-muted">{response.timing}ms</span>
        {response.rateLimit && (
          <span className="text-xs text-text-muted">
            {response.rateLimit.remaining}/{response.rateLimit.limit} remaining
          </span>
        )}
        <div className="flex-1" />
        {/* CSV download — only for array responses */}
        {Array.isArray(response.body) && response.body.length > 0 && (
          <button
            onClick={() => downloadCsv(response.body as Record<string, unknown>[])}
            className="text-text-muted hover:text-text-primary p-1 rounded hover:bg-surface"
            title="Download as CSV"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14ZM7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.969Z" />
            </svg>
          </button>
        )}
        <button
          onClick={() => navigator.clipboard.writeText(JSON.stringify(response.body, null, 2))}
          className="text-text-muted hover:text-text-primary p-1 rounded hover:bg-surface"
          title="Copy response"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25ZM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
          </svg>
        </button>
        <button
          onClick={toggleResponse}
          className="text-text-muted hover:text-text-primary p-1 rounded hover:bg-surface"
          title="Collapse response"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['body', 'headers', 'raw', 'preview'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab
                ? 'text-text-primary border-accent'
                : 'text-text-secondary border-transparent hover:text-text-primary'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {activeTab === 'body' && (
          <div>
            {/* Body search */}
            <div className="mb-2">
              <input
                type="text"
                value={bodyFilter}
                onChange={e => setBodyFilter(e.target.value)}
                placeholder="Filter response... (key or value)"
                className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-xs text-text-primary
                           placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent font-mono"
              />
            </div>
            <JsonViewer data={bodyFilter ? filterJson(displayBody, bodyFilter) : displayBody} />
            {response.nextPageUrl && (
              <div className="mt-4 text-center">
                <button
                  onClick={loadNextPage}
                  disabled={loadingMore}
                  className="px-4 py-1.5 bg-surface border border-border rounded-md text-sm text-accent
                             hover:bg-surface/80 disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? 'Loading...' : 'Load More →'}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'headers' && (
          <div className="space-y-1">
            {Object.entries(response.headers).map(([key, value]) => (
              <div key={key} className="flex gap-2 text-sm py-0.5">
                <span className="font-mono text-accent shrink-0">{key}:</span>
                <span className="font-mono text-text-secondary break-all">{value}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'raw' && (
          <pre className="text-sm font-mono text-text-secondary whitespace-pre-wrap break-all">
            {JSON.stringify(response.body, null, 2)}
          </pre>
        )}

        {activeTab === 'preview' && (
          <PreviewRenderer data={response.body} />
        )}
      </div>
    </div>
  );
}

function JsonViewer({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null) return <span className="json-null">null</span>;
  if (data === undefined) return <span className="json-null">undefined</span>;
  if (typeof data === 'boolean') return <span className="json-boolean">{String(data)}</span>;
  if (typeof data === 'number') return <span className="json-number">{data}</span>;
  if (typeof data === 'string') {
    if (data.length > 200 && depth > 0) {
      return <span className="json-string">&quot;{data.substring(0, 200)}...&quot;</span>;
    }
    return <span className="json-string">&quot;{data}&quot;</span>;
  }

  if (Array.isArray(data)) {
    return <JsonArray data={data} depth={depth} />;
  }

  if (typeof data === 'object') {
    return <JsonObject data={data as Record<string, unknown>} depth={depth} />;
  }

  return <span>{String(data)}</span>;
}

function JsonObject({ data, depth }: { data: Record<string, unknown>; depth: number }) {
  const [collapsed, setCollapsed] = useState(depth > 2);
  const entries = Object.entries(data);

  if (entries.length === 0) return <span className="text-text-muted">{'{}'}</span>;

  if (collapsed) {
    return (
      <span>
        <button onClick={() => setCollapsed(false)} className="text-text-muted hover:text-text-primary">
          {'{'} <span className="text-xs">{entries.length} keys</span> {'}'}
        </button>
      </span>
    );
  }

  return (
    <div className="font-mono text-sm">
      <button onClick={() => setCollapsed(true)} className="text-text-muted hover:text-text-primary">{'{'}</button>
      <div className="ml-4 border-l border-border/50 pl-2">
        {entries.map(([key, value], i) => (
          <div key={key} className="py-0.5">
            <span className="json-key">&quot;{key}&quot;</span>
            <span className="text-text-muted">: </span>
            <JsonViewer data={value} depth={depth + 1} />
            {i < entries.length - 1 && <span className="text-text-muted">,</span>}
          </div>
        ))}
      </div>
      <span className="text-text-muted">{'}'}</span>
    </div>
  );
}

function JsonArray({ data, depth }: { data: unknown[]; depth: number }) {
  const [collapsed, setCollapsed] = useState(depth > 2 && data.length > 3);

  if (data.length === 0) return <span className="text-text-muted">[]</span>;

  if (collapsed) {
    return (
      <span>
        <button onClick={() => setCollapsed(false)} className="text-text-muted hover:text-text-primary">
          [ <span className="text-xs">{data.length} items</span> ]
        </button>
      </span>
    );
  }

  return (
    <div className="font-mono text-sm">
      <button onClick={() => setCollapsed(true)} className="text-text-muted hover:text-text-primary">[</button>
      <div className="ml-4 border-l border-border/50 pl-2">
        {data.map((item, i) => (
          <div key={i} className="py-0.5">
            <JsonViewer data={item} depth={depth + 1} />
            {i < data.length - 1 && <span className="text-text-muted">,</span>}
          </div>
        ))}
      </div>
      <span className="text-text-muted">]</span>
    </div>
  );
}

// URL pattern for detecting links in values
const URL_REGEX = /https?:\/\/[^\s"',}\]]+/g;
const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|ico|webp)(\?.*)?$/i;

function PreviewRenderer({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return <span className="text-text-muted text-sm">No content</span>;
  }

  if (Array.isArray(data)) {
    return (
      <div className="space-y-3">
        {data.map((item, i) => (
          <div key={i} className="bg-surface/50 border border-border rounded-lg p-3">
            <div className="text-xs text-text-muted mb-2">Item {i + 1}</div>
            <PreviewObject data={item} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof data === 'object') {
    return <PreviewObject data={data as Record<string, unknown>} />;
  }

  return <PreviewValue value={data} />;
}

function PreviewObject({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  // Separate image URLs, regular URLs, and other values
  const imageEntries: [string, string][] = [];
  const urlEntries: [string, string][] = [];
  const otherEntries: [string, unknown][] = [];

  for (const [key, value] of entries) {
    if (typeof value === 'string' && IMAGE_EXTENSIONS.test(value)) {
      imageEntries.push([key, value]);
    } else if (typeof value === 'string' && URL_REGEX.test(value)) {
      urlEntries.push([key, value]);
      URL_REGEX.lastIndex = 0; // reset regex state
    } else if (value !== null && typeof value === 'object') {
      // Skip nested objects/arrays in preview — they're in the Body tab
      otherEntries.push([key, '[object]']);
    } else {
      otherEntries.push([key, value]);
    }
  }

  return (
    <div className="space-y-2 text-sm">
      {/* Image previews */}
      {imageEntries.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {imageEntries.map(([key, url]) => (
            <a key={key} href={url} target="_blank" rel="noopener noreferrer"
               className="group relative" title={`${key}: ${url}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={key}
                className="h-12 w-12 rounded-md border border-border object-cover group-hover:ring-2 ring-accent transition-all" />
              <span className="text-[10px] text-text-muted block text-center truncate max-w-[48px]">{key}</span>
            </a>
          ))}
        </div>
      )}

      {/* Clickable URLs */}
      {urlEntries.length > 0 && (
        <div className="space-y-1">
          {urlEntries.map(([key, url]) => (
            <div key={key} className="flex items-start gap-2">
              <span className="text-text-muted shrink-0 w-40 truncate font-mono text-xs pt-0.5" title={key}>{key}:</span>
              <a href={url} target="_blank" rel="noopener noreferrer"
                 className="text-accent hover:underline break-all text-xs font-mono">
                {url}
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Non-URL values */}
      {otherEntries.length > 0 && (
        <div className="space-y-0.5 border-t border-border/50 pt-2 mt-2">
          {otherEntries.map(([key, value]) => (
            <div key={key} className="flex items-start gap-2">
              <span className="text-text-muted shrink-0 w-40 truncate font-mono text-xs pt-0.5" title={key}>{key}:</span>
              <PreviewValue value={value} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-text-muted text-xs font-mono italic">null</span>;
  }
  if (typeof value === 'boolean') {
    return <span className={`text-xs font-mono font-bold ${value ? 'text-success' : 'text-danger'}`}>{String(value)}</span>;
  }
  if (typeof value === 'number') {
    return <span className="text-info text-xs font-mono">{value}</span>;
  }
  const str = String(value);
  // Check if the string itself contains URLs — render them clickable inline
  if (URL_REGEX.test(str)) {
    URL_REGEX.lastIndex = 0;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = URL_REGEX.exec(str)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={`t${lastIndex}`}>{str.slice(lastIndex, match.index)}</span>);
      }
      parts.push(
        <a key={`u${match.index}`} href={match[0]} target="_blank" rel="noopener noreferrer"
           className="text-accent hover:underline">{match[0]}</a>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < str.length) {
      parts.push(<span key={`t${lastIndex}`}>{str.slice(lastIndex)}</span>);
    }
    return <span className="text-xs font-mono text-text-secondary break-all">{parts}</span>;
  }
  return <span className="text-xs font-mono text-text-secondary break-all">{str}</span>;
}

function downloadCsv(data: Record<string, unknown>[]) {
  if (!data.length) return;
  // Collect all keys across all objects
  const keys = new Set<string>();
  for (const row of data) {
    for (const key of Object.keys(row)) {
      const val = row[key];
      if (val === null || val === undefined || typeof val !== 'object') {
        keys.add(key);
      }
    }
  }
  const headers = Array.from(keys);
  const csvRows = [headers.map(h => `"${h}"`).join(',')];
  for (const row of data) {
    const values = headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    });
    csvRows.push(values.join(','));
  }
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `response-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function filterJson(data: unknown, query: string): unknown {
  if (!query) return data;
  const q = query.toLowerCase();

  if (data === null || data === undefined) return null;
  if (typeof data === 'string') return data.toLowerCase().includes(q) ? data : undefined;
  if (typeof data === 'number' || typeof data === 'boolean') {
    return String(data).toLowerCase().includes(q) ? data : undefined;
  }

  if (Array.isArray(data)) {
    const filtered = data
      .map(item => filterJson(item, query))
      .filter(item => item !== undefined);
    return filtered.length > 0 ? filtered : undefined;
  }

  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    let hasMatch = false;
    for (const [key, value] of Object.entries(obj)) {
      if (key.toLowerCase().includes(q)) {
        result[key] = value; // key matches — keep entire value
        hasMatch = true;
      } else {
        const filtered = filterJson(value, query);
        if (filtered !== undefined) {
          result[key] = filtered;
          hasMatch = true;
        }
      }
    }
    return hasMatch ? result : undefined;
  }

  return undefined;
}
