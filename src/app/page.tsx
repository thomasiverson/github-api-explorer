'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/TopBar';
import { Sidebar } from '@/components/Sidebar';
import { RequestBuilder } from '@/components/RequestBuilder';
import { ResponseViewer } from '@/components/ResponseViewer';
import { ResizablePanels } from '@/components/ResizablePanels';
import { useApp } from '@/components/AppContext';
import type { HttpMethod } from '@/lib/types';

function ReplayHandler() {
  const { selectEndpoint, setResponse } = useApp();
  const searchParams = useSearchParams();

  useEffect(() => {
    const replayId = searchParams.get('replay');
    if (!replayId) return;

    (async () => {
      const res = await fetch(`/api/history?id=${encodeURIComponent(replayId)}`);
      const entry = await res.json();
      if (!entry) return;

      selectEndpoint({
        operationId: entry.operation_id || '',
        category: entry.category || '',
        method: entry.method as HttpMethod,
        path: entry.path,
        summary: '',
        description: '',
        pathParams: extractPathParams(entry.path),
        queryParams: [],
        bodySchema: null,
      });

      if (entry.response_body) {
        try {
          const headers = entry.response_headers ? JSON.parse(entry.response_headers) : {};
          setResponse({
            status: entry.status,
            statusText: entry.status >= 200 && entry.status < 300 ? 'OK' : 'Error',
            headers,
            body: JSON.parse(entry.response_body),
            timing: entry.timing,
            rateLimit: null,
            nextPageUrl: null,
          });
        } catch { /* ignore parse errors */ }
      }

      window.history.replaceState({}, '', '/');
    })();
  }, [searchParams, selectEndpoint, setResponse]);

  return null;
}

export default function Home() {
  const { activeEnv, sidebarCollapsed, responseCollapsed } = useApp();

  return (
    <div className="h-full flex flex-col">
      <Suspense fallback={null}><ReplayHandler /></Suspense>
      <TopBar />
      <ResizablePanels
        left={<Sidebar />}
        center={<RequestBuilder />}
        right={<ResponseViewer />}
        defaultLeftWidth={288}
        defaultRightWidth={480}
        minLeftWidth={200}
        maxLeftWidth={500}
        minRightWidth={300}
        maxRightWidth={900}
        minCenterWidth={300}
        leftCollapsed={sidebarCollapsed}
        rightCollapsed={responseCollapsed}
      />
      {/* Status bar */}
      <footer className="h-7 flex items-center px-4 border-t border-border bg-panel text-xs text-text-muted shrink-0 gap-4">
        <span>{activeEnv ? `${activeEnv.name} — ${activeEnv.base_url}` : 'No environment selected'}</span>
        <span className="flex-1" />
        <span>GitHub REST API Harness</span>
      </footer>
    </div>
  );
}

function extractPathParams(path: string) {
  const matches = path.match(/\{(\w+)\}/g);
  if (!matches) return [];
  return matches.map(m => ({
    name: m.slice(1, -1),
    description: '',
    required: true,
    type: 'string',
  }));
}
