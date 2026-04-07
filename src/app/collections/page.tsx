'use client';

import React, { useState, useEffect } from 'react';
import { TopBar } from '@/components/TopBar';
import { useApp } from '@/components/AppContext';
import { ConfirmDialog, isDestructiveMethod, getConfirmMessage } from '@/components/ConfirmDialog';
import { ParamCombobox } from '@/components/ParamCombobox';

interface Collection {
  id: string; name: string; description: string; item_count: number;
  created_at: string; updated_at: string;
}

interface CollectionItem {
  id: string; method: string; path: string; path_params: string;
  query_params: string; headers: string; body: string | null; sort_order: number;
}

interface RunResult {
  itemId: string; status: number; timing: number; error?: string;
  responseBody?: unknown; path?: string;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'method-get-bg', POST: 'method-post-bg', PUT: 'method-put-bg',
  PATCH: 'method-patch-bg', DELETE: 'method-delete-bg',
};

export default function CollectionsPage() {
  const { activeEnv } = useApp();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [editingName, setEditingName] = useState('');
  const [editingDesc, setEditingDesc] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [runResults, setRunResults] = useState<RunResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [runningItemId, setRunningItemId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    action: () => void;
    method: string;
    path: string;
    bulk?: boolean;
  } | null>(null);

  useEffect(() => { loadCollections(); }, []);

  useEffect(() => {
    setRunResults([]);
    setExpandedItems(new Set());
    if (selectedId) loadItems(selectedId);
  }, [selectedId]);

  async function loadCollections() {
    const res = await fetch('/api/collections');
    const data = await res.json();
    setCollections(data);
    return data as Collection[];
  }

  async function createColl() {
    if (!newName.trim()) return;
    const res = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', name: newName, description: newDesc }),
    });
    const data = await res.json();
    setShowNewForm(false);
    setNewName('');
    setNewDesc('');
    const updated = await loadCollections();
    setSelectedId(data.id);
    const coll = updated.find((c: Collection) => c.id === data.id);
    if (coll) { setEditingName(coll.name); setEditingDesc(coll.description); }
  }

  async function deleteColl(id: string) {
    await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    if (selectedId === id) { setSelectedId(null); setItems([]); }
    loadCollections();
  }

  async function duplicateColl(id: string) {
    const res = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'duplicate', id }),
    });
    const data = await res.json();
    const updated = await loadCollections();
    setSelectedId(data.id);
    const coll = updated.find((c: Collection) => c.id === data.id);
    if (coll) { setEditingName(coll.name); setEditingDesc(coll.description); }
  }

  async function updateColl() {
    if (!selectedId) return;
    await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id: selectedId, name: editingName, description: editingDesc }),
    });
    loadCollections();
  }

  async function loadItems(collId: string) {
    const res = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-items', collectionId: collId }),
    });
    const data = await res.json();
    setItems(data);
    const coll = collections.find(c => c.id === collId);
    if (coll) { setEditingName(coll.name); setEditingDesc(coll.description); }
  }

  async function deleteItem(id: string) {
    await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-item', id }),
    });
    if (selectedId) loadItems(selectedId);
    loadCollections();
  }

  async function moveItem(index: number, direction: -1 | 1) {
    if (!selectedId) return;
    const newItems = [...items];
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= newItems.length) return;
    [newItems[index], newItems[swapIdx]] = [newItems[swapIdx], newItems[index]];
    setItems(newItems);
    await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder', collectionId: selectedId, itemIds: newItems.map(i => i.id) }),
    });
  }

  async function executeItem(item: CollectionItem): Promise<RunResult> {
    try {
      // Auto-fill path params from active environment
      const storedParams = JSON.parse(item.path_params || '{}');
      const pathParams: Record<string, string> = { ...storedParams };
      if (activeEnv) {
        const placeholders = item.path.match(/\{([\w-]+)\}/g) || [];
        for (const ph of placeholders) {
          const name = ph.slice(1, -1);
          if (pathParams[name]) continue;
          if (name === 'org' || name === 'organization' || name === 'owner') {
            pathParams[name] = activeEnv.org_name || activeEnv.enterprise_slug || '';
          } else if (name === 'enterprise') {
            pathParams[name] = activeEnv.enterprise_slug || '';
          }
        }
      }

      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: item.method,
          path: item.path,
          pathParams,
          queryParams: JSON.parse(item.query_params || '{}'),
          headers: JSON.parse(item.headers || '{}'),
          body: item.body ? JSON.parse(item.body) : null,
        }),
      });
      const data = await res.json();
      let errorMsg = data.error;
      if (!errorMsg && data.status >= 400 && data.body) {
        const body = data.body as Record<string, unknown>;
        errorMsg = (body.message as string) || `HTTP ${data.status}`;
      }
      return { itemId: item.id, status: data.status || 0, timing: data.timing || 0, error: errorMsg, responseBody: data.body, path: item.path };
    } catch (err: unknown) {
      return { itemId: item.id, status: 0, timing: 0, error: err instanceof Error ? err.message : 'Unknown', path: item.path };
    }
  }

  async function runSingle(item: CollectionItem) {
    if (isDestructiveMethod(item.method)) {
      setConfirmState({
        action: () => doRunSingle(item),
        method: item.method,
        path: item.path,
      });
      return;
    }
    doRunSingle(item);
  }

  async function doRunSingle(item: CollectionItem) {
    setRunningItemId(item.id);
    const result = await executeItem(item);
    setRunResults(prev => {
      const filtered = prev.filter(r => r.itemId !== item.id);
      return [...filtered, result];
    });
    setExpandedItems(prev => new Set(prev).add(item.id));
    setRunningItemId(null);
  }

  async function runAll() {
    if (!selectedId || items.length === 0) return;
    const destructive = items.filter(i => isDestructiveMethod(i.method));
    if (destructive.length > 0) {
      const methods = [...new Set(destructive.map(i => i.method))];
      setConfirmState({
        action: () => doRunAll(),
        method: methods.join(', '),
        path: `${items.length} requests (${destructive.length} ${methods.join('/')}`,
        bulk: true,
      });
      return;
    }
    doRunAll();
  }

  async function doRunAll() {
    if (!selectedId || items.length === 0) return;
    setIsRunning(true);
    setRunResults([]);
    const results: RunResult[] = [];

    for (const item of items) {
      const result = await executeItem(item);
      results.push(result);
      setRunResults([...results]);
    }
    setIsRunning(false);
  }

  const selected = collections.find(c => c.id === selectedId);

  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <div className="flex-1 flex overflow-hidden">
        {/* Collection list */}
        <div className="w-72 border-r border-border bg-panel flex flex-col shrink-0">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Collections</span>
            <button onClick={() => setShowNewForm(true)}
              className="text-xs text-accent hover:text-accent-emphasis">+ New</button>
          </div>
          {showNewForm && (
            <div className="p-3 border-b border-border space-y-2">
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Collection name" autoFocus
                className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
              <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="Description (optional)"
                className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
              <div className="flex gap-2">
                <button onClick={createColl}
                  className="px-3 py-1 bg-accent-emphasis text-white text-xs rounded-md">Create</button>
                <button onClick={() => setShowNewForm(false)}
                  className="px-3 py-1 text-text-secondary text-xs border border-border rounded-md">Cancel</button>
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {collections.map(c => (
              <button key={c.id} onClick={() => setSelectedId(c.id)}
                className={`w-full text-left px-3 py-2 border-b border-border hover:bg-surface/50 transition-colors
                  ${selectedId === c.id ? 'bg-surface border-l-2 border-l-accent' : ''}`}>
                <div className="text-sm text-text-primary font-medium">{c.name}</div>
                <div className="text-xs text-text-muted">{c.item_count} requests</div>
              </button>
            ))}
            {collections.length === 0 && !showNewForm && (
              <div className="p-4 text-center text-text-muted text-xs">No collections yet</div>
            )}
          </div>
        </div>

        {/* Collection detail */}
        <div className="flex-1 overflow-y-auto">
          {!selected ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-text-secondary text-sm">Select a collection or create a new one</p>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto py-6 px-6">
              {/* Collection header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1 space-y-2">
                  <input type="text" value={editingName} onChange={e => setEditingName(e.target.value)}
                    onBlur={updateColl}
                    className="text-xl font-semibold bg-transparent text-text-primary focus:outline-none focus:ring-1 focus:ring-accent rounded px-1 -ml-1 w-full" />
                  <input type="text" value={editingDesc} onChange={e => setEditingDesc(e.target.value)}
                    onBlur={updateColl} placeholder="Add a description..."
                    className="text-sm bg-transparent text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent rounded px-1 -ml-1 w-full" />
                </div>
                <div className="flex gap-2 ml-4">
                  <button onClick={runAll} disabled={isRunning || items.length === 0}
                    className="px-3 py-1.5 bg-accent-emphasis text-white text-sm rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity">
                    {isRunning ? 'Running...' : `Run All (${items.length})`}
                  </button>
                  <button onClick={() => duplicateColl(selected.id)}
                    className="px-3 py-1.5 text-text-secondary text-sm border border-border rounded-md hover:bg-surface transition-colors">
                    Duplicate
                  </button>
                  <button onClick={() => deleteColl(selected.id)}
                    className="px-3 py-1.5 text-danger text-sm border border-border rounded-md hover:bg-surface transition-colors">
                    Delete
                  </button>
                </div>
              </div>

              {/* Run results summary */}
              {runResults.length > 0 && (
                <div className="mb-4 bg-surface border border-border rounded-lg overflow-hidden">
                  <div className="p-3 flex gap-4 text-sm border-b border-border">
                    <span className="text-success font-medium">{runResults.filter(r => r.status >= 200 && r.status < 300).length} passed</span>
                    <span className="text-danger font-medium">{runResults.filter(r => r.status === 0 || r.status >= 400).length} failed</span>
                    <span className="text-text-muted">{Math.round(runResults.reduce((a, r) => a + r.timing, 0))}ms total</span>
                  </div>
                  {/* Key findings */}
                  <div className="p-3 space-y-3">
                    {runResults.map(r => {
                      const info = describeEndpoint(r.path || '');
                      const isSuccess = r.status >= 200 && r.status < 300;
                      return (
                        <div key={r.itemId} className="text-xs">
                          <div className="flex items-start gap-2">
                            <span className={`shrink-0 mt-0.5 ${isSuccess ? 'text-success' : 'text-danger'}`}>
                              {isSuccess ? '✓' : '✗'}
                            </span>
                            <div className="flex-1">
                              <div className="font-medium text-text-primary">{info.title}</div>
                              {isSuccess && r.responseBody ? (
                                <div className="text-text-secondary mt-0.5">
                                  {summarizeResponse(r.path || '', r.responseBody)}
                                </div>
                              ) : (
                                <div className="text-danger mt-0.5">
                                  {r.error || `HTTP ${r.status}`}
                                  {info.errorHint && r.status >= 400 && (
                                    <span className="text-text-muted ml-1">— {info.errorHint}</span>
                                  )}
                                </div>
                              )}
                            </div>
                            <span className="text-text-muted shrink-0">{r.timing}ms</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Items */}
              <div className="space-y-1">
                {items.map((item, i) => {
                  const result = runResults.find(r => r.itemId === item.id);
                  const isExpanded = expandedItems.has(item.id);
                  return (
                    <div key={item.id}>
                      <div
                        className="flex items-center gap-2 p-2 bg-panel border border-border rounded-md hover:bg-surface/50 transition-colors cursor-pointer"
                        onClick={() => setExpandedItems(prev => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}
                      >
                        <div className="flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
                          <button onClick={() => moveItem(i, -1)} disabled={i === 0}
                            className="text-text-muted hover:text-text-primary disabled:opacity-20 text-xs">▲</button>
                          <button onClick={() => moveItem(i, 1)} disabled={i === items.length - 1}
                            className="text-text-muted hover:text-text-primary disabled:opacity-20 text-xs">▼</button>
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${METHOD_COLORS[item.method] || 'bg-text-muted'} shrink-0`}>
                          {item.method}
                        </span>
                        <span className="text-sm font-mono text-text-primary flex-1 truncate">{item.path}</span>
                        {result && (
                          <span className={`text-xs font-mono font-bold ${
                            result.status >= 200 && result.status < 300 ? 'text-success' : 'text-danger'
                          }`}>
                            {result.status || 'ERR'} {result.timing}ms
                          </span>
                        )}
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"
                          className={`text-text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                          <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
                        </svg>
                        <button onClick={e => { e.stopPropagation(); runSingle(item); }}
                          disabled={isRunning || runningItemId === item.id}
                          className="text-text-muted hover:text-accent p-1 transition-colors disabled:opacity-50" title="Run">
                          {runningItemId === item.id ? (
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="animate-spin">
                              <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm0 14.5a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z" opacity=".3"/>
                              <path d="M8 0a8 8 0 0 1 8 8h-1.5A6.5 6.5 0 0 0 8 1.5V0Z"/>
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215Z" />
                            </svg>
                          )}
                        </button>
                        <button onClick={e => { e.stopPropagation(); deleteItem(item.id); }}
                          className="text-text-muted hover:text-danger p-1 text-xs">✕</button>
                      </div>
                      {isExpanded && (
                        <ItemEditor item={item} result={result} onUpdate={(updated) => {
                          setItems(prev => prev.map(it => it.id === updated.id ? updated : it));
                        }} />
                      )}
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <div className="text-center py-8 text-text-muted text-sm">
                    <p>No requests in this collection yet.</p>
                    <p className="text-xs mt-1">Use the &quot;Save to Collection&quot; button in the request builder to add requests.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {confirmState && (() => {
        const info = getConfirmMessage(confirmState.method, confirmState.path);
        return (
          <ConfirmDialog
            open={true}
            title={confirmState.bulk ? 'Confirm Run All' : info.title}
            message={confirmState.bulk
              ? `This batch contains requests that will modify data on the server.`
              : info.message}
            detail={`${confirmState.method} ${confirmState.path}`}
            confirmLabel={confirmState.bulk ? 'Run All' : `Send ${confirmState.method}`}
            variant={info.variant}
            onConfirm={() => { const action = confirmState.action; setConfirmState(null); action(); }}
            onCancel={() => setConfirmState(null)}
          />
        );
      })()}
    </div>
  );
}

function ItemEditor({ item, result, onUpdate }: {
  item: CollectionItem;
  result: RunResult | undefined;
  onUpdate: (updated: CollectionItem) => void;
}) {
  const pathParams = JSON.parse(item.path_params || '{}') as Record<string, string>;
  const queryParams = JSON.parse(item.query_params || '{}') as Record<string, string>;
  const bodyStr = item.body ? JSON.stringify(JSON.parse(item.body), null, 2) : '';

  // Extract all {param} placeholders from path
  const placeholders = (item.path.match(/\{([\w-]+)\}/g) || []).map(p => p.slice(1, -1));
  // Ensure all placeholders have entries
  const allPathParams: Record<string, string> = {};
  for (const p of placeholders) allPathParams[p] = pathParams[p] || '';
  // Also include any stored params not in template (custom ones)
  for (const [k, v] of Object.entries(pathParams)) allPathParams[k] = v;

  const [editPathParams, setEditPathParams] = useState<Record<string, string>>(allPathParams);
  const [editQueryParams, setEditQueryParams] = useState<Record<string, string>>(queryParams);
  const [editBody, setEditBody] = useState(bodyStr);
  const [newQueryKey, setNewQueryKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [bodyError, setBodyError] = useState<string | null>(null);

  const hasChanges = JSON.stringify(editPathParams) !== JSON.stringify(allPathParams) ||
    JSON.stringify(editQueryParams) !== JSON.stringify(queryParams) ||
    editBody !== bodyStr;

  async function save() {
    // Validate body JSON if present
    let parsedBody: unknown = null;
    if (editBody.trim()) {
      try {
        parsedBody = JSON.parse(editBody);
        setBodyError(null);
      } catch {
        setBodyError('Invalid JSON');
        return;
      }
    }

    setSaving(true);
    await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update-item',
        id: item.id,
        pathParams: editPathParams,
        queryParams: editQueryParams,
        body: parsedBody,
      }),
    });
    onUpdate({
      ...item,
      path_params: JSON.stringify(editPathParams),
      query_params: JSON.stringify(editQueryParams),
      body: parsedBody ? JSON.stringify(parsedBody) : null,
    });
    setSaving(false);
  }

  function addQueryParam() {
    if (!newQueryKey.trim()) return;
    setEditQueryParams(prev => ({ ...prev, [newQueryKey.trim()]: '' }));
    setNewQueryKey('');
  }

  function removeQueryParam(key: string) {
    setEditQueryParams(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  return (
    <div className="ml-8 mt-1 mb-2 p-3 bg-surface/50 border border-border rounded-md space-y-3" onClick={e => e.stopPropagation()}>
      {/* Path Parameters */}
      {Object.keys(editPathParams).length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">Path Parameters</div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-center">
            {Object.entries(editPathParams).map(([k, v]) => (
              <React.Fragment key={k}>
                <label className="text-xs font-mono text-accent whitespace-nowrap">{k}</label>
                <ParamCombobox
                  paramName={k}
                  value={v}
                  onChange={val => setEditPathParams(prev => ({ ...prev, [k]: val }))}
                  allParamValues={editPathParams}
                  placeholder={`value for {${k}}`}
                  className="bg-panel border border-border rounded px-2 py-1 text-xs font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-accent w-full"
                />
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Query Parameters */}
      <div>
        <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-2">
          Query Parameters
          <span className="text-text-muted font-normal normal-case tracking-normal">({Object.keys(editQueryParams).length})</span>
        </div>
        {Object.keys(editQueryParams).length > 0 && (
          <div className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-1.5 items-center mb-2">
            {Object.entries(editQueryParams).map(([k, v]) => (
              <React.Fragment key={k}>
                <label className="text-xs font-mono text-accent whitespace-nowrap">{k}</label>
                <input
                  type="text"
                  value={v}
                  onChange={e => setEditQueryParams(prev => ({ ...prev, [k]: e.target.value }))}
                  className="bg-panel border border-border rounded px-2 py-1 text-xs font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button onClick={() => removeQueryParam(k)}
                  className="text-text-muted hover:text-danger text-xs p-0.5">✕</button>
              </React.Fragment>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={newQueryKey}
            onChange={e => setNewQueryKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addQueryParam()}
            placeholder="Add query param..."
            className="bg-panel border border-border rounded px-2 py-1 text-xs font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-accent w-40"
          />
          <button onClick={addQueryParam} disabled={!newQueryKey.trim()}
            className="text-xs text-accent hover:text-accent-emphasis disabled:opacity-30">+ Add</button>
        </div>
      </div>

      {/* Request Body */}
      <div>
        <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">Request Body</div>
        <textarea
          value={editBody}
          onChange={e => { setEditBody(e.target.value); setBodyError(null); }}
          rows={Math.min(10, Math.max(3, editBody.split('\n').length + 1))}
          spellCheck={false}
          className={`w-full bg-panel border rounded px-3 py-2 text-[11px] font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-accent resize-y ${
            bodyError ? 'border-danger' : 'border-border'
          }`}
          placeholder="{ }"
        />
        {bodyError && <div className="text-xs text-danger mt-0.5">{bodyError}</div>}
      </div>

      {/* Save button */}
      {hasChanges && (
        <div className="flex items-center gap-2 pt-1">
          <button onClick={save} disabled={saving}
            className="px-3 py-1 bg-accent-emphasis text-white text-xs rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <span className="text-[10px] text-text-muted">Changes not yet saved</span>
        </div>
      )}

      {/* Response (after run) */}
      {result && (
        <div className="border-t border-border pt-3">
          <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">Response</div>
          {result.error && (
            <div className="text-xs text-danger mb-1">Error: {result.error}</div>
          )}
          <pre className="text-[11px] font-mono text-text-secondary whitespace-pre-wrap break-all max-h-64 overflow-auto">
            {JSON.stringify(result.responseBody, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function describeEndpoint(path: string): { title: string; errorHint: string } {
  const descriptions: Record<string, { title: string; errorHint: string }> = {
    '/orgs/{org}/copilot/billing': { title: 'Copilot Billing Summary', errorHint: 'Copilot may not be enabled for this org' },
    '/orgs/{org}/copilot/billing/seats': { title: 'Copilot Seat Assignments', errorHint: 'Requires manage_billing:copilot or read:org scope' },
    '/orgs/{org}/copilot/metrics': { title: 'Copilot Usage Metrics', errorHint: 'Metrics API may not be available for your plan' },
    '/orgs/{org}/copilot/coding-agent/permissions': { title: 'Copilot Coding Agent Permissions', errorHint: 'Coding agent feature may not be enabled' },
    '/orgs/{org}/copilot/coding-agent/permissions/repositories': { title: 'Coding Agent Repository Permissions', errorHint: 'Coding agent may need to be enabled first' },
    '/orgs/{org}/copilot/content_exclusion': { title: 'Copilot Content Exclusion Rules', errorHint: 'Requires Copilot Business or Enterprise' },
    '/orgs/{org}': { title: 'Organization Details', errorHint: 'Org not found or insufficient permissions' },
    '/orgs/{org}/members': { title: 'Organization Members', errorHint: 'Requires org:read scope' },
    '/orgs/{org}/teams': { title: 'Organization Teams', errorHint: 'Requires read:org scope' },
    '/orgs/{org}/repos': { title: 'Organization Repositories', errorHint: 'Requires repo scope for private repos' },
    '/orgs/{org}/outside_collaborators': { title: 'Outside Collaborators', errorHint: 'Requires org admin access' },
    '/orgs/{org}/hooks': { title: 'Organization Webhooks', errorHint: 'Requires admin:org_hook scope' },
    '/orgs/{org}/installations': { title: 'GitHub App Installations', errorHint: 'Requires admin:read scope' },
    '/orgs/{org}/actions/runners': { title: 'Self-Hosted Runners', errorHint: 'Requires admin:org scope' },
    '/orgs/{org}/actions/secrets': { title: 'Organization Action Secrets', errorHint: 'Requires admin:org scope' },
    '/orgs/{org}/actions/variables': { title: 'Organization Action Variables', errorHint: 'Requires admin:org scope' },
    '/orgs/{org}/actions/permissions': { title: 'Actions Permissions', errorHint: 'Requires admin:org scope' },
    '/orgs/{org}/code-scanning/alerts': { title: 'Code Scanning Alerts', errorHint: 'Code scanning may not be enabled' },
    '/orgs/{org}/secret-scanning/alerts': { title: 'Secret Scanning Alerts', errorHint: 'Secret scanning may not be enabled' },
    '/orgs/{org}/dependabot/alerts': { title: 'Dependabot Alerts', errorHint: 'Dependabot may not be enabled' },
    '/user': { title: 'Authenticated User Profile', errorHint: 'Token may be invalid' },
    '/user/orgs': { title: 'Your Organizations', errorHint: 'Token needs read:org scope' },
    '/enterprises/{enterprise}/teams': { title: 'Enterprise Teams', errorHint: 'Requires enterprise admin access' },
    '/repos/{owner}/{repo}': { title: 'Repository Details', errorHint: 'Repo not found or insufficient access' },
    '/repos/{owner}/{repo}/branches': { title: 'Repository Branches', errorHint: 'Requires repo read access' },
    '/repos/{owner}/{repo}/pulls': { title: 'Pull Requests', errorHint: 'Requires repo read access' },
    '/repos/{owner}/{repo}/issues': { title: 'Repository Issues', errorHint: 'Requires repo read access' },
  };

  const info = descriptions[path];
  if (info) return info;

  // Generate a title from the path
  const parts = path.split('/').filter(p => p && !p.startsWith('{'));
  const title = parts.slice(-2).join(' / ').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return { title: title || path, errorHint: 'Check permissions and endpoint availability' };
}

function summarizeResponse(path: string, body: unknown): string {
  if (!body || typeof body !== 'object') return String(body || '(empty response)');
  const b = body as Record<string, unknown>;

  // Copilot billing
  if (b.seat_breakdown) {
    const sb = b.seat_breakdown as Record<string, unknown>;
    const parts = [`${sb.total || 0} total seats`];
    if (sb.active_this_cycle) parts.push(`${sb.active_this_cycle} active this cycle`);
    if (sb.inactive_this_cycle) parts.push(`${sb.inactive_this_cycle} inactive`);
    if (b.seat_management_setting) parts.push(`management: ${b.seat_management_setting}`);
    return parts.join(' · ');
  }

  // Copilot seats list
  if (b.total_seats !== undefined && b.seats) {
    const seats = b.seats as Array<Record<string, unknown>>;
    const assignees = seats.map(s => {
      const a = s.assignee as Record<string, unknown> | null;
      return a?.login || 'unknown';
    }).slice(0, 5);
    return `${b.total_seats} seat(s) assigned to: ${assignees.join(', ')}${seats.length > 5 ? ` +${seats.length - 5} more` : ''}`;
  }

  // Copilot coding agent permissions
  if (b.enabled_repositories !== undefined) {
    const repoSetting = b.enabled_repositories as string;
    if (b.organization) {
      return `Coding agent ${repoSetting === 'all' ? 'enabled for all repos' : repoSetting === 'none' ? 'disabled' : `enabled for ${repoSetting} repos`}`;
    }
    return `Repository access: ${repoSetting}`;
  }

  // Content exclusion
  if (Array.isArray(b)) {
    if (b.length === 0) return 'No items configured';
    // Check if it's an array of users/members
    if (b[0] && typeof b[0] === 'object' && 'login' in (b[0] as Record<string, unknown>)) {
      const logins = b.slice(0, 5).map(item => (item as Record<string, unknown>).login);
      return `${b.length} items: ${logins.join(', ')}${b.length > 5 ? ` +${b.length - 5} more` : ''}`;
    }
    return `${b.length} items returned`;
  }

  // Org details
  if (b.login && b.type === 'Organization') {
    const parts = [b.login as string];
    if (b.plan) parts.push(`plan: ${(b.plan as Record<string, unknown>).name}`);
    if (b.total_private_repos !== undefined) parts.push(`${b.total_private_repos} private repos`);
    if (b.members_can_create_repositories !== undefined) parts.push(`member repo creation: ${b.members_can_create_repositories ? 'yes' : 'no'}`);
    return parts.join(' · ');
  }

  // User profile
  if (b.login && b.type === 'User') {
    return `Logged in as ${b.login}${b.name ? ` (${b.name})` : ''}${b.email ? ` · ${b.email}` : ''}`;
  }

  // Generic count-based responses
  if (b.total_count !== undefined) return `${b.total_count} total items`;

  // Generic object — list key fields with values
  const interesting = Object.entries(b)
    .filter(([k, v]) => v !== null && v !== undefined && typeof v !== 'object' && !k.startsWith('_') && k !== 'url' && !k.endsWith('_url'))
    .slice(0, 4)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);
  
  if (interesting.length > 0) return interesting.join(' · ');

  return `${Object.keys(b).length} fields returned`;
}
