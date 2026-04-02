'use client';

import React, { useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { templates } from '@/lib/templates';

const METHOD_COLORS: Record<string, string> = {
  GET: 'method-get-bg', POST: 'method-post-bg', PUT: 'method-put-bg',
  PATCH: 'method-patch-bg', DELETE: 'method-delete-bg',
};

export default function TemplatesPage() {
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function importTemplate(templateId: string) {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    setImporting(templateId);
    try {
      // Create collection
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name: template.name, description: template.description }),
      });
      const { id: collectionId } = await res.json();

      // Add items
      for (let i = 0; i < template.items.length; i++) {
        const item = template.items[i];
        await fetch('/api/collections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add-item',
            collectionId,
            method: item.method,
            path: item.path,
            pathParams: item.pathParams || {},
            queryParams: item.queryParams || {},
            headers: {},
            body: null,
            sortOrder: i,
          }),
        });
      }

      setImported(prev => new Set(prev).add(templateId));
    } catch (err) {
      alert(`Failed to import: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setImporting(null);
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto py-8 px-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-text-primary">Request Templates</h1>
            <p className="text-sm text-text-secondary mt-1">
              Pre-built collections for common workflows. Import with one click — endpoints auto-fill from your environment config.
            </p>
          </div>

          {/* How it works */}
          <div className="bg-surface/50 border border-border rounded-lg p-4 flex gap-6">
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <span className="w-5 h-5 rounded-full bg-accent-emphasis text-white flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
              <span><strong>Import</strong> a template below</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <span className="w-5 h-5 rounded-full bg-accent-emphasis text-white flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
              <span>Go to <a href="/collections" className="text-accent hover:underline">Collections</a></span>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <span className="w-5 h-5 rounded-full bg-accent-emphasis text-white flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
              <span><strong>Run All</strong> to execute every request</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <span className="w-5 h-5 rounded-full bg-accent-emphasis text-white flex items-center justify-center text-[10px] font-bold shrink-0">4</span>
              <span><strong>Review</strong> the summary &amp; expand results</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map(t => {
              const isExpanded = expandedId === t.id;
              const isImported = imported.has(t.id);
              return (
                <div key={t.id} className="bg-panel border border-border rounded-lg overflow-hidden hover:border-accent/30 transition-colors">
                  {/* Card header */}
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{t.icon}</span>
                      <div className="flex-1">
                        <h3 className="font-medium text-text-primary text-sm">{t.name}</h3>
                        <p className="text-xs text-text-secondary mt-0.5">{t.description}</p>
                        <p className="text-[10px] text-text-muted mt-1">{t.items.length} requests</p>
                      </div>
                      <button
                        onClick={() => importTemplate(t.id)}
                        disabled={importing !== null || isImported}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all shrink-0 ${
                          isImported
                            ? 'bg-success/20 text-success'
                            : 'bg-accent-emphasis text-white hover:opacity-90 disabled:opacity-50'
                        }`}
                      >
                        {importing === t.id ? 'Importing...' : isImported ? '✓ Imported' : 'Import'}
                      </button>
                    </div>
                  </div>

                  {/* Expand/collapse endpoints */}
                  <div className="border-t border-border">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : t.id)}
                      className="w-full px-4 py-2 text-[11px] text-text-muted hover:text-text-primary flex items-center gap-1 hover:bg-surface/50 transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"
                        className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                        <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
                      </svg>
                      {isExpanded ? 'Hide' : 'Show'} endpoints
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-3 space-y-1">
                        {t.items.map((item, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${METHOD_COLORS[item.method]} leading-none`}>
                              {item.method}
                            </span>
                            <span className="font-mono text-text-secondary truncate">{item.path}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
