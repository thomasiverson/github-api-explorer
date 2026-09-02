'use client';

import React, { useState, useRef, useEffect } from 'react';
import { TopBar } from '@/components/TopBar';
import { useApp } from '@/components/AppContext';

// --- Types ---

interface CsvRow {
  name: string;
  display_name: string;
  billing_email: string;
  admin_logins: string;
}

interface RowValidation {
  name?: string;
  display_name?: string;
  billing_email?: string;
  admin_logins?: string;
}

type OrgStatus = 'pending' | 'running' | 'created' | 'failed';

interface OrgResult {
  name: string;
  displayName: string;
  status: OrgStatus;
  orgId?: string;
  orgUrl?: string;
  error?: string;
  timestamp?: string;
}

// --- CSV Parser ---

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const nameIdx = header.indexOf('name');
  const displayIdx = header.indexOf('display_name');
  const emailIdx = header.indexOf('billing_email');
  const adminIdx = header.indexOf('admin_logins');

  if (nameIdx === -1 || emailIdx === -1 || adminIdx === -1) return [];

  return lines.slice(1).filter(l => l.trim()).map(line => {
    const cols = line.split(',').map(c => c.trim());
    const name = cols[nameIdx] || '';
    return {
      name,
      display_name: displayIdx !== -1 ? (cols[displayIdx] || '') : name,
      billing_email: cols[emailIdx] || '',
      admin_logins: cols[adminIdx] || '',
    };
  });
}

// --- Validation ---

const NAME_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

function validateRow(row: CsvRow): RowValidation {
  const errors: RowValidation = {};

  if (!row.name) {
    errors.name = 'Required';
  } else if (row.name.length > 39) {
    errors.name = 'Max 39 characters';
  } else if (row.name.startsWith('-') || row.name.endsWith('-')) {
    errors.name = 'Cannot start or end with hyphen';
  } else if (!NAME_REGEX.test(row.name)) {
    errors.name = 'Only alphanumeric and hyphens allowed';
  }

  if (!row.billing_email) {
    errors.billing_email = 'Required';
  } else if (!row.billing_email.includes('@')) {
    errors.billing_email = 'Must contain @';
  }

  if (!row.admin_logins) {
    errors.admin_logins = 'Required';
  } else {
    const logins = row.admin_logins.split(';').map(s => s.trim()).filter(Boolean);
    if (logins.length === 0) {
      errors.admin_logins = 'At least one admin required';
    }
  }

  return errors;
}

function hasErrors(validation: RowValidation): boolean {
  return Object.keys(validation).length > 0;
}

// --- GraphQL Queries ---

const ENTERPRISE_LOOKUP_QUERY = `query($slug: String!) {
  enterprise(slug: $slug) {
    id
    name
  }
}`;

const CREATE_ORG_MUTATION = `mutation($enterpriseId: ID!, $login: String!, $profileName: String!, $billingEmail: String!, $adminLogins: [String!]!) {
  createEnterpriseOrganization(input: {
    enterpriseId: $enterpriseId
    login: $login
    profileName: $profileName
    billingEmail: $billingEmail
    adminLogins: $adminLogins
  }) {
    organization {
      id
      name
      url
    }
  }
}`;

const DRY_RUN_CHECK_USER_QUERY = `query($login: String!) {
  user(login: $login) {
    login
  }
}`;

const DRY_RUN_CHECK_ORG_QUERY = `query($login: String!) {
  organization(login: $login) {
    login
  }
}`;

const ENTERPRISE_INFO_QUERY = `query($slug: String!) {
  enterprise(slug: $slug) {
    billingEmail
    ownerInfo {
      admins(first: 50) {
        nodes {
          login
          name
          email
        }
      }
    }
    members(first: 1) {
      totalCount
    }
  }
}`;

const ENTERPRISE_MEMBERS_QUERY = `query($slug: String!, $cursor: String) {
  enterprise(slug: $slug) {
    members(first: 100, after: $cursor) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on EnterpriseUserAccount {
          login
          name
          user {
            email
            login
          }
        }
      }
    }
  }
}`;

interface EnterpriseMember {
  login: string;
  name: string;
  email: string;
  isAdmin: boolean;
}

// --- Component ---

export default function BatchCreateOrgsPage() {
  const { activeEnv } = useApp();

  // Input state
  const [enterpriseSlug, setEnterpriseSlug] = useState(activeEnv?.enterprise_slug || 'tpitest');
  const [csvText, setCsvText] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parsed / validated state
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [validations, setValidations] = useState<RowValidation[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // Enterprise members for autocomplete
  const [members, setMembers] = useState<EnterpriseMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [totalMemberCount, setTotalMemberCount] = useState<number | null>(null);
  const [allMembersLoaded, setAllMembersLoaded] = useState(false);
  const [adminDropdownRow, setAdminDropdownRow] = useState<number | null>(null);
  const [emailDropdownRow, setEmailDropdownRow] = useState<number | null>(null);

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<OrgResult[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [enterpriseName, setEnterpriseName] = useState<string | null>(null);
  const [enterpriseBillingEmail, setEnterpriseBillingEmail] = useState<string | null>(null);

  // Update enterprise slug when env changes
  React.useEffect(() => {
    if (activeEnv?.enterprise_slug) {
      setEnterpriseSlug(activeEnv.enterprise_slug);
    }
  }, [activeEnv?.enterprise_slug]);

  // Close dropdowns on outside click — use mousedown which fires before React onClick
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const inEmail = Array.from(document.querySelectorAll('[data-email-dropdown]')).some(el => el.contains(target));
      const inAdmin = Array.from(document.querySelectorAll('[data-admin-dropdown]')).some(el => el.contains(target));
      if (!inEmail) setEmailDropdownRow(null);
      if (!inAdmin) setAdminDropdownRow(null);
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  async function fetchEnterpriseInfo() {
    if (!activeEnv || !enterpriseSlug.trim()) return;
    setMembersLoading(true);
    setMembersError(null);
    setAllMembersLoaded(false);
    try {
      const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: ENTERPRISE_INFO_QUERY,
          variables: { slug: enterpriseSlug.trim() },
          environmentId: activeEnv.id,
        }),
      });
      const data = await res.json();
      const body = data.body || data;
      if (body.errors?.length) {
        setMembersError(body.errors[0].message);
        setMembersLoading(false);
        return;
      }
      const billingEmail = body.data?.enterprise?.billingEmail || '';
      setEnterpriseBillingEmail(billingEmail || null);
      setTotalMemberCount(body.data?.enterprise?.members?.totalCount ?? null);

      const adminNodes = body.data?.enterprise?.ownerInfo?.admins?.nodes || [];
      const admins: EnterpriseMember[] = adminNodes
        .filter((a: Record<string, unknown>) => a && a.login)
        .map((a: { login: string; name?: string; email?: string }) => ({
          login: a.login,
          name: a.name || '',
          email: a.email || '',
          isAdmin: true,
        }));

      setMembers(admins);

      // Auto-populate empty billing_email and admin_logins in existing rows
      // Filter out the enterprise setup user (e.g., tpitest_admin) — it cannot own orgs
      const setupUserPattern = `${enterpriseSlug.trim()}_admin`.toLowerCase();
      const assignableAdmins = admins.filter(m => m.login.toLowerCase() !== setupUserPattern);
      if (rows.length > 0 && (billingEmail || assignableAdmins.length > 0)) {
        const adminLoginsStr = assignableAdmins.map(m => m.login).join(';');
        const defaultEmail = billingEmail || assignableAdmins[0]?.email || admins[0]?.email || '';
        const updated = rows.map(r => ({
          ...r,
          billing_email: r.billing_email || defaultEmail,
          admin_logins: r.admin_logins || adminLoginsStr,
        }));
        setRows(updated);
        setValidations(updated.map(validateRow));
        setCsvText(rowsToCsv(updated));
      }
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : 'Failed to fetch enterprise info');
    }
    setMembersLoading(false);
  }

  async function loadAllMembers() {
    if (!activeEnv || !enterpriseSlug.trim()) return;
    setMembersLoading(true);
    setMembersError(null);
    try {
      const adminLogins = new Set(members.filter(m => m.isAdmin).map(m => m.login));
      const allMembers: EnterpriseMember[] = [...members];
      let cursor: string | null = null;
      let hasNext = true;

      while (hasNext) {
        const res = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: ENTERPRISE_MEMBERS_QUERY,
            variables: { slug: enterpriseSlug.trim(), cursor },
            environmentId: activeEnv.id,
          }),
        });
        const data = await res.json();
        const body = data.body || data;
        if (body.errors?.length) {
          setMembersError(body.errors[0].message);
          break;
        }
        const membersData = body.data?.enterprise?.members;
        const nodes = membersData?.nodes || [];
        for (const n of nodes) {
          if (!n || !n.login) continue;
          const login = n.user?.login || n.login;
          if (!allMembers.find(m => m.login === login)) {
            allMembers.push({
              login,
              name: n.name || '',
              email: n.user?.email || '',
              isAdmin: adminLogins.has(login),
            });
          }
        }
        hasNext = membersData?.pageInfo?.hasNextPage || false;
        cursor = membersData?.pageInfo?.endCursor || null;
      }

      // Sort: admins first, then alphabetical
      allMembers.sort((a, b) => {
        if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
        return a.login.localeCompare(b.login);
      });

      setMembers(allMembers);
      setAllMembersLoaded(true);
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : 'Failed to load members');
    }
    setMembersLoading(false);
  }

  // Parse and validate whenever CSV text changes
  function handleCsvChange(text: string) {
    setCsvText(text);
    setParseError(null);
    setResults([]);
    setGlobalError(null);

    if (!text.trim()) {
      setRows([]);
      setValidations([]);
      return;
    }

    const parsed = parseCsv(text);
    if (parsed.length === 0) {
      setParseError('Could not parse CSV. Expected header: name,billing_email,admin_logins (display_name is optional)');
      setRows([]);
      setValidations([]);
      return;
    }

    setRows(parsed);
    setValidations(parsed.map(validateRow));
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setCsvText(text);
      handleCsvChange(text);
    };
    reader.readAsText(file);
    // Reset so the same file can be re-uploaded
    e.target.value = '';
  }

  const allValid = rows.length > 0 && validations.every(v => !hasErrors(v));
  const canRun = allValid && !isRunning && !!activeEnv && !!enterpriseSlug.trim();

  // Regenerate CSV text from rows and sync all state
  function rowsToCsv(updatedRows: CsvRow[]): string {
    const header = 'name,display_name,billing_email,admin_logins';
    const lines = updatedRows.map(r =>
      [r.name, r.display_name, r.billing_email, r.admin_logins].join(',')
    );
    return [header, ...lines].join('\n');
  }

  function updateRow(rowIndex: number, field: keyof CsvRow, value: string) {
    const updated = rows.map((r, i) => i === rowIndex ? { ...r, [field]: value } : r);
    setRows(updated);
    setValidations(updated.map(validateRow));
    setCsvText(rowsToCsv(updated));
    setResults([]);
    setGlobalError(null);
  }

  async function callGraphQL(query: string, variables: Record<string, unknown>) {
    const res = await fetch('/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables,
        environmentId: activeEnv!.id,
      }),
    });
    return res.json();
  }

  async function handleRun() {
    if (!canRun) return;
    setIsRunning(true);
    setGlobalError(null);
    setEnterpriseName(null);

    // Initialize results as pending
    const initialResults: OrgResult[] = rows.map(r => ({
      name: r.name,
      displayName: r.display_name || r.name,
      status: 'pending' as OrgStatus,
    }));
    setResults(initialResults);

    // Step 1: Look up enterprise ID
    const lookupData = await callGraphQL(ENTERPRISE_LOOKUP_QUERY, { slug: enterpriseSlug.trim() });
    const body = lookupData.body || lookupData;

    if (body.errors?.length || !body.data?.enterprise?.id) {
      const errMsg = body.errors?.[0]?.message || 'Enterprise not found for slug: ' + enterpriseSlug;
      setGlobalError(errMsg);
      setIsRunning(false);
      return;
    }

    const enterpriseId = body.data.enterprise.id;
    setEnterpriseName(body.data.enterprise.name);

    if (dryRun) {
      // Pre-flight checks: verify admin logins exist and org names aren't taken
      // Collect all unique admin logins to check
      const allAdminLogins = new Set<string>();
      for (const row of rows) {
        row.admin_logins.split(';').map(s => s.trim()).filter(Boolean).forEach(l => allAdminLogins.add(l));
      }

      // Check each admin login exists
      const validUsers = new Set<string>();
      const invalidUsers = new Set<string>();
      for (const login of allAdminLogins) {
        try {
          const res = await callGraphQL(DRY_RUN_CHECK_USER_QUERY, { login });
          const b = res.body || res;
          if (b.data?.user?.login) {
            validUsers.add(login);
          } else {
            invalidUsers.add(login);
          }
        } catch {
          invalidUsers.add(login);
        }
      }

      // Check each org name availability
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'running' } : r));

        const issues: string[] = [];

        // Check if org name is already taken
        try {
          const orgRes = await callGraphQL(DRY_RUN_CHECK_ORG_QUERY, { login: row.name });
          const ob = orgRes.body || orgRes;
          if (ob.data?.organization?.login) {
            issues.push(`Org name "${row.name}" is already taken`);
          }
        } catch { /* org doesn't exist = good */ }

        // Check admin logins
        const rowAdmins = row.admin_logins.split(';').map(s => s.trim()).filter(Boolean);
        const badAdmins = rowAdmins.filter(l => invalidUsers.has(l));
        if (badAdmins.length > 0) {
          issues.push(`User(s) not found: ${badAdmins.join(', ')}`);
        }

        if (issues.length > 0) {
          setResults(prev => prev.map((r, idx) =>
            idx === i ? { ...r, status: 'failed', error: `[Dry Run] ${issues.join('; ')}`, timestamp: new Date().toISOString() } : r
          ));
        } else {
          setResults(prev => prev.map((r, idx) =>
            idx === i ? { ...r, status: 'created', error: 'Dry run passed — ready to create', timestamp: new Date().toISOString() } : r
          ));
        }
      }

      setIsRunning(false);
      return;
    }

    // Step 2: Loop through rows, executing mutations
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Mark current row as running
      setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'running' } : r));

      const adminLogins = row.admin_logins.split(';').map(s => s.trim()).filter(Boolean);

      try {
        const mutationData = await callGraphQL(CREATE_ORG_MUTATION, {
          enterpriseId,
          login: row.name,
          profileName: row.display_name || row.name,
          billingEmail: row.billing_email,
          adminLogins: adminLogins,
        });

        const mutBody = mutationData.body || mutationData;
        const org = mutBody.data?.createEnterpriseOrganization?.organization;

        if (org) {
          setResults(prev => prev.map((r, idx) =>
            idx === i ? {
              ...r,
              status: 'created',
              orgId: org.id,
              orgUrl: org.url,
              timestamp: new Date().toISOString(),
            } : r
          ));
        } else {
          const errMsg = mutBody.errors?.[0]?.message || 'Unknown error';
          setResults(prev => prev.map((r, idx) =>
            idx === i ? { ...r, status: 'failed', error: errMsg, timestamp: new Date().toISOString() } : r
          ));
        }
      } catch (err) {
        setResults(prev => prev.map((r, idx) =>
          idx === i ? {
            ...r,
            status: 'failed',
            error: err instanceof Error ? err.message : 'Network error',
            timestamp: new Date().toISOString(),
          } : r
        ));
      }

      // 500ms delay between requests
      if (i < rows.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setIsRunning(false);
  }

  function exportResultsCsv() {
    const header = 'name,status,org_id,org_url,error,timestamp';
    const lines = results.map(r =>
      [r.name, r.status, r.orgId || '', r.orgUrl || '', r.error || '', r.timestamp || '']
        .map(v => `"${v.replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-org-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const createdCount = results.filter(r => r.status === 'created').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  const pendingCount = results.filter(r => r.status === 'pending' || r.status === 'running').length;

  return (
    <div className="h-full flex flex-col">
      <TopBar />

      {/* Sub-navigation */}
      <div className="border-b border-border bg-panel px-6 flex items-center gap-1">
        <a href="/graphql"
          className="px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface rounded-t-md transition-colors">
          Query Editor
        </a>
        <span className="px-3 py-2 text-sm text-text-primary bg-surface border border-border border-b-0 rounded-t-md font-medium -mb-px">
          Batch Create Orgs
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto py-6 px-6 space-y-6">

          {/* Header */}
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Batch Create Organizations</h1>
            <p className="text-sm text-text-secondary mt-1">
              Upload a CSV of organization definitions to create them in bulk via the GraphQL <code className="text-xs bg-surface px-1 py-0.5 rounded">createEnterpriseOrganization</code> mutation.
            </p>
          </div>

          {/* Configuration */}
          <section className="bg-panel border border-border rounded-lg p-4 space-y-4">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Configuration</h2>
            <details open className="bg-surface/50 border border-border rounded-md text-xs text-text-secondary">
              <summary className="px-3 py-2 font-semibold text-text-primary cursor-pointer select-none hover:bg-surface rounded-md">
                How batch organization creation works
              </summary>
              <ol className="px-3 pb-3 grid gap-3 md:grid-cols-3">
                <li>
                  <span className="font-semibold text-text-primary">1. Load enterprise context</span>
                  <p className="mt-0.5">
                    Fetch enterprise info to load the billing email, eligible administrator defaults, and member pickers. This is read-only and does not create anything.
                  </p>
                </li>
                <li>
                  <span className="font-semibold text-text-primary">2. Add organizations</span>
                  <p className="mt-0.5">
                    Paste or upload CSV rows, then review and edit the parsed values in the preview table.
                  </p>
                </li>
                <li>
                  <span className="font-semibold text-text-primary">3. Validate and create</span>
                  <p className="mt-0.5">
                    Use Dry Run to check organization names and administrators, then create valid organizations one at a time.
                  </p>
                </li>
              </ol>
            </details>
            <div>
              <label className="text-sm text-text-secondary block mb-1">Enterprise Slug</label>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={enterpriseSlug}
                  onChange={e => { setEnterpriseSlug(e.target.value); setGlobalError(null); }}
                  placeholder="e.g. tpitest"
                  className="w-48 bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  onClick={fetchEnterpriseInfo}
                  disabled={membersLoading || !activeEnv || !enterpriseSlug.trim()}
                  className="px-3 py-1.5 text-sm text-text-secondary border border-border rounded-md hover:bg-surface disabled:opacity-50 transition-colors flex items-center gap-2 shrink-0"
                >
                  {membersLoading && !allMembersLoaded ? (
                    <>
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading...
                    </>
                  ) : 'Fetch Enterprise Info'}
                </button>
                {members.length > 0 && !allMembersLoaded && totalMemberCount !== null && (
                  <button
                    onClick={loadAllMembers}
                    disabled={membersLoading}
                    className="px-3 py-1.5 text-sm text-text-secondary border border-border rounded-md hover:bg-surface disabled:opacity-50 transition-colors flex items-center gap-2 shrink-0"
                  >
                    {membersLoading ? (
                      <>
                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Loading members...
                      </>
                    ) : (
                      <>Load All Members ({totalMemberCount})</>
                    )}
                  </button>
                )}
                {membersError && (
                  <span className="text-xs text-danger shrink-0">{membersError}</span>
                )}
                {enterpriseName && (
                  <span className="text-xs text-success font-medium shrink-0">✓ {enterpriseName}</span>
                )}
                {members.length > 0 && (
                  <span className="text-xs text-success font-medium shrink-0">
                    {members.filter(m => m.isAdmin).length} admins{allMembersLoaded && `, ${members.length} members`}
                  </span>
                )}
                {enterpriseBillingEmail && (
                  <span className="text-xs text-text-secondary shrink-0">
                    · Billing: <code className="bg-surface px-1 py-0.5 rounded font-mono">{enterpriseBillingEmail}</code>
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-xs text-text-muted">
                Recommended when CSV fields are incomplete. You can skip this step when every row already includes a billing email and administrator login.
              </p>
            </div>

            {/* Permissions note */}
            <details className="bg-surface/50 border border-border rounded-md text-xs text-text-muted">
              <summary className="px-3 py-2 font-semibold text-text-secondary cursor-pointer select-none hover:bg-surface/80 rounded-md">Required permissions</summary>
              <div className="px-3 pb-2 space-y-1">
                <ul className="list-disc list-inside space-y-0.5">
                  <li><code className="bg-surface px-1 rounded">admin:enterprise</code> — needed to fetch the enterprise billing email and create organizations</li>
                  <li><code className="bg-surface px-1 rounded">admin:org</code> — needed for the <code className="bg-surface px-1 rounded">createEnterpriseOrganization</code> mutation</li>
                  <li><code className="bg-surface px-1 rounded">read:enterprise</code> — needed to list enterprise members and admins</li>
                </ul>
                <p>If billing email shows as unavailable, your token may lack the <code className="bg-surface px-1 rounded">admin:enterprise</code> scope. The first admin&apos;s email will be used as a fallback.</p>
              </div>
            </details>
          </section>

          {/* CSV Input */}
          <section className="bg-panel border border-border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">CSV Input</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-sm text-text-secondary border border-border rounded-md hover:bg-surface transition-colors"
                >
                  Upload .csv
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <button
                  onClick={() => {
                    const email = enterpriseBillingEmail || members.find(m => m.isAdmin)?.email || 'billing@example.com';
                    const admins = members.filter(m => m.isAdmin && m.login.toLowerCase() !== `${(enterpriseSlug || 'enterprise').toLowerCase()}_admin`).map(m => m.login).join(';') || 'admin1;admin2';
                    const slug = enterpriseSlug || 'enterprise';
                    const displaySlug = slug.charAt(0).toUpperCase() + slug.slice(1);
                    const sample = `name,display_name,billing_email,admin_logins\n${slug}-my-new-org,${displaySlug} My New Org,${email},${admins}\n${slug}-another-org,${displaySlug} Another Org,${email},${admins}\n${slug}-simple-org,${displaySlug} Simple Org,${email},${admins}`;
                    setCsvText(sample);
                    handleCsvChange(sample);
                  }}
                  className="px-3 py-1.5 text-sm text-text-secondary border border-border rounded-md hover:bg-surface transition-colors"
                >
                  Load Sample
                </button>
                {csvText && (
                  <button
                    onClick={() => { setCsvText(''); handleCsvChange(''); }}
                    className="px-2 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={csvText}
              onChange={e => handleCsvChange(e.target.value)}
              placeholder={`Paste CSV here or upload a file. Expected format:\n\nname,billing_email,admin_logins\nmy-new-org,billing@example.com,admin1;admin2\n\nOptional column: display_name (defaults to name if omitted)`}
              className="w-full bg-canvas border border-border rounded-md px-4 py-3 text-sm text-text-primary font-mono resize-none focus:outline-none focus:ring-1 focus:ring-accent h-32"
              spellCheck={false}
            />
            {parseError && (
              <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-md">{parseError}</div>
            )}
          </section>

          {/* Preview Table */}
          {rows.length > 0 && (
            <section className="bg-panel border border-border rounded-lg">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
                  Preview
                  <span className="ml-2 text-text-muted font-normal normal-case">({rows.length} organization{rows.length !== 1 ? 's' : ''})</span>
                </h2>
                {allValid ? (
                  <span className="text-xs text-success font-medium">✓ All rows valid</span>
                ) : (
                  <span className="text-xs text-danger font-medium">✗ Fix validation errors below</span>
                )}
              </div>
              <div style={{ overflow: 'visible' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface/50 border-b border-border">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-text-muted uppercase w-10">#</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-text-muted uppercase w-[18%]">Name</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-text-muted uppercase w-[18%]">Display Name</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-text-muted uppercase w-[22%]">Billing Email</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-text-muted uppercase">Admin Logins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const v = validations[i];
                      const rowHasErrors = v && hasErrors(v);
                      return (
                        <tr key={i} className={`border-b border-border ${rowHasErrors ? 'bg-danger/5' : ''}`}>
                          <td className="px-4 py-2 text-text-muted text-xs">{i + 1}</td>
                          <td className="px-4 py-1">
                            <input
                              type="text"
                              value={row.name}
                              onChange={e => updateRow(i, 'name', e.target.value)}
                              className="w-full bg-transparent border border-transparent hover:border-border focus:border-accent rounded px-1.5 py-1 text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                            />
                            {v?.name && <div className="text-xs text-danger mt-0.5 px-1.5">{v.name}</div>}
                          </td>
                          <td className="px-4 py-1">
                            <input
                              type="text"
                              value={row.display_name}
                              onChange={e => updateRow(i, 'display_name', e.target.value)}
                              placeholder={row.name || 'defaults to name'}
                              className="w-full bg-transparent border border-transparent hover:border-border focus:border-accent rounded px-1.5 py-1 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                            />
                            {v?.display_name && <div className="text-xs text-danger mt-0.5 px-1.5">{v.display_name}</div>}
                          </td>
                          <td className="px-4 py-1">
                            <div className="relative" data-email-dropdown>
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={row.billing_email}
                                  onChange={e => updateRow(i, 'billing_email', e.target.value)}
                                  className="flex-1 bg-transparent border border-transparent hover:border-border focus:border-accent rounded px-1.5 py-1 text-xs font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                                />
                                {members.length > 0 && (
                                  <button
                                    onClick={e => { e.stopPropagation(); setEmailDropdownRow(emailDropdownRow === i ? null : i); setAdminDropdownRow(null); }}
                                    className="shrink-0 p-1 rounded hover:bg-surface text-text-muted hover:text-text-primary transition-colors"
                                    title="Select from member emails"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                      <path d="M1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25v-8.5C0 2.784.784 2 1.75 2ZM1.5 12.251c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V5.809L8.38 9.397a.75.75 0 0 1-.76 0L1.5 5.809v6.442Zm13-8.181v-.32a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25v.32L8 7.88Z" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                              {emailDropdownRow === i && members.length > 0 && (
                                <div onClick={e => e.stopPropagation()} className="absolute right-0 top-full mt-1 z-20 bg-panel border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto w-96">
                                  <div className="px-3 py-1.5 text-[10px] text-text-muted uppercase font-semibold border-b border-border">Click to use email</div>
                                  {[...new Map(members.filter(m => m.email).map(m => [m.email, m])).values()].map(m => (
                                    <button
                                      key={m.email}
                                      onClick={() => {
                                        updateRow(i, 'billing_email', m.email);
                                        setEmailDropdownRow(null);
                                      }}
                                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-surface transition-colors ${
                                        row.billing_email === m.email ? 'bg-accent/10' : ''
                                      }`}
                                    >
                                      <span className="font-mono text-text-primary truncate">{m.email}</span>
                                      <span className="text-text-muted truncate">({m.login})</span>
                                    </button>
                                  ))}
                                  {members.filter(m => m.email).length === 0 && (
                                    <div className="px-3 py-2 text-xs text-text-muted">No public emails found for members</div>
                                  )}
                                </div>
                              )}
                            </div>
                            {v?.billing_email && <div className="text-xs text-danger mt-0.5 px-1.5">{v.billing_email}</div>}
                          </td>
                          <td className="px-4 py-1">
                            <div className="relative" data-admin-dropdown>
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={row.admin_logins}
                                  onChange={e => updateRow(i, 'admin_logins', e.target.value)}
                                  placeholder="user1;user2"
                                  className="flex-1 bg-transparent border border-transparent hover:border-border focus:border-accent rounded px-1.5 py-1 text-xs font-mono text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                                />
                                {members.length > 0 && (
                                  <button
                                    onClick={e => { e.stopPropagation(); setAdminDropdownRow(adminDropdownRow === i ? null : i); setEmailDropdownRow(null); }}
                                    className="shrink-0 p-1 rounded hover:bg-surface text-text-muted hover:text-text-primary transition-colors"
                                    title="Select from enterprise members"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                      <path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                              {adminDropdownRow === i && members.length > 0 && (
                                <div onClick={e => e.stopPropagation()} className="absolute right-0 top-full mt-1 z-20 bg-panel border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto w-96">
                                  <div className="px-3 py-1.5 text-[10px] text-text-muted uppercase font-semibold border-b border-border">Click to add/remove</div>
                                  {members.map(m => {
                                    const currentLogins = row.admin_logins.split(';').map(s => s.trim()).filter(Boolean);
                                    const isSelected = currentLogins.includes(m.login);
                                    return (
                                      <button
                                        key={m.login}
                                        onClick={() => {
                                          let next: string[];
                                          if (isSelected) {
                                            next = currentLogins.filter(l => l !== m.login);
                                          } else {
                                            next = [...currentLogins, m.login];
                                          }
                                          updateRow(i, 'admin_logins', next.join(';'));
                                        }}
                                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-surface transition-colors ${
                                          isSelected ? 'bg-accent/10' : ''
                                        }`}
                                      >
                                        <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                                          isSelected ? 'bg-white border-success' : 'border-border'
                                        }`}>
                                          {isSelected && (
                                            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-success">
                                              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                                            </svg>
                                          )}
                                        </span>
                                        <span className="font-mono font-medium text-text-primary">{m.login}</span>
                                        {m.isAdmin && <span className="text-[10px] px-1 py-0.5 rounded bg-warning/20 text-warning font-semibold">Admin</span>}
                                        {m.name && <span className="text-text-muted truncate">({m.name})</span>}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            {v?.admin_logins && <div className="text-xs text-danger mt-0.5 px-1.5">{v.admin_logins}</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Run Button */}
          {rows.length > 0 && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={e => setDryRun(e.target.checked)}
                  className="rounded border-border"
                />
                Dry Run
                <span className="text-xs text-text-muted">(validate only, no mutations)</span>
              </label>
              <div className="flex items-center gap-4">
                <button
                  onClick={handleRun}
                  disabled={!canRun}
                  className="px-6 py-2 bg-accent-emphasis text-white text-sm font-medium rounded-md
                             hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2"
                >
                  {isRunning ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Creating...
                    </>
                  ) : dryRun ? (
                    'Validate (Dry Run)'
                  ) : (
                    `Create ${rows.length} Organization${rows.length !== 1 ? 's' : ''}`
                  )}
                </button>
                {!allValid && <span className="text-xs text-danger">Fix validation errors before running</span>}
                {!activeEnv && <span className="text-xs text-danger">No active environment — configure one in Settings</span>}
              </div>
            </div>
          )}

          {/* Global Error */}
          {globalError && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 text-sm text-danger">
              <strong>Error:</strong> {globalError}
            </div>
          )}

          {/* Results Table */}
          {results.length > 0 && (
            <section className="bg-panel border border-border rounded-lg overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
                  Results
                </h2>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-text-muted">
                    {createdCount > 0 && <span className="text-success font-medium">{createdCount} created</span>}
                    {createdCount > 0 && (failedCount > 0 || pendingCount > 0) && ' · '}
                    {failedCount > 0 && <span className="text-danger font-medium">{failedCount} failed</span>}
                    {failedCount > 0 && pendingCount > 0 && ' · '}
                    {pendingCount > 0 && <span className="text-text-muted font-medium">{pendingCount} pending</span>}
                  </span>
                  {!isRunning && results.length > 0 && (
                    <button
                      onClick={exportResultsCsv}
                      className="px-3 py-1.5 text-xs text-text-secondary border border-border rounded-md hover:bg-surface transition-colors"
                    >
                      Export CSV
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface/50 border-b border-border">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-text-muted uppercase">Org Name</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-text-muted uppercase">Display Name</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-text-muted uppercase">Status</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-text-muted uppercase">Org URL / Error</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-text-muted uppercase">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="px-4 py-2 font-mono">{r.name}</td>
                        <td className="px-4 py-2">{r.displayName}</td>
                        <td className="px-4 py-2">
                          {r.status === 'created' && <span className="text-success font-medium">✔ Created</span>}
                          {r.status === 'failed' && <span className="text-danger font-medium">❌ Failed</span>}
                          {r.status === 'pending' && <span className="text-text-muted">⏳ Pending</span>}
                          {r.status === 'running' && (
                            <span className="text-warning font-medium flex items-center gap-1">
                              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Running
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs font-mono">
                          {r.orgUrl ? (
                            <a href={r.orgUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{r.orgUrl}</a>
                          ) : r.error ? (
                            <span className={r.status === 'created' ? 'text-success font-medium' : 'text-danger'}>{r.error}</span>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-text-muted">
                          {r.timestamp || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
