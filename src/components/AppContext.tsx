'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { HttpMethod } from '@/lib/types';

interface EndpointSelection {
  operationId: string;
  category: string;
  method: HttpMethod;
  path: string;
  summary: string;
  description: string;
  specVersion: string;
  pathParams: Array<{ name: string; description: string; required: boolean; type: string; default?: string; enum?: string[] }>;
  queryParams: Array<{ name: string; description: string; required: boolean; type: string; default?: string; enum?: string[] }>;
  bodySchema: unknown | null;
}

interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  timing: number;
  rateLimit: { limit: number; remaining: number; reset: number; used: number; resource: string } | null;
  nextPageUrl: string | null;
}

interface ActiveEnv {
  id: string;
  name: string;
  base_url: string;
  enterprise_slug: string;
  org_name: string;
  auth_method: string;
  is_active: number;
}

interface AppContextType {
  // Environment
  activeEnv: ActiveEnv | null;
  setActiveEnv: (env: ActiveEnv | null) => void;
  // Endpoint selection
  selectedEndpoint: EndpointSelection | null;
  selectEndpoint: (ep: EndpointSelection) => void;
  // Response
  response: ResponseData | null;
  setResponse: (r: ResponseData | null) => void;
  isLoading: boolean;
  setIsLoading: (l: boolean) => void;
  // Panels
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  responseCollapsed: boolean;
  toggleResponse: () => void;
  // Theme
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeEnv, setActiveEnv] = useState<ActiveEnv | null>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointSelection | null>(null);
  const [response, setResponse] = useState<ResponseData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [responseCollapsed, setResponseCollapsed] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const selectEndpoint = useCallback((ep: EndpointSelection) => {
    setSelectedEndpoint(ep);
    setResponse(null);
  }, []);

  const toggleSidebar = useCallback(() => setSidebarCollapsed(p => !p), []);
  const toggleResponse = useCallback(() => setResponseCollapsed(p => !p), []);
  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      return next;
    });
  }, []);

  return (
    <AppContext.Provider value={{
      activeEnv, setActiveEnv,
      selectedEndpoint, selectEndpoint,
      response, setResponse,
      isLoading, setIsLoading,
      sidebarCollapsed, toggleSidebar,
      responseCollapsed, toggleResponse,
      theme, toggleTheme,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
