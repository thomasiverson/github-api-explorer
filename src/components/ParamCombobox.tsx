'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface DiscoverOption {
  value: string;
  label: string;
}

// Map param names to discovery types and their dependencies
const PARAM_DISCOVERY: Record<string, {
  type: string;
  dependsOn?: string[];  // other param names that must be filled first
  paramMapping?: Record<string, string>;  // maps dependency param names to query params
}> = {
  org: { type: 'orgs' },
  organization: { type: 'orgs' },
  owner: { type: 'orgs' },
  enterprise: { type: 'enterprises' },
  'enterprise-team': { type: 'enterprise-teams', dependsOn: ['enterprise'], paramMapping: { enterprise: 'enterprise' } },
  repo: { type: 'repos', dependsOn: ['owner', 'org', 'organization'], paramMapping: { owner: 'owner', org: 'org', organization: 'org' } },
  team_slug: { type: 'teams', dependsOn: ['org', 'organization'], paramMapping: { org: 'org', organization: 'org' } },
  username: { type: 'members', dependsOn: ['org', 'organization'], paramMapping: { org: 'org', organization: 'org' } },
  branch: { type: 'branches', dependsOn: ['owner', 'org', 'repo'], paramMapping: { owner: 'owner', org: 'owner', repo: 'repo' } },
};

export function getDiscoveryConfig(paramName: string) {
  return PARAM_DISCOVERY[paramName] || null;
}

export function isDiscoverableParam(paramName: string): boolean {
  return paramName in PARAM_DISCOVERY;
}

interface ParamComboboxProps {
  paramName: string;
  value: string;
  onChange: (value: string) => void;
  allParamValues: Record<string, string>;  // current values of all params (for dependencies)
  placeholder?: string;
  className?: string;
}

export function ParamCombobox({ paramName, value, onChange, allParamValues, placeholder, className }: ParamComboboxProps) {
  const config = PARAM_DISCOVERY[paramName];
  const [options, setOptions] = useState<DiscoverOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve dependency values
  const depsReady = config?.dependsOn
    ? config.dependsOn.some(dep => allParamValues[dep]?.trim())
    : true;

  const fetchOptions = useCallback(async () => {
    if (!config || !depsReady) return;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ type: config.type });
      if (config.dependsOn && config.paramMapping) {
        for (const dep of config.dependsOn) {
          const val = allParamValues[dep]?.trim();
          if (val && config.paramMapping[dep]) {
            params.set(config.paramMapping[dep], val);
          }
        }
      }
      const res = await fetch(`/api/discover?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setOptions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [config, depsReady, allParamValues]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Fetch when dropdown opens
  useEffect(() => {
    if (open && options.length === 0 && !loading && !error) {
      fetchOptions();
    }
    if (open && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, [open, options.length, loading, error, fetchOptions]);

  // Re-fetch when dependencies change
  const depValues = config?.dependsOn?.map(d => allParamValues[d] || '').join(',') || '';
  useEffect(() => {
    if (depValues) {
      setOptions([]);
      setError(null);
    }
  }, [depValues]);

  if (!config) {
    // Not a discoverable param — render plain input
    return (
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
    );
  }

  const filtered = filter
    ? options.filter(o =>
        o.value.toLowerCase().includes(filter.toLowerCase()) ||
        o.label.toLowerCase().includes(filter.toLowerCase())
      )
    : options;

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); setFilter(e.target.value); }}
          onFocus={() => { if (depsReady) setOpen(true); }}
          placeholder={placeholder || (depsReady ? `type or select ${paramName}...` : `fill ${config.dependsOn?.join(' or ')} first`)}
          className={className}
        />
        {depsReady && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (open) {
                setOpen(false);
              } else {
                setOpen(true);
                if (options.length === 0 && !loading) fetchOptions();
              }
              inputRef.current?.focus();
            }}
            className="absolute right-1 p-0.5 text-text-muted hover:text-text-primary transition-colors"
            title="Browse options"
          >
            {loading ? (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="animate-spin">
                <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm0 14.5a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z" opacity=".3"/>
                <path d="M8 0a8 8 0 0 1 8 8h-1.5A6.5 6.5 0 0 0 8 1.5V0Z"/>
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
                className={`transition-transform ${open ? 'rotate-180' : ''}`}>
                <path d="M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z" />
              </svg>
            )}
          </button>
        )}
      </div>

      {open && (
        <div
          className="fixed z-[200] bg-panel border border-border rounded-md shadow-lg max-h-48 overflow-auto"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
        >
          {loading && options.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-muted">Loading...</div>
          )}
          {error && (
            <div className="px-3 py-2 text-xs text-danger">{error}</div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-muted">
              {options.length === 0 ? 'No options found' : 'No matches'}
            </div>
          )}
          {filtered.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setFilter('');
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface transition-colors flex items-center gap-2 ${
                opt.value === value ? 'bg-surface text-accent font-medium' : 'text-text-primary'
              }`}
            >
              <span className="font-mono">{opt.value}</span>
              {opt.label !== opt.value && (
                <span className="text-text-muted truncate">— {opt.label.replace(`${opt.value} — `, '')}</span>
              )}
            </button>
          ))}
          {!loading && options.length > 0 && (
            <button
              type="button"
              onClick={() => fetchOptions()}
              className="w-full text-left px-3 py-1.5 text-[10px] text-text-muted hover:text-accent border-t border-border"
            >
              ↻ Refresh
            </button>
          )}
        </div>
      )}
    </div>
  );
}
