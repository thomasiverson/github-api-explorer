'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useApp } from './AppContext';
import type { HttpMethod } from '@/lib/types';

interface CategoryInfo {
  category: string;
  count: number;
}

interface EndpointRow {
  id: string;
  category: string;
  subcategory: string;
  operation_id: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  path_params: string;
  query_params: string;
  body_schema: string | null;
  response_schema: string | null;
  is_deprecated: number;
  spec_version: string;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'method-get-bg',
  POST: 'method-post-bg',
  PUT: 'method-put-bg',
  PATCH: 'method-patch-bg',
  DELETE: 'method-delete-bg',
};

export function Sidebar() {
  const { selectedEndpoint, selectEndpoint, sidebarCollapsed, toggleSidebar, activeEnv } = useApp();
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [categoryEndpoints, setCategoryEndpoints] = useState<Record<string, EndpointRow[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<EndpointRow[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkResults, setBulkResults] = useState<Record<string, { status: number; timing: number }>>({});
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favoriteEndpoints, setFavoriteEndpoints] = useState<EndpointRow[]>([]);
  const [specVersions, setSpecVersions] = useState<Array<{ spec_version: string; count: number }>>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadCategories();
    loadFavorites();
    // Keyboard shortcut: Cmd/Ctrl+K
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  async function loadCategories(version?: string) {
    const vParam = version || selectedVersion;
    const vQuery = vParam ? `&version=${encodeURIComponent(vParam)}` : '';
    const res = await fetch(`/api/endpoints?action=categories${vQuery}`);
    const data = await res.json();
    setCategories(data.categories);
    setTotalCount(data.total);
    if (data.versions) setSpecVersions(data.versions);
    // Reset expanded categories when version changes
    setExpandedCategories(new Set());
    setCategoryEndpoints({});
  }

  async function loadFavorites() {
    const res = await fetch('/api/favorites');
    const ids: string[] = await res.json();
    setFavorites(new Set(ids));
    // Load the full endpoint data for favorites
    if (ids.length > 0) {
      const res2 = await fetch(`/api/endpoints?action=search&q=${encodeURIComponent(ids[0])}&limit=100`);
      const allEndpoints: EndpointRow[] = await res2.json();
      // Search for all favorite endpoints
      const favEndpoints: EndpointRow[] = [];
      for (const id of ids) {
        const found = allEndpoints.find(e => e.operation_id === id);
        if (found) favEndpoints.push(found);
      }
      // If we didn't find them all via first search, search individually
      if (favEndpoints.length < ids.length) {
        for (const id of ids) {
          if (favEndpoints.find(e => e.operation_id === id)) continue;
          const res3 = await fetch(`/api/endpoints?action=search&q=${encodeURIComponent(id)}&limit=5`);
          const results: EndpointRow[] = await res3.json();
          const found = results.find(e => e.operation_id === id);
          if (found) favEndpoints.push(found);
        }
      }
      setFavoriteEndpoints(favEndpoints);
    }
  }

  async function toggleFavorite(operationId: string) {
    const isFav = favorites.has(operationId);
    await fetch('/api/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: isFav ? 'remove' : 'add', operationId }),
    });
    loadFavorites();
  }

  async function toggleCategory(cat: string) {
    const next = new Set(expandedCategories);
    if (next.has(cat)) {
      next.delete(cat);
    } else {
      next.add(cat);
      if (!categoryEndpoints[cat]) {
        const vQuery = selectedVersion ? `&version=${encodeURIComponent(selectedVersion)}` : '';
        const res = await fetch(`/api/endpoints?action=by-category&category=${encodeURIComponent(cat)}${vQuery}`);
        const endpoints = await res.json();
        setCategoryEndpoints(prev => ({ ...prev, [cat]: endpoints }));
      }
    }
    setExpandedCategories(next);
  }

  function handleSearch(query: string) {
    setSearchQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      const vQuery = selectedVersion ? `&version=${encodeURIComponent(selectedVersion)}` : '';
      const res = await fetch(`/api/endpoints?action=search&q=${encodeURIComponent(query)}&limit=50${vQuery}`);
      const results = await res.json();
      setSearchResults(results);
      setIsSearching(false);
    }, 200);
  }

  function handleSelectEndpoint(ep: EndpointRow) {
    selectEndpoint({
      operationId: ep.operation_id,
      category: ep.category,
      method: ep.method as HttpMethod,
      path: ep.path,
      summary: ep.summary,
      description: ep.description,
      specVersion: ep.spec_version || selectedVersion || '',
      pathParams: JSON.parse(ep.path_params || '[]'),
      queryParams: JSON.parse(ep.query_params || '[]'),
      bodySchema: ep.body_schema ? JSON.parse(ep.body_schema) : null,
    });
  }

  function toggleBulkSelect(epId: string, e: React.MouseEvent) {
    if (!e.ctrlKey && !e.metaKey) return false; // not a bulk-select click
    e.preventDefault();
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(epId)) next.delete(epId); else next.add(epId);
      return next;
    });
    return true;
  }

  async function runBulk() {
    if (bulkSelected.size === 0 || !activeEnv) return;
    setIsBulkRunning(true);
    setBulkResults({});

    // Gather all endpoints that are selected
    const allEndpoints: EndpointRow[] = [];
    for (const eps of Object.values(categoryEndpoints)) {
      allEndpoints.push(...eps);
    }
    allEndpoints.push(...searchResults);

    for (const epId of bulkSelected) {
      const ep = allEndpoints.find(e => e.id === epId);
      if (!ep) continue;
      try {
        const pathParams: Record<string, string> = {};
        const parsed = JSON.parse(ep.path_params || '[]');
        for (const p of parsed) {
          if (p.name === 'org' || p.name === 'owner') pathParams[p.name] = activeEnv.org_name || '';
          else if (p.name === 'enterprise') pathParams[p.name] = activeEnv.enterprise_slug || '';
        }
        const res = await fetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: ep.method, path: ep.path, pathParams, queryParams: {},
            operationId: ep.operation_id, category: ep.category,
          }),
        });
        const data = await res.json();
        setBulkResults(prev => ({ ...prev, [epId]: { status: data.status || 0, timing: data.timing || 0 } }));
      } catch {
        setBulkResults(prev => ({ ...prev, [epId]: { status: 0, timing: 0 } }));
      }
    }
    setIsBulkRunning(false);
  }

  const displayEndpoints = searchQuery.trim() ? searchResults : null;

  if (sidebarCollapsed) {
    return (
      <div className="w-full h-full border-r border-border bg-panel flex flex-col items-center py-2">
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md hover:bg-surface text-text-secondary hover:text-text-primary"
          title="Expand sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <aside className="w-full h-full border-r border-border bg-panel flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            API Explorer
            <span className="ml-1.5 text-text-muted font-normal">({totalCount})</span>
          </span>
          <button
            onClick={toggleSidebar}
            className="p-1 rounded hover:bg-surface text-text-muted hover:text-text-primary"
          >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.78 12.78a.75.75 0 0 1-1.06 0L4.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L6.06 8l3.72 3.72a.75.75 0 0 1 0 1.06Z" />
          </svg>
        </button>
        </div>
        {/* Bulk run bar */}
        {bulkSelected.size > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <button onClick={runBulk} disabled={isBulkRunning}
              className="px-2.5 py-1 bg-accent-emphasis text-white text-[11px] rounded-md hover:opacity-90 disabled:opacity-50">
              {isBulkRunning ? 'Running...' : `Run ${bulkSelected.size} selected`}
            </button>
            <button onClick={() => { setBulkSelected(new Set()); setBulkResults({}); }}
              className="text-[11px] text-text-muted hover:text-text-primary">Clear</button>
          </div>
        )}
        <p className="text-[10px] text-text-muted mt-1">Ctrl+click to multi-select</p>
        {/* Version filter */}
        {specVersions.length > 1 && (
          <select
            value={selectedVersion}
            onChange={e => { setSelectedVersion(e.target.value); loadCategories(e.target.value); }}
            className="mt-2 w-full bg-surface border border-border rounded-md px-2 py-1 text-[11px] text-text-primary
                       focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">All versions ({totalCount})</option>
            {specVersions.map(v => (
              <option key={v.spec_version} value={v.spec_version}>{v.spec_version} ({v.count})</option>
            ))}
          </select>
        )}
      </div>

      {/* Search */}
      <div className="p-2 border-b border-border">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search endpoints ⌘K"
            className="w-full bg-surface border border-border rounded-md pl-8 pr-3 py-1.5 text-sm text-text-primary
                       placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
          />
          {searchQuery && (
            <button
              onClick={() => handleSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
          )}
        </div>
        {isSearching && <div className="text-xs text-text-muted mt-1 text-center">Searching...</div>}
        {searchQuery && !isSearching && (
          <div className="text-xs text-text-muted mt-1">{searchResults.length} results</div>
        )}
      </div>

      {/* Endpoint list */}
      <div className="flex-1 overflow-y-auto">
        {displayEndpoints ? (
          /* Search results */
          <div className="py-1">
            {displayEndpoints.map(ep => (
              <EndpointItem
                key={ep.id}
                endpoint={ep}
                isActive={selectedEndpoint?.operationId === ep.operation_id}
                isBulkSelected={bulkSelected.has(ep.id)}
                bulkResult={bulkResults[ep.id]}
                onClick={(e) => {
                  if (toggleBulkSelect(ep.id, e)) return;
                  handleSelectEndpoint(ep);
                }}
              />
            ))}
          </div>
        ) : (
          /* Favorites + Category tree */
          <div className="py-1">
            {/* Favorites section */}
            {favoriteEndpoints.length > 0 && (
              <div className="mb-1">
                <div className="px-3 py-1.5 text-xs font-semibold text-warning uppercase tracking-wider flex items-center gap-1">
                  ★ Favorites
                </div>
                {favoriteEndpoints.map(ep => (
                  <EndpointItem
                    key={`fav-${ep.id}`}
                    endpoint={ep}
                    isActive={selectedEndpoint?.operationId === ep.operation_id}
                    isBulkSelected={bulkSelected.has(ep.id)}
                    bulkResult={bulkResults[ep.id]}
                    isFavorite={true}
                    onToggleFavorite={() => toggleFavorite(ep.operation_id)}
                    onClick={(e) => {
                      if (toggleBulkSelect(ep.id, e)) return;
                      handleSelectEndpoint(ep);
                    }}
                  />
                ))}
                <div className="border-b border-border mx-3 my-1" />
              </div>
            )}
            {categories.map(cat => (
              <div key={cat.category}>
                <button
                  onClick={() => toggleCategory(cat.category)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-sm hover:bg-surface/50 transition-colors"
                >
                  <svg
                    width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
                    className={`text-text-muted transition-transform ${expandedCategories.has(cat.category) ? 'rotate-90' : ''}`}
                  >
                    <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
                  </svg>
                  <span className="font-medium text-text-primary">{cat.category}</span>
                  <span className="text-xs text-text-muted ml-auto">{cat.count}</span>
                </button>
                {expandedCategories.has(cat.category) && categoryEndpoints[cat.category] && (
                  <div>
                    {categoryEndpoints[cat.category].map(ep => (
                      <EndpointItem
                        key={ep.id}
                        endpoint={ep}
                        isActive={selectedEndpoint?.operationId === ep.operation_id}
                        isBulkSelected={bulkSelected.has(ep.id)}
                        bulkResult={bulkResults[ep.id]}
                        isFavorite={favorites.has(ep.operation_id)}
                        onToggleFavorite={() => toggleFavorite(ep.operation_id)}
                        onClick={(e) => {
                          if (toggleBulkSelect(ep.id, e)) return;
                          handleSelectEndpoint(ep);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function EndpointItem({
  endpoint, isActive, isBulkSelected, bulkResult, isFavorite, onToggleFavorite, onClick,
}: {
  endpoint: EndpointRow; isActive: boolean; isBulkSelected: boolean;
  bulkResult?: { status: number; timing: number };
  isFavorite?: boolean; onToggleFavorite?: () => void;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1 text-left hover:bg-surface/50 transition-colors group
        ${isActive ? 'bg-surface border-l-2 border-accent' :
          isBulkSelected ? 'bg-accent/10 border-l-2 border-accent/50' :
          'border-l-2 border-transparent'}
        ${endpoint.is_deprecated ? 'opacity-50' : ''}`}
      title={`${endpoint.method} ${endpoint.path}${endpoint.summary ? '\n\n' + endpoint.summary : ''}`}
    >
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${METHOD_COLORS[endpoint.method] || 'bg-text-muted'} shrink-0 leading-none`}>
        {endpoint.method}
      </span>
      <span className="text-xs font-mono text-text-secondary truncate flex-1">
        {endpoint.path}
      </span>
      {bulkResult && (
        <span className={`text-[10px] font-mono font-bold shrink-0 ${
          bulkResult.status >= 200 && bulkResult.status < 300 ? 'text-success' : 'text-danger'
        }`}>
          {bulkResult.status}
        </span>
      )}
      {onToggleFavorite && (
        <span
          onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
          className={`shrink-0 text-xs cursor-pointer transition-opacity ${
            isFavorite ? 'text-warning opacity-100' : 'text-text-muted opacity-0 group-hover:opacity-50 hover:!opacity-100'
          }`}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          ★
        </span>
      )}
    </button>
  );
}
