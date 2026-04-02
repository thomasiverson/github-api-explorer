'use client';

import React, { useState, useEffect } from 'react';
import { TopBar } from '@/components/TopBar';
import { useApp } from '@/components/AppContext';

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
  const [editingName, setEditingName] = useState('');
  const [editingDesc, setEditingDesc] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [runResults, setRunResults] = useState<RunResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => { loadCollections(); }, []);

  useEffect(() => {
    if (selectedId) loadItems(selectedId);
  }, [selectedId]);

  async function loadCollections() {
    const res = await fetch('/api/collections');
    const data = await res.json();
    setCollections(data);
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
    loadCollections();
    setSelectedId(data.id);
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

  async function runAll() {
    if (!selectedId || items.length === 0) return;
    setIsRunning(true);
    setRunResults([]);
    const results: RunResult[] = [];

    for (const item of items) {
      try {
        // Auto-fill path params from active environment
        const storedParams = JSON.parse(item.path_params || '{}');
        const pathParams: Record<string, string> = { ...storedParams };
        if (activeEnv) {
          // Extract {param} placeholders from path and fill known ones
          const placeholders = item.path.match(/\{(\w+)\}/g) || [];
          for (const ph of placeholders) {
            const name = ph.slice(1, -1);
            if (pathParams[name]) continue; // already has a value
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
        results.push({ itemId: item.id, status: data.status || 0, timing: data.timing || 0, error: data.error });
      } catch (err: unknown) {
        results.push({ itemId: item.id, status: 0, timing: 0, error: err instanceof Error ? err.message : 'Unknown' });
      }
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
                  <button onClick={() => deleteColl(selected.id)}
                    className="px-3 py-1.5 text-danger text-sm border border-border rounded-md hover:bg-surface transition-colors">
                    Delete
                  </button>
                </div>
              </div>

              {/* Run results summary */}
              {runResults.length > 0 && (
                <div className="mb-4 p-3 bg-surface border border-border rounded-lg">
                  <div className="flex gap-4 text-sm">
                    <span className="text-success">{runResults.filter(r => r.status >= 200 && r.status < 300).length} passed</span>
                    <span className="text-danger">{runResults.filter(r => r.status === 0 || r.status >= 400).length} failed</span>
                    <span className="text-text-muted">{Math.round(runResults.reduce((a, r) => a + r.timing, 0))}ms total</span>
                  </div>
                </div>
              )}

              {/* Items */}
              <div className="space-y-1">
                {items.map((item, i) => {
                  const result = runResults.find(r => r.itemId === item.id);
                  return (
                    <div key={item.id}
                      className="flex items-center gap-2 p-2 bg-panel border border-border rounded-md hover:bg-surface/50 transition-colors">
                      <div className="flex flex-col gap-0.5">
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
                      <button onClick={() => deleteItem(item.id)}
                        className="text-text-muted hover:text-danger p-1 text-xs">✕</button>
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
    </div>
  );
}
