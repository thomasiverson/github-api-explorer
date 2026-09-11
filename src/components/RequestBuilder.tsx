'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from './AppContext';
import { ConfirmDialog, isDestructiveMethod, getConfirmMessage } from './ConfirmDialog';
import { ParamCombobox, isDiscoverableParam, getDiscoveryConfig } from './ParamCombobox';
import {
  applyBatchJsonLine,
  applyBatchValue,
  buildRestUrl,
  collectEnabledHeaders,
  collectEnabledQueryParams,
  parseBatchJsonLines,
  resolvePath,
} from '@/lib/rest-request';
import { generateExampleBody } from '@/lib/openapi-example';
import type { BatchTarget, QueryParamValue } from '@/lib/rest-request';
import type { ExecuteResponse } from '@/lib/types';

const METHOD_BG: Record<string, string> = {
  GET: 'bg-method-get', POST: 'bg-method-post',
  PUT: 'bg-method-put', PATCH: 'bg-method-patch', DELETE: 'bg-method-delete',
};

const REQUEST_BODY_EXAMPLES: Record<string, Record<string, unknown>> = {
  'billing/create-budget': {
    budget_amount: 30,
    prevent_further_usage: true,
    budget_scope: 'user',
    budget_entity_name: '',
    budget_type: 'BundlePricing',
    budget_product_sku: 'ai_credits',
    budget_alerting: {
      will_alert: false,
      alert_recipients: [],
    },
    user: 'GITHUB_LOGIN',
  },
  'billing/update-budget': {
    prevent_further_usage: true,
    budget_amount: 10,
    budget_alerting: {
      will_alert: false,
      alert_recipients: [],
    },
  },
  'billing/update-budget-org': {
    prevent_further_usage: true,
    budget_amount: 10,
    budget_alerting: {
      will_alert: false,
      alert_recipients: [],
    },
  },
};

function getBatchBodyPropertyNames(bodyText: string): string[] {
  if (!bodyText.trim()) return [];
  try {
    const body = JSON.parse(bodyText) as unknown;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return [];
    return Object.entries(body)
      .filter(([, value]) => typeof value !== 'object' || value === null)
      .map(([name]) => name);
  } catch {
    return [];
  }
}

function getBatchJsonlExample(bodyText: string): string {
  if (!bodyText.trim()) return '';
  try {
    const body = JSON.parse(bodyText) as unknown;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return '';
    return JSON.stringify(body);
  } catch {
    return '';
  }
}

function getDefaultBatchTargetValue(pathNames: string[], queryNames: string[], bodyNames: string[]): string {
  if (pathNames[0]) return `path:${pathNames[0]}`;
  if (queryNames[0]) return `query:${queryNames[0]}`;
  if (bodyNames[0]) return `body:${bodyNames[0]}`;
  return '';
}

function parseBatchTarget(value: string): BatchTarget | null {
  const separator = value.indexOf(':');
  if (separator < 1) return null;
  const location = value.slice(0, separator);
  const name = value.slice(separator + 1);
  if (!name || !['path', 'query', 'body'].includes(location)) return null;
  return { location: location as BatchTarget['location'], name };
}

export function RequestBuilder() {
  const { selectedEndpoint, activeEnv, setResponse, setIsLoading, isLoading } = useApp();
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [queryValues, setQueryValues] = useState<Record<string, { value: string; enabled: boolean }>>({});
  const [bodyText, setBodyText] = useState('');
  const [activeTab, setActiveTab] = useState<'params' | 'body' | 'headers'>('params');
  const [customHeaders, setCustomHeaders] = useState<Array<{ key: string; value: string; enabled: boolean }>>([]);
  const [curlCopied, setCurlCopied] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [batchMode, setBatchMode] = useState<'single' | 'jsonl'>('single');
  const [batchTargetValue, setBatchTargetValue] = useState('');
  const [batchValues, setBatchValues] = useState('');
  const [confirmState, setConfirmState] = useState<{ action: () => void } | null>(null);

  // Ref for keyboard shortcut to call latest executeRequest
  const executeRequestRef = useRef<(() => void) | null>(null);

  // Load environment variables
  const [envVars, setEnvVars] = useState<{ environmentId: string; values: Record<string, string> }>({
    environmentId: '',
    values: {},
  });
  useEffect(() => {
    if (!activeEnv) {
      setEnvVars({ environmentId: '', values: {} });
      return;
    }
    const environmentId = activeEnv.id;
    fetch(`/api/variables?environmentId=${activeEnv.id}`)
      .then(r => r.json())
      .then((vars: Array<{ name: string; value: string }>) => {
        const map: Record<string, string> = {};
        for (const v of vars) map[v.name] = v.value;
        setEnvVars({ environmentId, values: map });
      })
      .catch((error: unknown) => {
        console.error('Failed to load environment variables:', error);
      });
  }, [activeEnv]);

  // Rebase parameters when either the endpoint or active environment changes.
  useEffect(() => {
    if (!selectedEndpoint) return;
    const allVars: Record<string, string> = envVars.environmentId === activeEnv?.id
      ? { ...envVars.values }
      : {};
    // Built-in variables from environment
    if (activeEnv) {
      if (activeEnv.org_name) { allVars['org'] = activeEnv.org_name; allVars['owner'] = activeEnv.org_name; }
      if (activeEnv.enterprise_slug) { allVars['enterprise'] = activeEnv.enterprise_slug; }
    }

    const pv: Record<string, string> = {};
    for (const p of selectedEndpoint.pathParams) {
      // Priority: initialPathValues (replay) > env vars > defaults
      let defaultVal = selectedEndpoint.initialPathValues?.[p.name] || p.default || '';
      if (!defaultVal && allVars[p.name]) {
        defaultVal = allVars[p.name];
      }
      pv[p.name] = defaultVal;
    }
    setPathValues(pv);

    const qv: Record<string, { value: string; enabled: boolean }> = {};
    for (const p of selectedEndpoint.queryParams) {
      // Priority: initialQueryValues (replay) > env vars > defaults
      const initVal = selectedEndpoint.initialQueryValues?.[p.name];
      let val = initVal || p.default || '';
      if (!val && allVars[p.name]) val = allVars[p.name];
      qv[p.name] = { value: val, enabled: p.required || !!initVal };
    }
    setQueryValues(qv);
  }, [selectedEndpoint, activeEnv, envVars]);

  // Reset endpoint-specific content independently so environment changes do not erase body edits.
  useEffect(() => {
    if (!selectedEndpoint) return;
    if (selectedEndpoint.initialBody) {
      setBodyText(selectedEndpoint.initialBody);
    } else if (REQUEST_BODY_EXAMPLES[selectedEndpoint.operationId]) {
      setBodyText(JSON.stringify(REQUEST_BODY_EXAMPLES[selectedEndpoint.operationId], null, 2));
    } else if (selectedEndpoint.bodySchema) {
      setBodyText(generateExampleBody(selectedEndpoint.bodySchema));
    } else {
      setBodyText('');
    }
    setBatchMode('single');
    setBatchTargetValue('');
    setBatchValues('');
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

  const resolvedPath = selectedEndpoint ? resolvePath(selectedEndpoint.path, pathValues) : '';

  const buildResolvedUrl = useCallback(() => {
    if (!selectedEndpoint || !activeEnv) return '';
    const enabledQueries = collectEnabledQueryParams(queryValues, selectedEndpoint.queryParams);
    return buildRestUrl(activeEnv.base_url, selectedEndpoint.path, pathValues, enabledQueries);
  }, [selectedEndpoint, activeEnv, queryValues, pathValues]);

  const copyAsCurl = useCallback(() => {
    if (!selectedEndpoint || !activeEnv) return;
    const url = buildResolvedUrl();
    const parts = ['curl'];
    if (selectedEndpoint.method !== 'GET') {
      parts.push(`-X ${selectedEndpoint.method}`);
    }
    parts.push(`"${url}"`);
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...collectEnabledHeaders(customHeaders),
      Authorization: 'token YOUR_TOKEN',
    };
    for (const [key, value] of Object.entries(headers)) {
      parts.push(`-H "${key}: ${value}"`);
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
        setResponse(createValidationResponse(missing));
        return;
      }
    }

    setIsLoading(true);

    try {
      const enabledQueries = collectEnabledQueryParams(queryValues, selectedEndpoint.queryParams);
      const enabledHeaders = collectEnabledHeaders(customHeaders);
      let requestBody: unknown = null;
      if (bodyText && ['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method)) {
        try {
          requestBody = JSON.parse(bodyText);
        } catch {
          setResponse(createClientErrorResponse('Invalid JSON request body'));
          return;
        }
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
          body: requestBody,
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
    const bodyPropertyNames = getBatchBodyPropertyNames(bodyText);
    const defaultTargetValue = getDefaultBatchTargetValue(
      selectedEndpoint.pathParams.map(param => param.name),
      selectedEndpoint.queryParams.map(param => param.name),
      bodyPropertyNames
    );
    const target = parseBatchTarget(batchTargetValue || defaultTargetValue);
    if (lines.length === 0 || (batchMode === 'single' && !target)) return;

    let requestBody: unknown = null;
    if (bodyText && ['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method)) {
      try {
        requestBody = JSON.parse(bodyText);
      } catch {
        setResponse(createClientErrorResponse('Invalid JSON request body'));
        return;
      }
    }

    const enabledQueries = collectEnabledQueryParams(queryValues, selectedEndpoint.queryParams);
    const enabledHeaders = collectEnabledHeaders(customHeaders);
    const baseRequestValues = { pathParams: pathValues, queryParams: enabledQueries, body: requestBody };
    let batchRequests: Array<{
      label: string;
      input: unknown;
      requestValues: ReturnType<typeof applyBatchJsonLine>;
    }>;

    if (batchMode === 'jsonl') {
      const parsed = parseBatchJsonLines(batchValues);
      if (parsed.errors.length > 0) {
        setResponse(createClientErrorResponse(parsed.errors
          .map(error => error.lineNumber > 0 ? `Line ${error.lineNumber}: ${error.message}` : error.message)
          .join('\n')));
        return;
      }
      batchRequests = [];
      for (const row of parsed.rows) {
        try {
          batchRequests.push({
            label: `Line ${row.lineNumber}`,
            input: row.input,
            requestValues: applyBatchJsonLine(baseRequestValues, row.input),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Invalid JSONL batch input';
          setResponse(createClientErrorResponse(`Line ${row.lineNumber}: ${message}`));
          return;
        }
      }
    } else {
      batchRequests = lines.map(value => ({
        label: value,
        input: value,
        requestValues: applyBatchValue(baseRequestValues, target!, value),
      }));
    }

    const invalidRequest = batchRequests.find(item => {
      const missingPath = selectedEndpoint.pathParams.some(param => (
        param.required && !item.requestValues.pathParams[param.name]?.trim()
      ));
      const missingQuery = selectedEndpoint.queryParams.some(param => {
        const value = item.requestValues.queryParams[param.name];
        return param.required && (!value || (Array.isArray(value) ? value.length === 0 : !value.trim()));
      });
      return missingPath || missingQuery;
    });
    if (invalidRequest) {
      setResponse(createClientErrorResponse(`${invalidRequest.label} is missing a required path or query parameter`));
      return;
    }

    setIsLoading(true);
    const results: Array<{ label: string; input: unknown; status: number; timing: number; body: unknown; error?: string }> = [];
    const targetLabel = batchMode === 'jsonl' ? 'jsonl' : `${target!.location}.${target!.name}`;

    for (const batchRequest of batchRequests) {
      try {
        const res = await fetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            environmentId: activeEnv.id,
            method: selectedEndpoint.method,
            path: selectedEndpoint.path,
            pathParams: batchRequest.requestValues.pathParams,
            queryParams: batchRequest.requestValues.queryParams,
            headers: enabledHeaders,
            body: batchRequest.requestValues.body,
            operationId: selectedEndpoint.operationId,
            category: selectedEndpoint.category,
          }),
        });
        const data = await res.json();
        results.push({ label: batchRequest.label, input: batchRequest.input, status: data.status || 0, timing: data.timing || 0, body: data.body, error: data.error });
      } catch (err) {
        results.push({ label: batchRequest.label, input: batchRequest.input, status: 0, timing: 0, body: null, error: err instanceof Error ? err.message : 'Unknown' });
      }

      // Update response pane progressively
      const passed = results.filter(r => r.status >= 200 && r.status < 300).length;
      const failed = results.length - passed;
      const totalTime = results.reduce((a, r) => a + r.timing, 0);
      setResponse({
        status: failed > 0 ? 207 : 200,
        statusText: `Batch: ${passed} passed, ${failed} failed (${results.length}/${batchRequests.length})`,
        headers: {},
        body: {
          _batch: true,
          target: targetLabel,
          total: batchRequests.length,
          completed: results.length,
          passed,
          failed,
          totalTime,
          results: results.map(r => ({
            item: r.label,
            input: r.input,
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
  }, [selectedEndpoint, activeEnv, pathValues, queryValues, bodyText, customHeaders, batchMode, batchTargetValue, batchValues, setResponse, setIsLoading]);

  // Keep ref in sync for keyboard shortcut
  executeRequestRef.current = () => maybeConfirmExecute();

  function maybeConfirmExecute() {
    if (!selectedEndpoint) return;
    const action = () => showBatch ? executeBatch() : executeRequest();
    if (isDestructiveMethod(selectedEndpoint.method)) {
      setConfirmState({ action });
    } else {
      action();
    }
  }

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

  const batchBodyPropertyNames = getBatchBodyPropertyNames(bodyText);
  const defaultBatchTargetValue = getDefaultBatchTargetValue(
    selectedEndpoint.pathParams.map(param => param.name),
    selectedEndpoint.queryParams.map(param => param.name),
    batchBodyPropertyNames
  );
  const effectiveBatchTargetValue = batchTargetValue || defaultBatchTargetValue;
  const effectiveBatchTarget = parseBatchTarget(effectiveBatchTargetValue);
  const hasBatchTargets = defaultBatchTargetValue.length > 0;
  const parsedJsonLines = batchMode === 'jsonl' ? parseBatchJsonLines(batchValues) : null;
  const batchRequestCount = batchMode === 'jsonl'
    ? parsedJsonLines?.rows.length || 0
    : batchValues.split('\n').filter(line => line.trim()).length;
  const batchHasErrors = (parsedJsonLines?.errors.length || 0) > 0;

  return (
    <div className="flex-1 flex flex-col bg-canvas min-w-0 overflow-x-hidden">
      {/* URL Bar */}
      <div className="p-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2.5 py-1 rounded ${METHOD_BG[selectedEndpoint.method] || 'bg-text-muted'} text-white shrink-0`}>
            {selectedEndpoint.method}
          </span>
          <div className="flex-1 font-mono text-sm text-text-primary bg-surface border border-border rounded-md px-3 py-1.5 truncate">
            {resolvedPath}
          </div>
          <button
            onClick={() => maybeConfirmExecute()}
            disabled={isLoading || !activeEnv || (showBatch && (batchRequestCount === 0 || batchHasErrors))}
            className="px-4 py-1.5 bg-accent-emphasis text-white text-sm font-medium rounded-md
                       hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center gap-2"
          >
            {isLoading ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : null}
            {showBatch ? `Run Batch (${batchRequestCount})` : 'Send'}
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
            queryParams={collectEnabledQueryParams(queryValues, selectedEndpoint.queryParams)}
            headers={collectEnabledHeaders(customHeaders)}
            body={bodyText && ['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method) ? bodyText : null}
            operationId={selectedEndpoint.operationId}
          />
          <button
            onClick={() => {
              const nextShowBatch = !showBatch;
              setShowBatch(nextShowBatch);
              if (nextShowBatch) setActiveTab('params');
            }}
            disabled={!activeEnv || !hasBatchTargets}
            className={`px-2.5 py-1.5 border text-sm rounded-md transition-colors shrink-0
              ${showBatch ? 'border-accent text-accent bg-accent/10' : 'border-border text-text-secondary hover:bg-surface disabled:opacity-50'}`}
            title={hasBatchTargets ? 'Batch execute with multiple request values' : 'This request has no batchable values'}
          >
            Batch
          </button>
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Endpoint info */}
        {selectedEndpoint.summary && (
          <div className="px-3 pt-2">
            <EndpointInfo
              summary={selectedEndpoint.summary}
              description={selectedEndpoint.description}
              category={selectedEndpoint.category}
              specVersion={selectedEndpoint.specVersion}
            />
          </div>
        )}

      {/* Batch panel */}
      {/* Batch values input - shown in place of the batch runner panel */}
      {/* (now integrated into params tab below) */}

      {/* Tabs */}
      <div className="flex border-b border-border sticky top-0 bg-canvas z-10">
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
             tab === 'body' ? <>Body{selectedEndpoint.bodySchema && (selectedEndpoint.bodySchema as Record<string, unknown>).required ? <span className="ml-1 text-warning text-xs">●</span> : ''}</> : 'Headers'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-3">
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
                        <ParamCombobox
                          paramName={p.name}
                          value={pathValues[p.name] || ''}
                          onChange={v => setPathValues(prev => ({ ...prev, [p.name]: v }))}
                          allParamValues={pathValues}
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
                             [p.name]: { ...prev[p.name], value: e.target.value, enabled: e.target.value.length > 0 }
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
                            [p.name]: {
                              ...prev[p.name],
                              value: e.target.value,
                              enabled: e.target.value.length > 0,
                            }
                          }))}
                          placeholder={p.type === 'array' ? 'Comma-separated values' : p.description || p.type}
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
            {showBatch && hasBatchTargets && (
              <div className="border-t border-border pt-4">
                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  Batch Values
                  <span className="font-normal text-text-muted ml-1">— run this endpoint once per value</span>
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-1" role="group" aria-label="Batch input mode">
                    <button type="button" onClick={() => setBatchMode('single')}
                      aria-pressed={batchMode === 'single'}
                      className={`px-3 py-1 text-xs border rounded-l-md ${batchMode === 'single' ? 'bg-accent-emphasis text-white border-accent' : 'border-border text-text-secondary hover:bg-surface'}`}>
                      Single field
                    </button>
                    <button type="button" onClick={() => {
                      setBatchMode('jsonl');
                      if (!batchValues.trim()) setBatchValues(getBatchJsonlExample(bodyText));
                    }}
                      aria-pressed={batchMode === 'jsonl'}
                      className={`px-3 py-1 text-xs border rounded-r-md ${batchMode === 'jsonl' ? 'bg-accent-emphasis text-white border-accent' : 'border-border text-text-secondary hover:bg-surface'}`}>
                      JSONL
                    </button>
                  </div>
                  {batchMode === 'single' && (
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-text-secondary">Vary by:</label>
                      <select value={effectiveBatchTargetValue}
                        onChange={e => setBatchTargetValue(e.target.value)}
                        className="bg-surface border border-border rounded-md px-2 py-1 text-sm text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent">
                      {selectedEndpoint.pathParams.length > 0 && (
                        <optgroup label="Path">
                          {selectedEndpoint.pathParams.map(param => (
                            <option key={param.name} value={`path:${param.name}`}>{param.name}</option>
                          ))}
                        </optgroup>
                      )}
                      {selectedEndpoint.queryParams.length > 0 && (
                        <optgroup label="Query">
                          {selectedEndpoint.queryParams.map(param => (
                            <option key={param.name} value={`query:${param.name}`}>{param.name}</option>
                          ))}
                        </optgroup>
                      )}
                      {batchBodyPropertyNames.length > 0 && (
                        <optgroup label="Body">
                          {batchBodyPropertyNames.map(name => (
                            <option key={name} value={`body:${name}`}>{name}</option>
                          ))}
                        </optgroup>
                      )}
                      </select>
                    </div>
                  )}
                  {batchMode === 'jsonl' && (
                    <div className="text-xs text-text-secondary space-y-1">
                      <p><span className="font-semibold text-text-primary">Body patch:</span> fields are merged directly into the current JSON body.</p>
                      <p><span className="font-semibold text-text-primary">Request envelope:</span> use <code className="font-mono">body</code>, <code className="font-mono">query</code>, or <code className="font-mono">path</code> to vary multiple request sections.</p>
                      <p className="text-text-muted">Each non-empty line is one request. Existing values remain unchanged unless that row overrides them.</p>
                    </div>
                  )}
                  <textarea
                    value={batchValues}
                    onChange={e => setBatchValues(e.target.value)}
                    spellCheck={false}
                    placeholder={batchMode === 'jsonl'
                      ? 'Enter one JSON object per line'
                      : 'Enter one value per line, e.g.:\ntpi-test-org\ntpi-innersource\ntpitest-research'}
                    rows={batchMode === 'jsonl' ? 6 : 4}
                    className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text-primary font-mono
                               resize-y focus:outline-none focus:ring-1 focus:ring-accent placeholder-text-muted"
                  />
                  <div className="flex items-center gap-2">
                    {batchMode === 'jsonl' ? (
                      <p className={`text-xs flex-1 ${parsedJsonLines && parsedJsonLines.errors.length > 0
                        ? 'text-danger'
                        : batchRequestCount > 0 ? 'text-success font-medium' : 'text-text-muted'}`}>
                        {batchRequestCount === 0 && (!parsedJsonLines || parsedJsonLines.errors.length === 0)
                          ? 'Pending: enter one JSON object per line'
                          : parsedJsonLines && parsedJsonLines.errors.length > 0
                          ? `✘ ${parsedJsonLines.errors[0].lineNumber > 0 ? `Line ${parsedJsonLines.errors[0].lineNumber}: ` : ''}${parsedJsonLines.errors[0].message}`
                          : `✔ ${batchRequestCount} valid JSONL row${batchRequestCount === 1 ? '' : 's'}`}
                      </p>
                    ) : (
                      <p className="text-[10px] text-text-muted flex-1">
                        The Send button above will run {batchRequestCount} requests. Results appear in the response panel →
                      </p>
                    )}
                    {batchMode === 'single' && effectiveBatchTarget && isDiscoverableParam(effectiveBatchTarget.name) && (
                      <button
                        type="button"
                        onClick={async () => {
                          const paramName = effectiveBatchTarget.name;
                          const config = getDiscoveryConfig(paramName);
                          if (!config) return;
                          const params = new URLSearchParams({ type: config.type });
                          if (config.dependsOn && config.paramMapping) {
                            for (const dep of config.dependsOn) {
                              const val = pathValues[dep]?.trim();
                              if (val && config.paramMapping[dep]) {
                                params.set(config.paramMapping[dep], val);
                              }
                            }
                          }
                          try {
                            const res = await fetch(`/api/discover?${params.toString()}`);
                            if (res.ok) {
                              const data = await res.json() as Array<{ value: string }>;
                              setBatchValues(data.map(d => d.value).join('\n'));
                            }
                          } catch { /* ignore */ }
                        }}
                        className="text-[10px] text-accent hover:text-accent-emphasis whitespace-nowrap"
                      >
                        Fill all from API
                      </button>
                    )}
                  </div>
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
      </div>{/* end scrollable content area */}
      {confirmState && selectedEndpoint && (() => {
        const info = getConfirmMessage(selectedEndpoint.method);
        return (
          <ConfirmDialog
            open={true}
            title={info.title}
            message={info.message}
            detail={`${selectedEndpoint.method} ${resolvedPath}`}
            confirmLabel={`Send ${selectedEndpoint.method}`}
            variant={info.variant}
            onConfirm={() => { const action = confirmState.action; setConfirmState(null); action(); }}
            onCancel={() => setConfirmState(null)}
          />
        );
      })()}
    </div>
  );
}

function createValidationResponse(missing: string[]): ExecuteResponse {
  return {
    status: 400,
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
    nextPageRequest: null,
  };
}

function createClientErrorResponse(message: string): ExecuteResponse {
  return {
    status: 400,
    statusText: 'Validation Error',
    headers: {},
    body: { error: message },
    timing: 0,
    rateLimit: null,
    nextPageUrl: null,
    nextPageRequest: null,
  };
}

function isValidJson(text: string): boolean {
  if (!text.trim()) return true;
  try { JSON.parse(text); return true; } catch { return false; }
}

function EndpointInfo({ summary, description, category, specVersion }: {
  summary: string; description: string; category: string; specVersion: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
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
        <div className="mt-1.5">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-[11px] text-text-muted hover:text-text-primary flex items-center gap-1 mb-1 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"
              className={`transition-transform ${collapsed ? '' : 'rotate-90'}`}>
              <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
            </svg>
            {collapsed ? 'Show description' : 'Hide description'}
          </button>
          {!collapsed && (
            <div className="p-2.5 bg-surface/50 border border-border rounded-md text-xs text-text-secondary leading-relaxed space-y-1.5">
              <SimpleMarkdown text={description} />
            </div>
          )}
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
  queryParams: Record<string, QueryParamValue>; headers: Record<string, string>;
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
