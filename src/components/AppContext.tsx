'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
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
  // Optional: pre-filled values for replay from history
  initialPathValues?: Record<string, string>;
  initialQueryValues?: Record<string, string>;
  initialBody?: string;
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

  // Detect theme on mount (client-side only to avoid hydration mismatch)
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') {
      setTheme(saved);
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      setTheme('light');
    }
  }, []);

  // Apply theme on mount and listen for system changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      // Only auto-switch if user hasn't manually set a preference
      if (!localStorage.getItem('theme')) {
        const next = e.matches ? 'dark' : 'light';
        setTheme(next);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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
      localStorage.setItem('theme', next);
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
