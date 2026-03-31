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
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'method-get-bg',
  POST: 'method-post-bg',
  PUT: 'method-put-bg',
  PATCH: 'method-patch-bg',
  DELETE: 'method-delete-bg',
};

export function Sidebar() {
  const { selectedEndpoint, selectEndpoint, sidebarCollapsed, toggleSidebar } = useApp();
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [categoryEndpoints, setCategoryEndpoints] = useState<Record<string, EndpointRow[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<EndpointRow[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadCategories();
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

  async function loadCategories() {
    const res = await fetch('/api/endpoints?action=categories');
    const data = await res.json();
    setCategories(data.categories);
    setTotalCount(data.total);
  }

  async function toggleCategory(cat: string) {
    const next = new Set(expandedCategories);
    if (next.has(cat)) {
      next.delete(cat);
    } else {
      next.add(cat);
      if (!categoryEndpoints[cat]) {
        const res = await fetch(`/api/endpoints?action=by-category&category=${encodeURIComponent(cat)}`);
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
      const res = await fetch(`/api/endpoints?action=search&q=${encodeURIComponent(query)}&limit=50`);
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
      pathParams: JSON.parse(ep.path_params || '[]'),
      queryParams: JSON.parse(ep.query_params || '[]'),
      bodySchema: ep.body_schema ? JSON.parse(ep.body_schema) : null,
    });
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
      <div className="p-3 border-b border-border flex items-center justify-between">
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
                onClick={() => handleSelectEndpoint(ep)}
              />
            ))}
          </div>
        ) : (
          /* Category tree */
          <div className="py-1">
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
                        onClick={() => handleSelectEndpoint(ep)}
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
  endpoint, isActive, onClick,
}: {
  endpoint: EndpointRow; isActive: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1 text-left hover:bg-surface/50 transition-colors
        ${isActive ? 'bg-surface border-l-2 border-accent' : 'border-l-2 border-transparent'}
        ${endpoint.is_deprecated ? 'opacity-50' : ''}`}
      title={`${endpoint.method} ${endpoint.path}${endpoint.summary ? '\n\n' + endpoint.summary : ''}`}
    >
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${METHOD_COLORS[endpoint.method] || 'bg-text-muted'} shrink-0 leading-none`}>
        {endpoint.method}
      </span>
      <span className="text-xs font-mono text-text-secondary truncate">
        {endpoint.path}
      </span>
    </button>
  );
}
