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
  const [showBatch, setShowBatch] = useState(false);
  const [batchParam, setBatchParam] = useState('');
  const [batchValues, setBatchValues] = useState('');

  // Keep a ref to activeEnv so the effect always reads the latest value
  const activeEnvRef = useRef(activeEnv);
  // Ref for keyboard shortcut to call latest executeRequest
  const executeRequestRef = useRef<(() => void) | null>(null);
  activeEnvRef.current = activeEnv;

  // Load environment variables
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!activeEnv) return;
    fetch(`/api/variables?environmentId=${activeEnv.id}`)
      .then(r => r.json())
      .then((vars: Array<{ name: string; value: string }>) => {
        const map: Record<string, string> = {};
        for (const v of vars) map[v.name] = v.value;
        setEnvVars(map);
      });
  }, [activeEnv]);

  // Reset form when endpoint changes
  useEffect(() => {
    if (!selectedEndpoint) return;
    const env = activeEnvRef.current;
    const allVars: Record<string, string> = { ...envVars };
    // Built-in variables from environment
    if (env) {
      if (env.org_name) { allVars['org'] = env.org_name; allVars['owner'] = env.org_name; }
      if (env.enterprise_slug) { allVars['enterprise'] = env.enterprise_slug; }
    }

    const pv: Record<string, string> = {};
    for (const p of selectedEndpoint.pathParams) {
      let defaultVal = p.default || '';
      if (!defaultVal && allVars[p.name]) {
        defaultVal = allVars[p.name];
      }
      pv[p.name] = defaultVal;
    }
    setPathValues(pv);

    const qv: Record<string, { value: string; enabled: boolean }> = {};
    for (const p of selectedEndpoint.queryParams) {
      let val = p.default || '';
      if (!val && allVars[p.name]) val = allVars[p.name];
      qv[p.name] = { value: val, enabled: p.required };
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

    // Validate required params before sending
    if (!nextPageUrl) {
      const missingPath = selectedEndpoint.pathParams
        .filter(p => p.required && !pathValues[p.name]?.trim())
        .map(p => p.name);

      const missingQuery = selectedEndpoint.queryParams
        .filter(p => p.required && (!queryValues[p.name]?.enabled || !queryValues[p.name]?.value?.trim()))
        .map(p => p.name);

      const missing = [...missingPath, ...missingQuery];
      if (missing.length > 0) {
        setResponse({
          status: 0,
          statusText: 'Validation Error',
          headers: {},
          body: {
            error: `Missing required parameters: ${missing.join(', ')}`,
            missing,
            hint: 'Fill in the required fields marked with * before sending.',
          },
          timing: 0,
          rateLimit: null,
          nextPageUrl: null,
        });
        return;
      }
    }

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

  // Batch execution — runs the endpoint for each value and displays results in response pane
  const executeBatch = useCallback(async () => {
    if (!selectedEndpoint || !activeEnv) return;
    const lines = batchValues.split('\n').map(l => l.trim()).filter(Boolean);
    const param = batchParam || selectedEndpoint.pathParams[0]?.name;
    if (lines.length === 0 || !param) return;

    setIsLoading(true);
    const results: Array<{ value: string; status: number; timing: number; body: unknown; error?: string }> = [];

    for (const value of lines) {
      const params = { ...pathValues, [param]: value };
      try {
        const enabledQueries: Record<string, string> = {};
        for (const [k, v] of Object.entries(queryValues)) {
          if (v.enabled && v.value) enabledQueries[k] = v.value;
        }
        const res = await fetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            environmentId: activeEnv.id,
            method: selectedEndpoint.method,
            path: selectedEndpoint.path,
            pathParams: params,
            queryParams: enabledQueries,
          }),
        });
        const data = await res.json();
        results.push({ value, status: data.status || 0, timing: data.timing || 0, body: data.body, error: data.error });
      } catch (err) {
        results.push({ value, status: 0, timing: 0, body: null, error: err instanceof Error ? err.message : 'Unknown' });
      }

      // Update response pane progressively
      const passed = results.filter(r => r.status >= 200 && r.status < 300).length;
      const failed = results.length - passed;
      const totalTime = results.reduce((a, r) => a + r.timing, 0);
      setResponse({
        status: failed > 0 ? 207 : 200,
        statusText: `Batch: ${passed} passed, ${failed} failed (${results.length}/${lines.length})`,
        headers: {},
        body: {
          _batch: true,
          param,
          total: lines.length,
          completed: results.length,
          passed,
          failed,
          totalTime,
          results: results.map(r => ({
            [param]: r.value,
            status: r.status,
            timing: `${r.timing}ms`,
            ...(r.error ? { error: r.error } : {}),
            response: r.body,
          })),
        },
        timing: totalTime,
        rateLimit: null,
        nextPageUrl: null,
      });
    }
    setIsLoading(false);
  }, [selectedEndpoint, activeEnv, pathValues, queryValues, batchParam, batchValues, setResponse, setIsLoading]);

  // Keep ref in sync for keyboard shortcut
  executeRequestRef.current = () => showBatch ? executeBatch() : executeRequest();

  if (!selectedEndpoint) {
    return (
      <div className="flex-1 h-full flex items-center justify-center bg-canvas">
        <div className="text-center -mt-16">
          <svg width="96" height="96" viewBox="0 0 16 16" fill="currentColor" className="mx-auto mb-4 text-text-primary">
            <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
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
            onClick={() => showBatch ? executeBatch() : executeRequest()}
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
            {showBatch ? `Run Batch (${batchValues.split('\n').filter(l => l.trim()).length})` : 'Send'}
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
          <SaveToCollectionButton
            method={selectedEndpoint.method}
            path={selectedEndpoint.path}
            pathParams={pathValues}
            queryParams={Object.fromEntries(
              Object.entries(queryValues).filter(([, v]) => v.enabled && v.value).map(([k, v]) => [k, v.value])
            )}
            headers={Object.fromEntries(customHeaders.filter(h => h.enabled && h.key).map(h => [h.key, h.value]))}
            body={bodyText && ['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method) ? bodyText : null}
            operationId={selectedEndpoint.operationId}
          />
          <button
            onClick={() => setShowBatch(!showBatch)}
            disabled={!activeEnv}
            className={`px-2.5 py-1.5 border text-sm rounded-md transition-colors shrink-0
              ${showBatch ? 'border-accent text-accent bg-accent/10' : 'border-border text-text-secondary hover:bg-surface disabled:opacity-50'}`}
            title="Batch execute with multiple parameter values"
          >
            Batch
          </button>
        </div>
        {/* Endpoint info */}
        {selectedEndpoint.summary && (
          <EndpointInfo
            summary={selectedEndpoint.summary}
            description={selectedEndpoint.description}
            operationId={selectedEndpoint.operationId}
            category={selectedEndpoint.category}
            specVersion={selectedEndpoint.specVersion}
          />
        )}
      </div>

      {/* Batch panel */}
      {/* Batch values input - shown in place of the batch runner panel */}
      {/* (now integrated into params tab below) */}

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
                      {p.enum ? (
                        <select
                          value={queryValues[p.name]?.value || ''}
                          onChange={e => setQueryValues(prev => ({
                            ...prev,
                            [p.name]: { ...prev[p.name], value: e.target.value, enabled: true }
                          }))}
                          className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary
                                     focus:outline-none focus:ring-1 focus:ring-accent"
                        >
                          <option value="">Select...</option>
                          {p.enum.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      ) : (
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
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedEndpoint.pathParams.length === 0 && selectedEndpoint.queryParams.length === 0 && (
              <p className="text-sm text-text-muted text-center py-8">No parameters for this endpoint</p>
            )}

            {/* Batch values input */}
            {showBatch && selectedEndpoint.pathParams.length > 0 && (
              <div className="border-t border-border pt-4">
                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  Batch Values
                  <span className="font-normal text-text-muted ml-1">— run this endpoint once per value</span>
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-text-secondary">Vary parameter:</label>
                    <select value={batchParam || selectedEndpoint.pathParams[0]?.name || ''}
                      onChange={e => setBatchParam(e.target.value)}
                      className="bg-surface border border-border rounded-md px-2 py-1 text-sm text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent">
                      {selectedEndpoint.pathParams.map(p => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    value={batchValues}
                    onChange={e => setBatchValues(e.target.value)}
                    placeholder={`Enter one value per line, e.g.:\ntpi-test-org\ntpi-innersource\ntpitest-research`}
                    rows={4}
                    className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text-primary font-mono
                               resize-y focus:outline-none focus:ring-1 focus:ring-accent placeholder-text-muted"
                  />
                  <p className="text-[10px] text-text-muted">
                    The Send button above will run {batchValues.split('\n').filter(l => l.trim()).length} requests. Results appear in the response panel →
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'body' && (
          <div className="h-full">
            {['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method) ? (
              <div>
                <textarea
                  value={bodyText}
                  onChange={e => setBodyText(e.target.value)}
                  placeholder='{"key": "value"}'
                  className={`w-full h-64 bg-surface border rounded-md px-3 py-2 text-sm text-text-primary
                             font-mono resize-y focus:outline-none focus:ring-1 focus:ring-accent
                             ${bodyText && !isValidJson(bodyText) ? 'border-danger' : 'border-border'}`}
                  spellCheck={false}
                />
                {bodyText && !isValidJson(bodyText) && (
                  <p className="text-xs text-danger mt-1.5 flex items-center gap-1">
                    <span>⚠</span> Invalid JSON — fix before sending
                  </p>
                )}
              </div>
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

function isValidJson(text: string): boolean {
  if (!text.trim()) return true;
  try { JSON.parse(text); return true; } catch { return false; }
}

function EndpointInfo({ summary, description, operationId, category, specVersion }: {
  summary: string; description: string; operationId: string; category: string; specVersion: string;
}) {
  const hasDescription = description && description.trim().length > 0;

  // Build version-aware GitHub docs URL
  // Cloud: /rest/{category} | GHES: /enterprise-server@3.10/rest/{category}
  let docsBase = 'https://docs.github.com';
  if (specVersion && specVersion.startsWith('ghes-')) {
    const ver = specVersion.replace('ghes-', '');
    docsBase = `https://docs.github.com/enterprise-server@${ver}`;
  } else if (specVersion === 'ghec') {
    docsBase = 'https://docs.github.com/enterprise-cloud@latest';
  }
  const docsUrl = `${docsBase}/rest/${encodeURIComponent(category)}`;

  return (
    <div className="mt-2">
      <div className="flex items-start gap-2">
        <p className="text-xs font-medium text-text-primary flex-1">{summary}</p>
        <a href={docsUrl} target="_blank" rel="noopener noreferrer"
          className="text-[11px] text-accent hover:underline shrink-0 flex items-center gap-0.5">
          Docs
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z" />
          </svg>
        </a>
      </div>
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

function SaveToCollectionButton({
  method, path, pathParams, queryParams, headers, body, operationId,
}: {
  method: string; path: string; pathParams: Record<string, string>;
  queryParams: Record<string, string>; headers: Record<string, string>;
  body: string | null; operationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([]);
  const [saved, setSaved] = useState(false);

  async function loadCollections() {
    const res = await fetch('/api/collections');
    setCollections(await res.json());
  }

  async function saveToCollection(collectionId: string) {
    await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add-item',
        collectionId,
        operationId,
        method,
        path,
        pathParams,
        queryParams,
        headers,
        body,
      }),
    });
    setSaved(true);
    setTimeout(() => { setSaved(false); setOpen(false); }, 1500);
  }

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(!open); if (!open) loadCollections(); }}
        className="px-2.5 py-1.5 border border-border text-text-secondary text-sm rounded-md
                   hover:bg-surface transition-colors shrink-0"
        title="Save to collection"
      >
        {saved ? '✓ Saved' : 'Save'}
      </button>
      {open && !saved && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-panel border border-border rounded-lg shadow-lg z-50 py-1">
          {collections.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-muted">No collections. Create one in Collections page.</div>
          ) : (
            collections.map(c => (
              <button key={c.id} onClick={() => saveToCollection(c.id)}
                className="w-full text-left px-3 py-1.5 text-sm text-text-primary hover:bg-surface transition-colors">
                {c.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
