'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useApp } from './AppContext';

export function TopBar() {
  const { activeEnv, setActiveEnv, theme, toggleTheme } = useApp();
  const pathname = usePathname();

  const navLinkClass = (href: string) => {
    const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
    return isActive
      ? 'px-3 py-1 text-sm text-text-primary bg-surface rounded-md font-medium'
      : 'px-3 py-1 text-sm text-text-secondary hover:text-text-primary hover:bg-surface rounded-md transition-colors';
  };
  const [environments, setEnvironments] = useState<Array<{
    id: string; name: string; base_url: string; enterprise_slug: string;
    org_name: string; auth_method: string; is_active: number;
  }>>([]);
  const [authStatus, setAuthStatus] = useState<'unknown' | 'valid' | 'invalid' | 'checking'>('unknown');
  const [rateLimit, setRateLimit] = useState<{ remaining: number; limit: number } | null>(null);

  useEffect(() => {
    loadEnvironments();
  }, []);

  async function loadEnvironments() {
    const res = await fetch('/api/environments');
    const envs = await res.json();
    setEnvironments(envs);
    const active = envs.find((e: { is_active: number }) => e.is_active === 1);
    if (active) {
      setActiveEnv(active);
      checkAuth(active.id);
    }
  }

  async function checkAuth(envId: string) {
    setAuthStatus('checking');
    try {
      const res = await fetch('/api/environments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validate', id: envId }),
      });
      const result = await res.json();
      setAuthStatus(result.valid ? 'valid' : 'invalid');
    } catch {
      setAuthStatus('invalid');
    }
  }

  async function switchEnvironment(envId: string) {
    await fetch('/api/environments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'activate', id: envId }),
    });
    const env = environments.find(e => e.id === envId);
    if (env) {
      setActiveEnv({ ...env, is_active: 1 });
      checkAuth(envId);
    }
  }

  // Update rate limit from response context
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.rateLimit) {
        setRateLimit({
          remaining: e.detail.rateLimit.remaining,
          limit: e.detail.rateLimit.limit,
        });
      }
    };
    window.addEventListener('rate-limit-update' as string, handler as EventListener);
    return () => window.removeEventListener('rate-limit-update' as string, handler as EventListener);
  }, []);

  const rateLimitPct = rateLimit ? (rateLimit.remaining / rateLimit.limit) * 100 : 100;
  const rateLimitColor = rateLimitPct > 50 ? 'bg-success' : rateLimitPct > 20 ? 'bg-warning' : 'bg-danger';

  return (
    <header className="flex flex-col shrink-0 border-b border-border bg-panel">
      {/* Row 1: Branding, connection info, theme toggle */}
      <div className="h-12 flex items-center px-4 gap-4">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2 mr-2 hover:opacity-80 transition-opacity">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" className="text-text-primary">
            <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
          </svg>
          <span className="font-semibold text-sm text-text-primary">GitHub API Explorer</span>
        </a>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Environment selector */}
        <select
          className="bg-surface border border-border rounded-md px-3 py-1 text-sm text-text-primary
                     focus:outline-none focus:ring-1 focus:ring-accent min-w-[180px]"
          value={activeEnv?.id || ''}
          onChange={e => switchEnvironment(e.target.value)}
        >
          {environments.length === 0 && <option value="">No environments</option>}
          {environments.map(env => (
            <option key={env.id} value={env.id}>
              {env.name} ({env.enterprise_slug || env.base_url})
            </option>
          ))}
        </select>

        {/* Auth status */}
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${
            authStatus === 'valid' ? 'bg-success' :
            authStatus === 'invalid' ? 'bg-danger' :
            authStatus === 'checking' ? 'bg-warning animate-pulse' :
            'bg-text-muted'
          }`} />
          <span className="text-xs text-text-secondary">
            {authStatus === 'valid' ? 'Connected' :
             authStatus === 'invalid' ? 'Auth failed' :
             authStatus === 'checking' ? 'Checking...' :
             'Not configured'}
          </span>
        </div>

        {/* Rate limit bar */}
        {rateLimit && (
          <div className="flex items-center gap-2 ml-2">
            <div className="w-24 h-1.5 rounded-full bg-surface overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${rateLimitColor}`}
                style={{ width: `${rateLimitPct}%` }}
              />
            </div>
            <span className="text-xs text-text-muted">{rateLimit.remaining}/{rateLimit.limit}</span>
          </div>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-md hover:bg-surface text-text-secondary hover:text-text-primary transition-colors"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm5.657-8.157a.75.75 0 0 1 0 1.061l-1.061 1.06a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l1.06-1.06a.75.75 0 0 1 1.06 0Zm-9.193 9.193a.75.75 0 0 1 0 1.06l-1.06 1.061a.75.75 0 1 1-1.061-1.06l1.06-1.061a.75.75 0 0 1 1.061 0ZM8 0a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V.75A.75.75 0 0 1 8 0ZM3 8a.75.75 0 0 1-.75.75H.75a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 3 8Zm13 0a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 16 8Zm-8 5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 13Zm3.536-1.464a.75.75 0 0 1 1.06 0l1.061 1.06a.75.75 0 0 1-1.06 1.061l-1.061-1.06a.75.75 0 0 1 0-1.061ZM2.343 2.343a.75.75 0 0 1 1.061 0l1.06 1.061a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018l-1.06-1.06a.75.75 0 0 1 0-1.06Z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M9.598 1.591a.749.749 0 0 1 .785-.175 7.001 7.001 0 1 1-8.967 8.967.75.75 0 0 1 .961-.96 5.5 5.5 0 0 0 7.046-7.046.75.75 0 0 1 .175-.786Zm1.616 1.945a7 7 0 0 1-7.678 7.678 5.499 5.499 0 1 0 7.678-7.678Z" />
            </svg>
          )}
        </button>
      </div>

      {/* Row 2: Navigation */}
      <nav className="h-10 flex items-center justify-center px-4 gap-1 border-t border-border">
        <a href="/" className={navLinkClass('/')}>API Explorer</a>
        <a href="/history" className={navLinkClass('/history')}>History</a>
        <a href="/collections" className={navLinkClass('/collections')}>Collections</a>
        <a href="/compare" className={navLinkClass('/compare')}>Compare</a>
        <a href="/templates" className={navLinkClass('/templates')}>Templates</a>
        <a href="/webhooks" className={navLinkClass('/webhooks')}>Webhooks</a>
        <a href="/graphql" className={navLinkClass('/graphql')}>GraphQL</a>
        <a href="/settings" className={navLinkClass('/settings')}>Settings</a>
      </nav>
    </header>
  );
}
