'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from './AppContext';

const METHOD_BG: Record<string, string> = {
  GET: 'bg-method-get', POST: 'bg-method-post',
  PUT: 'bg-method-put', PATCH: 'bg-method-patch', DELETE: 'bg-method-delete',
};

export function RequestBuilder() {
  const { selectedEndpoint, activeEnv, setResponse, setIsLoading, isLoading } = useApp();
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [queryValues, setQueryValues] = useState<Record<string, { value: string; enabled: boolean }>>({});
  const [bodyText, setBodyText] = useState('');
  const [activeTab, setActiveTab] = useState<'params' | 'body' | 'headers'>('params');
  const [customHeaders, setCustomHeaders] = useState<Array<{ key: string; value: string; enabled: boolean }>>([]);
  const [curlCopied, setCurlCopied] = useState(false);

  // Keep a ref to activeEnv so the effect always reads the latest value
  const activeEnvRef = useRef(activeEnv);
  // Ref for keyboard shortcut to call latest executeRequest
  const executeRequestRef = useRef<(() => void) | null>(null);
  activeEnvRef.current = activeEnv;

  // Reset form when endpoint changes
  useEffect(() => {
    if (!selectedEndpoint) return;
    const env = activeEnvRef.current;
    const pv: Record<string, string> = {};
    for (const p of selectedEndpoint.pathParams) {
      // Auto-fill common params from active environment
      let defaultVal = p.default || '';
      if (!defaultVal && env) {
        const orgSlug = env.org_name || env.enterprise_slug || '';
        if (p.name === 'org' || p.name === 'organization') {
          defaultVal = orgSlug;
        } else if (p.name === 'owner') {
          defaultVal = orgSlug;
        } else if (p.name === 'enterprise') {
          defaultVal = env.enterprise_slug || '';
        }
      }
      pv[p.name] = defaultVal;
    }
    setPathValues(pv);

    const qv: Record<string, { value: string; enabled: boolean }> = {};
    for (const p of selectedEndpoint.queryParams) {
      qv[p.name] = { value: p.default || '', enabled: p.required };
    }
    setQueryValues(qv);

    if (selectedEndpoint.bodySchema) {
      setBodyText(generateExampleBody(selectedEndpoint.bodySchema));
    } else {
      setBodyText('');
    }
    setActiveTab(selectedEndpoint.pathParams.length > 0 || selectedEndpoint.queryParams.length > 0 ? 'params' : 'body');
  }, [selectedEndpoint]);

  // Ctrl+Enter / Cmd+Enter to send
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        executeRequestRef.current?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const resolvedPath = selectedEndpoint
    ? selectedEndpoint.path.replace(/\{(\w+)\}/g, (_, key) => pathValues[key] || `{${key}}`)
    : '';

  const buildResolvedUrl = useCallback(() => {
    if (!selectedEndpoint || !activeEnv) return '';
    const enabledQueries: Record<string, string> = {};
    for (const [k, v] of Object.entries(queryValues)) {
      if (v.enabled && v.value) enabledQueries[k] = v.value;
    }
    const queryString = Object.entries(enabledQueries)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return `${activeEnv.base_url}${resolvedPath}${queryString ? '?' + queryString : ''}`;
  }, [selectedEndpoint, activeEnv, queryValues, resolvedPath]);

  const copyAsCurl = useCallback(() => {
    if (!selectedEndpoint || !activeEnv) return;
    const url = buildResolvedUrl();
    const parts = ['curl'];
    if (selectedEndpoint.method !== 'GET') {
      parts.push(`-X ${selectedEndpoint.method}`);
    }
    parts.push(`"${url}"`);
    parts.push('-H "Accept: application/vnd.github+json"');
    parts.push('-H "Authorization: token YOUR_TOKEN"');
    parts.push('-H "X-GitHub-Api-Version: 2022-11-28"');
    for (const h of customHeaders) {
      if (h.enabled && h.key) parts.push(`-H "${h.key}: ${h.value}"`);
    }
    if (bodyText && ['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method)) {
      parts.push(`-d '${bodyText.replace(/\n/g, '')}'`);
    }
    navigator.clipboard.writeText(parts.join(' \\\n  '));
  }, [selectedEndpoint, activeEnv, buildResolvedUrl, customHeaders, bodyText]);

  const executeRequest = useCallback(async (nextPageUrl?: string) => {
    if (!selectedEndpoint || !activeEnv) return;
    setIsLoading(true);

    try {
      const enabledQueries: Record<string, string> = {};
      for (const [k, v] of Object.entries(queryValues)) {
        if (v.enabled && v.value) enabledQueries[k] = v.value;
      }

      const enabledHeaders: Record<string, string> = {};
      for (const h of customHeaders) {
        if (h.enabled && h.key) enabledHeaders[h.key] = h.value;
      }

      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environmentId: activeEnv.id,
          method: selectedEndpoint.method,
          path: selectedEndpoint.path,
          pathParams: pathValues,
          queryParams: enabledQueries,
          headers: enabledHeaders,
          body: bodyText && ['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method)
            ? JSON.parse(bodyText) : null,
          operationId: selectedEndpoint.operationId,
          category: selectedEndpoint.category,
          nextPageUrl,
        }),
      });

      const data = await res.json();
      setResponse(data);

      // Dispatch rate limit event for TopBar
      if (data.rateLimit) {
        window.dispatchEvent(new CustomEvent('rate-limit-update', { detail: { rateLimit: data.rateLimit } }));
      }
    } catch (err: unknown) {
      setResponse({
        status: 0,
        statusText: 'Network Error',
        headers: {},
        body: { error: err instanceof Error ? err.message : 'Unknown error' },
        timing: 0,
        rateLimit: null,
        nextPageUrl: null,
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedEndpoint, activeEnv, pathValues, queryValues, bodyText, customHeaders, setResponse, setIsLoading]);

  // Keep ref in sync for keyboard shortcut
  executeRequestRef.current = () => executeRequest();

  if (!selectedEndpoint) {
    return (
      <div className="flex-1 flex items-center justify-center bg-canvas">
        <div className="text-center">
          <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted mx-auto mb-4">
            <path d="M1.543 7.25h2.733c.144-2.074.866-3.756 1.58-4.948.12-.197.237-.381.348-.55A6.51 6.51 0 0 0 1.543 7.25ZM8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0ZM5.554 4.413C4.895 5.515 4.282 7.026 4.149 9.25H7.25V4.148c-.273.036-.558.098-.856.197-.426.142-.898.388-1.38.748-.024.018-.049.037-.073.055a4.202 4.202 0 0 0-.387.265ZM7.25 2.498a8.542 8.542 0 0 0-.191.072c-.462.181-.963.492-1.505.944l-.052.04A11.63 11.63 0 0 0 4.2 5.29c-.307.55-.567 1.18-.758 1.878h3.808V2.498Zm1.5 0v4.67h3.808a9.91 9.91 0 0 0-.758-1.878 11.643 11.643 0 0 0-1.302-1.736l-.052-.04A6.816 6.816 0 0 0 8.94 2.57a8.56 8.56 0 0 0-.19-.072ZM8.75 9.25v3.102c.273-.036.558-.098.856-.197.426-.142.898-.388 1.38-.748l.073-.055c.147-.113.274-.222.387-.265A6.553 6.553 0 0 0 12.951 9.25H8.75Zm3.457 0H8.75v-5.1h3.457a1.51 1.51 0 0 1-.107-.27c-.092.108-.197.226-.314.353a12.11 12.11 0 0 1-.748.79A13.49 13.49 0 0 1 12.207 9.25ZM11.851 9.25c-.133 2.224-.746 3.735-1.405 4.837l-.073-.055a5.437 5.437 0 0 1-.387-.265l-.052-.04a6.816 6.816 0 0 1-1.505-.944 8.55 8.55 0 0 1-.191-.072V9.25h3.613Zm2.606 0a6.51 6.51 0 0 1-4.661 5.502c.111-.169.228-.353.348-.55.714-1.192 1.436-2.874 1.58-4.948h2.733v-.004Z" />
          </svg>
          <p className="text-text-secondary text-sm">Select an endpoint from the sidebar</p>
          <p className="text-text-muted text-xs mt-1">or press ⌘K to search</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-canvas min-w-0">
      {/* URL Bar */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2.5 py-1 rounded ${METHOD_BG[selectedEndpoint.method] || 'bg-text-muted'} text-white shrink-0`}>
            {selectedEndpoint.method}
          </span>
          <div className="flex-1 font-mono text-sm text-text-primary bg-surface border border-border rounded-md px-3 py-1.5 truncate">
            {resolvedPath}
          </div>
          <button
            onClick={() => executeRequest()}
            disabled={isLoading || !activeEnv}
            className="px-4 py-1.5 bg-accent-emphasis text-white text-sm font-medium rounded-md
                       hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center gap-2"
          >
            {isLoading ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : null}
            Send
          </button>
          <button
            onClick={() => { copyAsCurl(); setCurlCopied(true); setTimeout(() => setCurlCopied(false), 2000); }}
            disabled={!activeEnv}
            className="px-2.5 py-1.5 border border-border text-text-secondary text-sm rounded-md
                       hover:bg-surface disabled:opacity-50 transition-colors shrink-0"
            title="Copy as cURL command"
          >
            {curlCopied ? '✓ Copied' : 'cURL'}
          </button>
        </div>
        {/* Endpoint info */}
        {selectedEndpoint.summary && (
          <EndpointInfo summary={selectedEndpoint.summary} description={selectedEndpoint.description} />
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['params', 'body', 'headers'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab
                ? 'text-text-primary border-accent'
                : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border'
            }`}
          >
            {tab === 'params' ? `Parameters${selectedEndpoint.pathParams.length + selectedEndpoint.queryParams.length > 0 ? ` (${selectedEndpoint.pathParams.length + Object.values(queryValues).filter(v => v.enabled).length})` : ''}` :
             tab === 'body' ? 'Body' : 'Headers'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'params' && (
          <div className="space-y-4">
            {/* Path params */}
            {selectedEndpoint.pathParams.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Path Parameters</h3>
                <div className="space-y-2">
                  {selectedEndpoint.pathParams.map(p => (
                    <div key={p.name} className="flex items-center gap-2">
                      <label className="text-sm text-text-primary w-36 shrink-0 font-mono">
                        {p.name}
                        {p.required && <span className="text-danger ml-0.5">*</span>}
                      </label>
                      {p.enum ? (
                        <select
                          value={pathValues[p.name] || ''}
                          onChange={e => setPathValues(prev => ({ ...prev, [p.name]: e.target.value }))}
                          className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary
                                     focus:outline-none focus:ring-1 focus:ring-accent"
                        >
                          <option value="">Select...</option>
                          {p.enum.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={pathValues[p.name] || ''}
                          onChange={e => setPathValues(prev => ({ ...prev, [p.name]: e.target.value }))}
                          placeholder={p.description || p.type}
                          className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary
                                     placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent font-mono"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Query params */}
            {selectedEndpoint.queryParams.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Query Parameters</h3>
                <div className="space-y-2">
                  {selectedEndpoint.queryParams.map(p => (
                    <div key={p.name} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={queryValues[p.name]?.enabled || false}
                        onChange={e => setQueryValues(prev => ({
                          ...prev,
                          [p.name]: { ...prev[p.name], enabled: e.target.checked }
                        }))}
                        className="shrink-0 rounded border-border accent-accent"
                      />
                      <label className="text-sm text-text-primary w-32 shrink-0 font-mono truncate" title={p.name}>
                        {p.name}
                      </label>
                      <input
                        type="text"
                        value={queryValues[p.name]?.value || ''}
                        onChange={e => setQueryValues(prev => ({
                          ...prev,
                          [p.name]: { ...prev[p.name], value: e.target.value }
                        }))}
                        placeholder={p.description || p.type}
                        className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary
                                   placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent font-mono"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedEndpoint.pathParams.length === 0 && selectedEndpoint.queryParams.length === 0 && (
              <p className="text-sm text-text-muted text-center py-8">No parameters for this endpoint</p>
            )}
          </div>
        )}

        {activeTab === 'body' && (
          <div className="h-full">
            {['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method) ? (
              <textarea
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                placeholder='{"key": "value"}'
                className="w-full h-64 bg-surface border border-border rounded-md px-3 py-2 text-sm text-text-primary
                           font-mono resize-y focus:outline-none focus:ring-1 focus:ring-accent"
                spellCheck={false}
              />
            ) : (
              <p className="text-sm text-text-muted text-center py-8">
                {selectedEndpoint.method} requests don&apos;t have a body
              </p>
            )}
          </div>
        )}

        {activeTab === 'headers' && (
          <div className="space-y-2">
            {/* Default headers */}
            <div className="flex items-center gap-2 opacity-60">
              <input type="checkbox" checked disabled className="shrink-0" />
              <span className="text-sm font-mono text-text-secondary w-40">Accept</span>
              <span className="text-sm font-mono text-text-muted">application/vnd.github+json</span>
            </div>
            <div className="flex items-center gap-2 opacity-60">
              <input type="checkbox" checked disabled className="shrink-0" />
              <span className="text-sm font-mono text-text-secondary w-40">Authorization</span>
              <span className="text-sm font-mono text-text-muted">token •••••••</span>
            </div>
            <hr className="border-border my-3" />
            {/* Custom headers */}
            {customHeaders.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={h.enabled}
                  onChange={e => {
                    const next = [...customHeaders];
                    next[i] = { ...h, enabled: e.target.checked };
                    setCustomHeaders(next);
                  }}
                  className="shrink-0 accent-accent"
                />
                <input
                  type="text" value={h.key} placeholder="Header name"
                  onChange={e => {
                    const next = [...customHeaders];
                    next[i] = { ...h, key: e.target.value };
                    setCustomHeaders(next);
                  }}
                  className="w-40 bg-surface border border-border rounded-md px-2 py-1 text-sm font-mono text-text-primary
                             placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <input
                  type="text" value={h.value} placeholder="Value"
                  onChange={e => {
                    const next = [...customHeaders];
                    next[i] = { ...h, value: e.target.value };
                    setCustomHeaders(next);
                  }}
                  className="flex-1 bg-surface border border-border rounded-md px-2 py-1 text-sm font-mono text-text-primary
                             placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  onClick={() => setCustomHeaders(customHeaders.filter((_, j) => j !== i))}
                  className="text-text-muted hover:text-danger p-1"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              onClick={() => setCustomHeaders([...customHeaders, { key: '', value: '', enabled: true }])}
              className="text-sm text-accent hover:text-accent-emphasis transition-colors"
            >
              + Add header
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function generateExampleBody(schema: unknown): string {
  if (!schema || typeof schema !== 'object') return '{}';
  const s = schema as Record<string, unknown>;
  if (s.type === 'object' && s.properties) {
    const example: Record<string, unknown> = {};
    const required = (s.required as string[]) || [];
    for (const [key, val] of Object.entries(s.properties as Record<string, Record<string, unknown>>)) {
      if (!required.includes(key) && Object.keys(s.properties as object).length > 6) continue;
      example[key] = getDefaultForType(val);
    }
    return JSON.stringify(example, null, 2);
  }
  return '{}';
}

function getDefaultForType(schema: Record<string, unknown>): unknown {
  if (schema.default !== undefined) return schema.default;
  if (schema.enum && Array.isArray(schema.enum)) return schema.enum[0];
  switch (schema.type) {
    case 'string': return '';
    case 'number': case 'integer': return 0;
    case 'boolean': return false;
    case 'array': return [];
    case 'object': return {};
    default: return null;
  }
}

function EndpointInfo({ summary, description }: { summary: string; description: string }) {
  const hasDescription = description && description.trim().length > 0;

  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-text-primary">{summary}</p>
      {hasDescription && (
        <div className="mt-1.5 p-2.5 bg-surface/50 border border-border rounded-md text-xs text-text-secondary leading-relaxed space-y-1.5">
          <SimpleMarkdown text={description} />
        </div>
      )}
    </div>
  );
}

function SimpleMarkdown({ text }: { text: string }) {
  // Render basic markdown: headings, bold, links, code, blockquotes, lists
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines
    if (!line.trim()) {
      elements.push(<div key={i} className="h-1" />);
      continue;
    }

    // GitHub-style note/warning callouts: > [!NOTE]
    if (/^>\s*\[!(NOTE|WARNING|IMPORTANT|TIP|CAUTION)\]/.test(line)) {
      const match = line.match(/\[!(NOTE|WARNING|IMPORTANT|TIP|CAUTION)\]/);
      const type = match?.[1] || 'NOTE';
      const colorMap: Record<string, string> = {
        NOTE: 'border-accent text-accent',
        WARNING: 'border-warning text-warning',
        IMPORTANT: 'border-danger text-danger',
        TIP: 'border-success text-success',
        CAUTION: 'border-warning text-warning',
      };
      elements.push(
        <div key={i} className={`border-l-2 pl-2 ${colorMap[type] || 'border-accent text-accent'} font-semibold`}>
          {type}
        </div>
      );
      continue;
    }

    // Blockquote continuation
    if (line.startsWith('> ')) {
      elements.push(
        <div key={i} className="border-l-2 border-border pl-2 text-text-muted">
          <InlineMarkdown text={line.slice(2)} />
        </div>
      );
      continue;
    }

    // List items
    if (/^[-*]\s/.test(line)) {
      elements.push(
        <div key={i} className="flex gap-1.5">
          <span className="text-text-muted shrink-0">•</span>
          <span><InlineMarkdown text={line.replace(/^[-*]\s/, '')} /></span>
        </div>
      );
      continue;
    }

    // Regular paragraph
    elements.push(<p key={i}><InlineMarkdown text={line} /></p>);
  }

  return <>{elements}</>;
}

function InlineMarkdown({ text }: { text: string }) {
  // Process inline markdown: **bold**, `code`, [links](url)
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Inline code
    const codeMatch = remaining.match(/`([^`]+)`/);
    // Link
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    // Find the earliest match
    const matches = [
      boldMatch ? { type: 'bold', index: boldMatch.index!, match: boldMatch } : null,
      codeMatch ? { type: 'code', index: codeMatch.index!, match: codeMatch } : null,
      linkMatch ? { type: 'link', index: linkMatch.index!, match: linkMatch } : null,
    ].filter(Boolean).sort((a, b) => a!.index - b!.index);

    if (matches.length === 0) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }

    const first = matches[0]!;
    if (first.index > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, first.index)}</span>);
    }

    if (first.type === 'bold') {
      parts.push(<strong key={key++} className="font-semibold text-text-primary">{first.match[1]}</strong>);
      remaining = remaining.slice(first.index + first.match[0].length);
    } else if (first.type === 'code') {
      parts.push(
        <code key={key++} className="px-1 py-0.5 bg-surface border border-border rounded text-[11px] font-mono text-accent">
          {first.match[1]}
        </code>
      );
      remaining = remaining.slice(first.index + first.match[0].length);
    } else if (first.type === 'link') {
      parts.push(
        <a key={key++} href={first.match[2]} target="_blank" rel="noopener noreferrer"
           className="text-accent hover:underline">
          {first.match[1]}
        </a>
      );
      remaining = remaining.slice(first.index + first.match[0].length);
    }
  }

  return <>{parts}</>;
}
