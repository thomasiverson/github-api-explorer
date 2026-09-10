# Azure DevOps API Explorer — Application Specification

> **Purpose**: This document is a comprehensive feature & architecture blueprint derived from the GitHub API Explorer application. It is intended to serve as an implementation guide for building an equivalent **Azure DevOps API Explorer** using the Azure DevOps REST API in place of the GitHub API. The tech stack, UI patterns, and feature set should be replicated 1:1, substituting GitHub-specific concepts with their Azure DevOps equivalents.

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. Tech Stack](#2-tech-stack)
- [3. Application Architecture](#3-application-architecture)
- [4. Pages & Features](#4-pages--features)
  - [4.1 Main Workspace (Home)](#41-main-workspace-home)
  - [4.2 Settings](#42-settings)
  - [4.3 History](#43-history)
  - [4.4 Collections](#44-collections)
  - [4.5 Templates](#45-templates)
  - [4.6 API Version Comparison](#46-api-version-comparison)
  - [4.7 Webhooks Reference](#47-webhooks-reference)
  - [4.8 GraphQL → OData / Analytics (Optional)](#48-graphql--odata--analytics-optional)
- [5. Components](#5-components)
- [6. API Routes (Backend)](#6-api-routes-backend)
- [7. Database Schema](#7-database-schema)
- [8. Authentication](#8-authentication)
- [9. Security](#9-security)
- [10. OpenAPI / API Catalog Import](#10-openapi--api-catalog-import)
- [11. Theming & Styling](#11-theming--styling)
- [12. Azure DevOps Mapping Guide](#12-azure-devops-mapping-guide)
- [13. Request Templates (Azure DevOps)](#13-request-templates-azure-devops)
- [14. Service Hooks Reference (Azure DevOps)](#14-service-hooks-reference-azure-devops)
- [15. Getting Started](#15-getting-started)

---

## 1. Overview

The application is a **single-page developer tool** for exploring, testing, and comparing REST API endpoints. It provides:

- An **auto-generated endpoint catalog** parsed from the official OpenAPI spec
- A **three-panel workspace**: Sidebar (endpoint browser) → Request Builder → Response Viewer
- **Multi-environment support** with encrypted credentials
- **Request history**, **collections**, and **pre-built templates**
- **API version comparison** between different server versions
- **Webhook/Service Hook reference** documentation
- **Dark/light theme** with GitHub Primer-inspired design tokens

### GitHub → Azure DevOps Concept Mapping

| GitHub Concept | Azure DevOps Equivalent |
|---|---|
| Enterprise | Organization (top-level) |
| Organization | Project |
| Repository | Repository (within a Project) |
| Personal Access Token (PAT) | Personal Access Token (PAT) |
| GitHub App auth | OAuth 2.0 / Service Principal |
| GitHub REST API (`api.github.com`) | Azure DevOps REST API (`dev.azure.com/{org}`) |
| GitHub GraphQL API | OData / Analytics API (optional) |
| OpenAPI spec from `github/rest-api-description` | Azure DevOps REST API OpenAPI/Swagger specs from `MicrosoftDocs/vsts-rest-api-specs` |
| GHES versions (3.10, 3.12, etc.) | Azure DevOps API versions (`7.0`, `7.1`, `7.2-preview`, etc.) |
| Webhooks | Service Hooks |
| Octokit SDK | `azure-devops-node-api` or raw fetch |
| `X-GitHub-Api-Version` header | `api-version` query parameter |
| Rate limit headers (`X-RateLimit-*`) | Azure DevOps rate limit headers (TSThinker, `Retry-After`, `X-RateLimit-*`) |

---

## 2. Tech Stack

All technologies are carried over from the original:

| Technology | Purpose |
|---|---|
| **Next.js 16** (App Router) | Unified frontend + backend (SSR routes + API routes) |
| **TypeScript** | End-to-end type safety |
| **React 19** | UI framework |
| **Tailwind CSS 4** | Utility-first styling with custom design tokens |
| **better-sqlite3** | Local SQLite database, zero external dependencies |
| **uuid** | ID generation for DB records |
| **next-themes** | Theme persistence (dark/light) |

### Dependencies to Replace

| Original | Azure DevOps Replacement |
|---|---|
| `@octokit/rest` | `azure-devops-node-api` **or** raw `fetch` with token auth |
| `@octokit/auth-app` | OAuth 2.0 token acquisition / MSAL (if using OAuth) |
| `@octokit/auth-token` | Simple PAT header (`Basic` base64-encoded) |

---

## 3. Application Architecture

### File Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout: HTML shell, AppProvider, fonts
│   ├── page.tsx                # Main three-panel workspace
│   ├── globals.css             # Design tokens (dark/light), method colors, syntax highlighting
│   ├── api/
│   │   ├── collections/route.ts   # Collections CRUD + items + reorder + duplicate
│   │   ├── compare/route.ts       # API version comparison + diff engine
│   │   ├── discover/route.ts      # Auto-discover orgs, projects, repos, teams, users
│   │   ├── endpoints/route.ts     # Endpoint catalog queries (categories, search, by-category)
│   │   ├── environments/route.ts  # Environment CRUD + auth validation + activate/deactivate
│   │   ├── execute/route.ts       # Request proxy with SSRF protection + history logging
│   │   ├── favorites/route.ts     # Favorite endpoints CRUD
│   │   ├── graphql/route.ts       # GraphQL proxy (→ OData proxy for Azure DevOps)
│   │   ├── history/route.ts       # Request history CRUD + category backfill
│   │   ├── import/route.ts        # OpenAPI spec import (runtime, from URL)
│   │   └── variables/route.ts     # Per-environment custom variables CRUD
│   ├── collections/page.tsx       # Collections management page
│   ├── compare/page.tsx           # API version comparison page
│   ├── graphql/page.tsx           # GraphQL editor (→ OData/Analytics for Azure DevOps)
│   ├── history/page.tsx           # Request history with expandable details
│   ├── settings/page.tsx          # Environment + auth + API catalog management
│   ├── templates/page.tsx         # Pre-built request template collections
│   └── webhooks/page.tsx          # Webhook/Service Hook event reference
├── components/
│   ├── AppContext.tsx              # Global React context (env, endpoint, response, UI state)
│   ├── ConfirmDialog.tsx           # Modal for destructive action confirmation
│   ├── ParamCombobox.tsx           # Auto-complete combobox for path params (discovers orgs/repos/etc.)
│   ├── RequestBuilder.tsx          # URL bar, params editor, body editor, curl export
│   ├── ResizablePanels.tsx         # Drag-to-resize three-panel layout
│   ├── ResponseViewer.tsx          # JSON tree, headers, raw, preview tabs + pagination
│   ├── Sidebar.tsx                 # Category tree, search, favorites, bulk select
│   └── TopBar.tsx                  # Two-row header: branding + nav + env selector + auth status
├── lib/
│   ├── auth.ts                    # SDK client factory (PAT + OAuth)
│   ├── db.ts                      # SQLite schema, CRUD, encryption helpers
│   ├── openapi-import.ts          # OpenAPI spec parser + endpoint extraction
│   ├── templates.ts               # Pre-built request template definitions
│   ├── types.ts                   # TypeScript interfaces for all data types
│   └── webhooks.ts                # Webhook/Service Hook event definitions
scripts/
└── import-openapi.ts              # CLI tool for importing API catalog
data/
└── harness.db                     # Local SQLite database (gitignored)
```

### Data Flow

```
Browser ──fetch──►  Next.js API Route  ──fetch──►  Azure DevOps REST API
                        │                              │
                    SQLite DB                      Response
                    (history,                         │
                     credentials,              ◄──────┘
                     endpoints)
```

All API calls are **proxied through Next.js API routes**. The browser never sees raw credentials. The execute route:
1. Receives the request from the client (method, path template, params, body)
2. Resolves path parameters and builds the full URL
3. Validates the URL against the configured base URL (SSRF protection)
4. Authenticates using the stored credentials
5. Executes the request against the target API
6. Logs the request/response to the history table
7. Returns the response to the browser

---

## 4. Pages & Features

### 4.1 Main Workspace (Home)

**Route**: `/`

A **three-panel layout** with resizable panels:

#### Left Panel — Sidebar (`Sidebar.tsx`)
- **API endpoint category tree**: Collapsible categories loaded from the DB, grouped by API area
- **Endpoint count badge**: Shows total endpoints in the catalog
- **Search** (`Ctrl+K` / `⌘K`): Fuzzy search across operation IDs, paths, summaries, and categories. Debounced 200ms.
- **Favorites section**: Starred endpoints shown at top, collapsible
- **Spec version selector**: Dropdown to switch between imported API versions
- **Bulk select**: `Ctrl+Click` endpoints to select multiple, then run them all at once
- **Per-endpoint display**: HTTP method badge (color-coded) + path + summary
- **Favorite toggle**: Star/unstar any endpoint

#### Center Panel — Request Builder (`RequestBuilder.tsx`)
- **URL bar**: Shows `METHOD baseUrl/resolved/path` with color-coded method badge
- **Path parameters**: Auto-populated from environment config (org → project, enterprise → organization)
  - **ParamCombobox**: Smart auto-complete that calls the Azure DevOps API to discover available values (orgs, projects, repos, teams, users)
  - Dependencies: e.g., `repo` dropdown depends on `owner` being filled first
- **Query parameters**: Checkbox-toggleable, with default values from the OpenAPI spec
- **Request body editor**: Pre-populated JSON from the OpenAPI schema; textarea with monospace font
- **Custom headers**: Add/remove/toggle custom HTTP headers
- **Tabs**: Params | Body | Headers — auto-selects based on endpoint type
- **Send button**: Executes the request; `Ctrl+Enter` / `⌘Enter` shortcut
- **Destructive action confirmation**: Modal dialog before executing DELETE/PUT/PATCH/POST requests
- **Copy as cURL**: Generates a curl command with all headers and body
- **Batch execution**: Select a path param, provide multiple values (comma-separated), runs requests in sequence
- **Environment variable substitution**: Custom variables per environment, auto-fill into params
- **Replay from history**: Clicking "Replay" from history pre-fills all params, query, and body values

#### Right Panel — Response Viewer (`ResponseViewer.tsx`)
- **Status bar**: Color-coded status badge (2xx green, 4xx yellow, 5xx red) + timing + rate limit info
- **Tabs**:
  - **Body**: Collapsible JSON tree viewer with syntax highlighting + search/filter + CSV download for arrays
  - **Headers**: Response headers listed with key: value pairs
  - **Raw**: Pretty-printed JSON text (copyable)
  - **Preview**: URLs as clickable links, image thumbnails, values with type coloring
- **Pagination**: When `Link` header (or Azure DevOps continuation token) indicates more pages, shows "Load More →" button. Results are appended.
- **Copy response**: Button to copy JSON to clipboard
- **CSV download**: For array responses, download as CSV file

#### Status Bar (Footer)
- Shows active environment name + base URL
- Application name

#### Replay Handler
- Supports `?replay={historyId}` URL parameter
- Fetches the history entry, extracts path/query params from resolved URL, pre-fills the request builder
- Shows the stored response immediately

---

### 4.2 Settings

**Route**: `/settings`

#### Environments Section
- **List all environments** with active indicator (green dot)
- **Create/Edit environment** form:
  - **Name**: Display name (e.g., "My Azure DevOps Org")
  - **API Base URL**: `https://dev.azure.com/{organization}` or on-prem TFS URL
  - **Organization**: Top-level Azure DevOps organization name
  - **Project**: Default project name (Azure DevOps equivalent of GitHub's org)
  - **Auth Method**: PAT or OAuth 2.0
  - **Credentials**: Token input (masked)
- **Test connection**: Validates auth by calling a simple API endpoint
- **Activate/Deactivate**: Switch active environment
- **Delete environment**: With confirmation

#### Environment Variables Section
- Per-environment key-value pairs
- Variables are substituted into path/query parameters automatically
- Built-in variables from environment config: `{organization}`, `{project}`, `{repo}`
- CRUD operations for custom variables

#### API Catalog Section
- **Import/Re-import** the endpoint catalog from the OpenAPI spec
- **Import specific API versions** (e.g., 7.0, 7.1, 7.2-preview)
- Shows imported versions with endpoint counts
- Status messages for import progress/errors

---

### 4.3 History

**Route**: `/history`

- **Table of all past requests**: Method badge, path, resolved URL, status (color-coded), timing, timestamp
- **Filter/search** by path, URL, method, or category
- **Expandable rows**: Click to see full request body, response body, response headers
- **Actions per entry**:
  - **Replay**: Navigate to home page with all params pre-filled (uses `?replay={id}`)
  - **Add to collection**: Dropdown to add to an existing collection (preserves all params & body)
  - **Delete**: Remove single entry
- **Bulk actions**:
  - **Select multiple** via checkboxes
  - **Compare two**: Side-by-side diff of response bodies, headers, status, timing
  - **Add to collection** (bulk): Add all selected to a collection
- **Clear all**: Purge entire history
- **Response diff viewer**: Side-by-side comparison with diff highlighting for two selected history entries

---

### 4.4 Collections

**Route**: `/collections`

- **List of collections**: Name, description, item count, created/updated timestamps
- **Create / Delete / Duplicate** collections
- **Edit collection metadata**: Inline name + description editing
- **Collection items** (when a collection is selected):
  - List of requests with method badge, path, and resolved URL
  - **Expandable details**: Show path params, query params, headers, request body for each item
  - **Reorder items**: Move up/down buttons
  - **Delete individual items**
  - **Run single item**: Execute one request and show result inline
  - **Run All**: Execute all items in sequence:
    - Shows progress indicator
    - Results summary: pass/fail counts
    - Per-item results: status code, timing, error message
    - Expandable response body per item
    - CSV export of run results
  - **Parameter editing**: Inline editing of path params, query params, and body per item
  - **ParamCombobox**: Smart auto-complete for path param values (same as Request Builder)
- **Destructive action confirmation**: Modal before executing DELETE/PUT/PATCH/POST requests
- **Add to collection from history**: History page allows adding entries to collections

---

### 4.5 Templates

**Route**: `/templates`

Pre-built collections for common Azure DevOps workflows. One-click import creates a collection.

#### Template Structure
```typescript
interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;        // emoji
  items: TemplateItem[];
}

interface TemplateItem {
  method: string;       // GET, POST, etc.
  path: string;         // e.g., /{organization}/{project}/_apis/wit/workitems
  summary: string;
  pathParams?: Record<string, string>;   // placeholders like {{project}}
  queryParams?: Record<string, string>;  // e.g., { api-version: '7.1' }
}
```

#### Template Features
- **Template cards**: Icon, name, description, item count
- **Expand/collapse endpoint list**: Shows all requests in the template
- **Import button**: Creates a collection with all items pre-configured
- **Import status**: Shows "✓ Imported → Collections" link after import
- **How it works**: Step-by-step guide (Import → Collections → Run All → Review)

#### GitHub Templates → Azure DevOps Template Ideas

| GitHub Template | Azure DevOps Equivalent |
|---|---|
| Copilot Audit | Not applicable |
| Org Health Check | **Project Health Check** — project details, teams, repos, policies |
| Security Posture | **Security & Compliance** — policies, branch policies, audit log |
| Actions Overview | **Pipelines Overview** — pipelines, runs, agents, variable groups |
| EMU Discovery | **Org Discovery** — projects, teams, users, groups |
| Repository Deep Dive | **Repository Deep Dive** — branches, PRs, commits, policies |
| Enterprise Administration | **Org Administration** — processes, billing, extensions, audit |
| Team Management | **Team Management** — teams, members, iterations, areas |
| Compliance & Audit | **Audit & Compliance** — audit log, permissions, policies |
| Billing & Licensing | **Billing & Licensing** — user entitlements, extensions, usage |
| Custom Properties | **Process Customization** — work item types, fields, rules |
| GitHub Apps Inventory | **Extensions & Service Connections** — installed extensions, service endpoints |

---

### 4.6 API Version Comparison

**Route**: `/compare`

- **Import multiple API spec versions**: e.g., Azure DevOps REST API 7.0, 7.1, 7.2-preview
- **Version selector**: Two dropdowns to pick "from" and "to" versions
- **Import buttons**: For versions not yet imported
- **Diff engine**: Compares endpoints between two versions:
  - **Added**: Endpoints in "to" but not in "from"
  - **Removed**: Endpoints in "from" but not in "to"
  - **Changed**: Endpoints present in both but with differences:
    - Path params added/removed
    - Query params added/removed/changed (e.g., required flag)
    - Request body added/removed/changed
    - Response schema added/removed/changed
    - Deprecation status changed
  - **Unchanged**: Identical in both
- **Summary cards**: Count of added, removed, changed, unchanged
- **Filters**: By status (added/removed/changed), category, and text search
- **Expandable entries**: Show full before/after details for changed endpoints
- **Export**: HTML report (styled, printable) or CSV

---

### 4.7 Webhooks Reference

**Route**: `/webhooks`

> **Azure DevOps equivalent**: Service Hooks

- **Two-panel layout**: Event list (left sidebar) + event detail (right)
- **Event list**: Searchable list of all webhook/service hook event types with action counts
- **Event detail**:
  - Event name + description
  - Available actions (e.g., `work item created`, `pull request updated`)
  - Key payload fields: field name, type, description
  - HTTP headers specific to the event
  - Link to official documentation

---

### 4.8 GraphQL → OData / Analytics (Optional)

**Route**: `/graphql` (rename to `/analytics` or `/odata` for Azure DevOps)

The GitHub version has a GraphQL query editor. Azure DevOps doesn't have a GraphQL API, but has:
- **OData / Analytics API** (`https://analytics.dev.azure.com/{org}`)
- **Reporting endpoints**

This page should be adapted to:
- **Query editor** for OData / Analytics queries
- **Pre-built example queries** (work item trends, pipeline metrics, etc.)
- **Variables panel** for parameterized queries
- **Resizable query/results panes**
- **Beginner guide** for the Azure DevOps Analytics API

---

## 5. Components

### AppContext (`AppContext.tsx`)
Global React context providing:
```typescript
interface AppContextType {
  // Active environment
  activeEnv: ActiveEnv | null;
  setActiveEnv: (env: ActiveEnv | null) => void;
  // Selected endpoint
  selectedEndpoint: EndpointSelection | null;
  selectEndpoint: (ep: EndpointSelection) => void;
  // Response data
  response: ResponseData | null;
  setResponse: (r: ResponseData | null) => void;
  // Loading state
  isLoading: boolean;
  setIsLoading: (l: boolean) => void;
  // Panel collapse state
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  responseCollapsed: boolean;
  toggleResponse: () => void;
  // Theme
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}
```

### TopBar (`TopBar.tsx`)
Two-row header:
- **Row 1**: Logo, app title, subtitle, spacer, environment dropdown, auth status indicator (green/red/yellow dot + text), rate limit progress bar, theme toggle
- **Row 2**: Navigation links with active state highlighting:
  - API Explorer | History | Collections | Compare | Templates | Webhooks | GraphQL/Analytics | Settings

### Sidebar (`Sidebar.tsx`)
- Collapsible (toggle button)
- API spec version dropdown
- Search input with keyboard shortcut
- Favorites section (collapsible)
- Category tree with lazy-loaded endpoints
- Bulk selection mode (Ctrl+Click)
- Method color badges (GET=green, POST=blue, PUT=yellow, PATCH=orange, DELETE=red)

### RequestBuilder (`RequestBuilder.tsx`)
- URL bar with method badge
- Path params with ParamCombobox (auto-complete)
- Query params with checkbox toggles
- Body textarea with JSON schema pre-fill
- Custom headers editor
- Tabs: Params | Body | Headers
- Send button + Ctrl+Enter shortcut
- Copy as cURL
- Batch execution mode
- Validation: blocks send if required params are missing

### ResponseViewer (`ResponseViewer.tsx`)
- Collapsible (toggle button)
- Status badge + timing + rate limit
- Tabs: Body | Headers | Raw | Preview
- JSON tree viewer with collapsible nodes
- Search/filter within response body
- Pagination ("Load More" for continuation tokens)
- Copy to clipboard
- CSV download for array responses

### ResizablePanels (`ResizablePanels.tsx`)
- Three-panel layout with drag handles
- Configurable min/max widths per panel
- Collapse support for left and right panels
- Uses mouse events for resizing

### ConfirmDialog (`ConfirmDialog.tsx`)
- Modal overlay for destructive actions
- Escape to close
- Two variants: `danger` (DELETE) and `warning` (POST/PUT/PATCH)
- Shows method + path detail

### ParamCombobox (`ParamCombobox.tsx`)
- Auto-discovery dropdown for path parameters
- Calls `/api/discover` to fetch available values
- Dependency chain: e.g., `repo` depends on `project` being filled
- In-memory cache (5 min TTL) on the server
- Filterable options list
- Portal-based dropdown positioning

**Azure DevOps discovery types**:

| Param Name | Discovery Type | Depends On | API Call |
|---|---|---|---|
| `organization` | orgs | — | List user organizations / profile |
| `project` | projects | organization | `GET /{org}/_apis/projects` |
| `repositoryId` / `repo` | repos | organization, project | `GET /{org}/{project}/_apis/git/repositories` |
| `teamId` / `team` | teams | organization, project | `GET /{org}/_apis/projects/{project}/teams` |
| `username` | members | organization, project | `GET /{org}/_apis/projects/{project}/teams/{team}/members` |
| `definitionId` | pipelines | organization, project | `GET /{org}/{project}/_apis/pipelines` |

---

## 6. API Routes (Backend)

### `POST /api/execute` — Request Proxy
The core route. Receives:
```typescript
{
  environmentId?: string;
  method: string;
  path: string;           // path template with {placeholders}
  pathParams: Record<string, string>;
  queryParams: Record<string, string>;
  headers: Record<string, string>;
  body: string | null;
  operationId?: string;
  category?: string;
  nextPageUrl?: string;   // for pagination
}
```
Processing:
1. Resolve environment and credentials
2. Replace `{param}` placeholders in path with actual values
3. Build full URL with query params (include `api-version` for Azure DevOps)
4. **SSRF protection**: Validate hostname matches configured base URL
5. Add auth header (`Authorization: Basic base64(:<PAT>)` for PAT)
6. Execute fetch
7. Parse response (JSON or text)
8. Extract rate limit info from headers
9. **Parse pagination**: Azure DevOps uses `x-ms-continuationtoken` header or `continuationToken` in response body (different from GitHub's `Link` header)
10. **Log to history**: Store request + response (truncated to 100KB)
11. Return response to client

### `GET /api/endpoints` — Endpoint Catalog
Actions (via `?action=` query param):
- `categories`: List all categories with counts, optionally filtered by spec version
- `by-category`: List all endpoints in a category
- `search`: Full-text search across operationId, path, summary, category

### `POST /api/environments` — Environment Management
Actions (via `body.action`):
- `create`: Create new environment
- `update`: Update environment fields
- `activate`: Set as active environment
- `delete`: Delete environment + cascade credentials
- `validate`: Test auth by calling a simple API endpoint
- `get-active`: Return the currently active environment
- `has-credential`: Check if credentials exist for an environment

### `GET/POST /api/history` — Request History
- `GET ?limit=N`: List recent history entries
- `GET ?id=X`: Get single entry with full details (includes response body)
- `POST { action: 'delete', id }`: Delete single entry
- `POST { action: 'clear' }`: Delete all history

### `GET/POST /api/collections` — Collections
- `GET`: List all collections with item counts
- `POST { action: 'create', name, description }`: Create collection
- `POST { action: 'update', id, name, description }`: Update collection
- `POST { action: 'delete', id }`: Delete collection
- `POST { action: 'duplicate', id }`: Clone a collection with all items
- `POST { action: 'get-items', collectionId }`: List items in a collection
- `POST { action: 'add-item', collectionId, method, path, ... }`: Add item
- `POST { action: 'delete-item', id }`: Remove item
- `POST { action: 'reorder', collectionId, itemIds[] }`: Reorder items

### `GET/POST /api/favorites` — Favorites
- `GET`: List all favorited operation IDs
- `POST { action: 'add', operationId }`: Add favorite
- `POST { action: 'remove', operationId }`: Remove favorite

### `GET/POST /api/variables` — Environment Variables
- `GET ?environmentId=X`: List variables for an environment
- `POST { action: 'set', environmentId, name, value }`: Create/update variable
- `POST { action: 'delete', id }`: Delete variable

### `GET /api/compare` — API Version Comparison
- `GET ?action=versions`: List imported and available spec versions
- `GET ?action=diff&from=X&to=Y`: Compute diff between two versions

### `POST /api/import` — OpenAPI Spec Import
- `POST { specVersion }`: Fetch and parse the OpenAPI spec, insert all endpoints

### `GET /api/discover` — Parameter Auto-Discovery
- `GET ?type=orgs|projects|repos|teams|members|pipelines&...`: Discover available values for path params
- Server-side cache (5 min TTL) to avoid repeated API calls

### `POST /api/graphql` (→ `/api/analytics` for Azure DevOps)
- Proxies OData/Analytics queries to Azure DevOps Analytics API

---

## 7. Database Schema

SQLite with WAL mode + foreign keys. Six tables:

### `environments`
```sql
CREATE TABLE environments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT 'https://dev.azure.com',
  organization TEXT NOT NULL DEFAULT '',   -- Azure DevOps org (was enterprise_slug)
  project TEXT NOT NULL DEFAULT '',        -- Default project (was org_name)
  auth_method TEXT NOT NULL DEFAULT 'pat', -- 'pat' | 'oauth'
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `credentials`
```sql
CREATE TABLE credentials (
  environment_id TEXT PRIMARY KEY REFERENCES environments(id) ON DELETE CASCADE,
  auth_type TEXT NOT NULL,
  encrypted_data TEXT NOT NULL,   -- AES-256-CBC encrypted
  iv TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `endpoints`
```sql
CREATE TABLE endpoints (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,           -- API area (e.g., 'git', 'build', 'wit')
  subcategory TEXT NOT NULL DEFAULT '',
  operation_id TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  path_params TEXT NOT NULL DEFAULT '[]',    -- JSON array
  query_params TEXT NOT NULL DEFAULT '[]',   -- JSON array
  body_schema TEXT,                          -- JSON string
  response_schema TEXT,                      -- JSON string
  is_deprecated INTEGER NOT NULL DEFAULT 0,
  spec_version TEXT NOT NULL DEFAULT '7.1'   -- API version
);
CREATE INDEX idx_endpoints_category ON endpoints(category);
CREATE INDEX idx_endpoints_method ON endpoints(method);
CREATE INDEX idx_endpoints_operation_id ON endpoints(operation_id);
```

### `history`
```sql
CREATE TABLE history (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  resolved_url TEXT NOT NULL,
  status INTEGER NOT NULL,
  timing REAL NOT NULL,
  request_body TEXT,
  response_body TEXT,         -- truncated to 100KB
  response_headers TEXT,      -- JSON string
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  operation_id TEXT,
  category TEXT
);
CREATE INDEX idx_history_env ON history(environment_id);
CREATE INDEX idx_history_created ON history(created_at DESC);
```

### `collections` + `collection_items`
```sql
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  environment_id TEXT REFERENCES environments(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE collection_items (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  operation_id TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  path_params TEXT NOT NULL DEFAULT '{}',    -- JSON
  query_params TEXT NOT NULL DEFAULT '{}',   -- JSON
  headers TEXT NOT NULL DEFAULT '{}',        -- JSON
  body TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_collection_items_coll ON collection_items(collection_id);
```

### `env_variables`
```sql
CREATE TABLE env_variables (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  UNIQUE(environment_id, name)
);
```

### `favorites`
```sql
CREATE TABLE favorites (
  operation_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 8. Authentication

### PAT (Personal Access Token) — Primary
Azure DevOps PATs use **Basic authentication**:
```
Authorization: Basic base64(":" + token)
```

The `auth.ts` module should:
1. Retrieve the environment by ID
2. Decrypt the stored credential
3. Return a configured fetch wrapper or SDK client

### OAuth 2.0 (Azure AD / Entra ID) — Secondary
For OAuth support:
1. Register an Azure AD app
2. Use MSAL to acquire tokens
3. Use `Authorization: Bearer <token>` header
4. Store refresh tokens encrypted in the credentials table

### Auth Validation
Test connection by calling:
- PAT: `GET https://dev.azure.com/{organization}/_apis/projects?api-version=7.1`
- OAuth: Same endpoint with Bearer token

### Credential Encryption
- **AES-256-CBC** encryption for all stored credentials
- Auto-generated encryption key stored in `.env.local`
- IV stored alongside encrypted data in the `credentials` table

---

## 9. Security

| Feature | Implementation |
|---|---|
| **Credentials encrypted at rest** | AES-256-CBC with locally generated key in `.env.local` |
| **SSRF protection** | Execute route validates request URL hostname against configured base URL |
| **Backend proxy** | All API calls go through Next.js routes; tokens never reach the browser |
| **Secrets excluded from git** | `.env.local` and `data/` in `.gitignore` |
| **Destructive action confirmation** | Modal dialog before DELETE/PUT/PATCH/POST requests |
| **Input validation** | Required param validation before sending requests |
| **Response truncation** | Large response bodies truncated to 100KB for history storage |

---

## 10. OpenAPI / API Catalog Import

### Source
Azure DevOps publishes their REST API specs. Use these sources:
- **Official docs**: `https://docs.microsoft.com/en-us/rest/api/azure/devops/`
- **Swagger/OpenAPI specs**: From Azure DevOps REST API documentation or `MicrosoftDocs/vsts-rest-api-specs` repo
- **Programmatic**: Fetch from `https://dev.azure.com/{org}/_apis` which returns available APIs

### Import Process (`openapi-import.ts`)
1. **Fetch** the OpenAPI/Swagger spec (JSON) for a given API version
2. **Parse** paths and operations:
   - Extract category from tags or `x-ms-*` metadata
   - Extract operation ID
   - Extract path parameters (resolve `$ref` to `components/parameters`)
   - Extract query parameters (including `api-version`)
   - Extract request body schema (simplified to 4 levels deep)
   - Extract response schema
   - Handle deprecated flags
3. **Insert** into the `endpoints` table
4. Return summary: count of endpoints, categories

### CLI Script (`scripts/import-openapi.ts`)
```bash
npm run import-api                    # imports latest version
npm run import-api -- 7.0             # imports specific version
```

---

## 11. Theming & Styling

### Design Tokens
CSS custom properties in `globals.css`, switchable via `data-theme="dark|light"` on `<html>`:

```css
:root {
  --canvas: #0d1117;        /* page background */
  --panel: #161b22;         /* panel/card background */
  --surface: #21262d;       /* input/elevated surface */
  --border: #30363d;        /* borders */
  --text-primary: #e6edf3;  /* main text */
  --text-secondary: #8b949e; /* secondary text */
  --text-muted: #484f58;    /* muted text */
  --accent: #58a6ff;        /* links, active states */
  --accent-emphasis: #1f6feb; /* buttons */
  --success: #3fb950;       /* success states, GET method */
  --warning: #d29922;       /* warning states, PUT method */
  --danger: #f85149;        /* danger states, DELETE method */
  --info: #58a6ff;          /* info states, POST method */
  /* HTTP method colors */
  --method-get: #3fb950;
  --method-post: #58a6ff;
  --method-put: #d29922;
  --method-patch: #db6d28;
  --method-delete: #f85149;
}
```

Light theme overrides all tokens for light backgrounds.

### Tailwind Integration
Tokens are mapped to Tailwind via `@theme inline` block:
```css
@theme inline {
  --color-canvas: var(--canvas);
  --color-panel: var(--panel);
  /* ... etc ... */
}
```

Usage: `bg-canvas`, `text-text-primary`, `border-border`, `bg-accent-emphasis`, etc.

### CSS Utility Classes
```css
.method-get-bg    /* green background */
.method-post-bg   /* blue background */
.method-put-bg    /* yellow background */
.method-patch-bg  /* orange background */
.method-delete-bg /* red background */
.status-2xx       /* green text */
.status-3xx       /* info text */
.status-4xx       /* warning text */
.status-5xx       /* danger text */
.json-string      /* green text for JSON strings */
.json-number      /* info text for JSON numbers */
.json-boolean     /* warning text for JSON booleans */
.json-null        /* danger text for JSON null */
.json-key         /* primary text for JSON keys */
```

### Fonts
- **Sans**: Geist Sans (Google Fonts)
- **Mono**: Geist Mono (Google Fonts)

---

## 12. Azure DevOps Mapping Guide

### API URL Structure

| GitHub | Azure DevOps |
|---|---|
| `https://api.github.com/orgs/{org}/repos` | `https://dev.azure.com/{organization}/{project}/_apis/git/repositories?api-version=7.1` |
| Path-only params | Path params + mandatory `api-version` query param |
| `X-GitHub-Api-Version` header | `api-version` query parameter |

### Key API Areas

| Azure DevOps API Area | Base Path | Description |
|---|---|---|
| **Core** | `/_apis/projects` | Projects, teams, processes |
| **Git** | `/{project}/_apis/git/repositories` | Repos, commits, branches, PRs, pushes |
| **Build** | `/{project}/_apis/build` | Build definitions, runs |
| **Pipelines** | `/{project}/_apis/pipelines` | YAML pipelines, runs |
| **Work Item Tracking** | `/{project}/_apis/wit` | Work items, queries, fields |
| **Release** | `/{project}/_apis/release` | Release definitions, deployments |
| **Test** | `/{project}/_apis/test` | Test plans, runs, results |
| **Wiki** | `/{project}/_apis/wiki` | Wiki pages |
| **Graph** | `/_apis/graph` | Users, groups, memberships |
| **Audit** | `/_apis/audit` | Audit log |
| **Service Hooks** | `/_apis/hooks` | Service hook subscriptions |
| **Extension Management** | `/_apis/extensionmanagement` | Extensions |
| **Policy** | `/{project}/_apis/policy` | Branch policies |
| **Security** | `/_apis/security` | Namespaces, ACLs, permissions |
| **Dashboard** | `/{project}/{team}/_apis/dashboard` | Dashboards, widgets |
| **Notification** | `/_apis/notification` | Subscriptions |
| **Artifacts** | `/{project}/_apis/packaging` | Feeds, packages |

### Pagination
Azure DevOps uses different pagination than GitHub:
- **Continuation token**: `x-ms-continuationtoken` response header or `continuationToken` in response body
- **`$top` and `$skip`** query parameters for some endpoints
- No `Link` header pagination

The execute route should handle both patterns.

### Rate Limiting
Azure DevOps has different rate limiting:
- **Global**: Throttled at ~200 requests/min for PAT
- **Headers**: `Retry-After`, `X-RateLimit-Remaining`, `X-RateLimit-Limit`, `X-RateLimit-Reset`
- **Response code**: `429 Too Many Requests`

---

## 13. Request Templates (Azure DevOps)

Pre-built template collections to include:

### Project Health Check
```typescript
{
  id: 'project-health',
  name: 'Project Health Check',
  description: 'Overview of project settings, teams, repos, and policies',
  icon: '🏥',
  items: [
    { method: 'GET', path: '/{organization}/{project}/_apis/projects/{project}', summary: 'Get project details' },
    { method: 'GET', path: '/{organization}/_apis/projects/{project}/teams', summary: 'List teams', queryParams: { 'api-version': '7.1' } },
    { method: 'GET', path: '/{organization}/{project}/_apis/git/repositories', summary: 'List repositories' },
    { method: 'GET', path: '/{organization}/{project}/_apis/policy/configurations', summary: 'List branch policies' },
    { method: 'GET', path: '/{organization}/{project}/_apis/build/definitions', summary: 'List build definitions' },
    { method: 'GET', path: '/{organization}/{project}/_apis/pipelines', summary: 'List pipelines' },
  ],
}
```

### Pipelines Overview
```typescript
{
  id: 'pipelines-overview',
  name: 'Pipelines Overview',
  description: 'Pipeline definitions, recent runs, agents, and variable groups',
  icon: '⚡',
  items: [
    { method: 'GET', path: '/{organization}/{project}/_apis/pipelines', summary: 'List pipelines' },
    { method: 'GET', path: '/{organization}/{project}/_apis/build/builds', summary: 'List recent builds', queryParams: { '$top': '20' } },
    { method: 'GET', path: '/{organization}/{project}/_apis/distributedtask/pools', summary: 'List agent pools' },
    { method: 'GET', path: '/{organization}/{project}/_apis/distributedtask/variablegroups', summary: 'List variable groups' },
    { method: 'GET', path: '/{organization}/{project}/_apis/build/retention', summary: 'Get retention policies' },
  ],
}
```

### Work Item Tracking
```typescript
{
  id: 'work-items',
  name: 'Work Item Tracking',
  description: 'Work items, queries, fields, and backlogs',
  icon: '📋',
  items: [
    { method: 'GET', path: '/{organization}/{project}/_apis/wit/workitemtypes', summary: 'List work item types' },
    { method: 'GET', path: '/{organization}/{project}/_apis/wit/fields', summary: 'List fields' },
    { method: 'GET', path: '/{organization}/{project}/_apis/wit/queries', summary: 'List shared queries', queryParams: { '$depth': '2' } },
    { method: 'GET', path: '/{organization}/{project}/_apis/work/boards', summary: 'List boards' },
    { method: 'GET', path: '/{organization}/{project}/_apis/work/iterations', summary: 'List iterations' },
  ],
}
```

### Repository Deep Dive
```typescript
{
  id: 'repo-deep-dive',
  name: 'Repository Deep Dive',
  description: 'Full overview of a Git repository: branches, PRs, commits, policies',
  icon: '📁',
  items: [
    { method: 'GET', path: '/{organization}/{project}/_apis/git/repositories/{repositoryId}', summary: 'Get repository details' },
    { method: 'GET', path: '/{organization}/{project}/_apis/git/repositories/{repositoryId}/refs', summary: 'List branches/refs' },
    { method: 'GET', path: '/{organization}/{project}/_apis/git/repositories/{repositoryId}/pullrequests', summary: 'List pull requests', queryParams: { 'searchCriteria.status': 'active' } },
    { method: 'GET', path: '/{organization}/{project}/_apis/git/repositories/{repositoryId}/commits', summary: 'List recent commits', queryParams: { '$top': '20' } },
    { method: 'GET', path: '/{organization}/{project}/_apis/git/repositories/{repositoryId}/stats/branches', summary: 'Get branch stats' },
  ],
}
```

### Security & Compliance
```typescript
{
  id: 'security-compliance',
  name: 'Security & Compliance',
  description: 'Audit log, permissions, policies, and security namespaces',
  icon: '🔒',
  items: [
    { method: 'GET', path: '/{organization}/_apis/audit/streams', summary: 'List audit streams' },
    { method: 'GET', path: '/{organization}/_apis/audit/auditlog', summary: 'Get audit log entries' },
    { method: 'GET', path: '/{organization}/_apis/security/securitynamespaces', summary: 'List security namespaces' },
    { method: 'GET', path: '/{organization}/{project}/_apis/policy/configurations', summary: 'List policy configurations' },
  ],
}
```

### Team Management
```typescript
{
  id: 'team-management',
  name: 'Team Management',
  description: 'Teams, members, iterations, and area paths',
  icon: '👥',
  items: [
    { method: 'GET', path: '/{organization}/_apis/projects/{project}/teams', summary: 'List project teams' },
    { method: 'GET', path: '/{organization}/_apis/graph/users', summary: 'List users in org' },
    { method: 'GET', path: '/{organization}/_apis/graph/groups', summary: 'List groups' },
    { method: 'GET', path: '/{organization}/{project}/{team}/_apis/work/iterations', summary: 'List team iterations' },
    { method: 'GET', path: '/{organization}/{project}/{team}/_apis/work/teamsettings', summary: 'Get team settings' },
  ],
}
```

### Org Administration
```typescript
{
  id: 'org-admin',
  name: 'Organization Administration',
  description: 'Organization settings, processes, extensions, and billing',
  icon: '🏢',
  items: [
    { method: 'GET', path: '/{organization}/_apis/projects', summary: 'List all projects' },
    { method: 'GET', path: '/{organization}/_apis/process/processes', summary: 'List processes' },
    { method: 'GET', path: '/{organization}/_apis/extensionmanagement/installedextensions', summary: 'List installed extensions' },
    { method: 'GET', path: '/{organization}/_apis/userentitlements', summary: 'List user entitlements' },
    { method: 'GET', path: '/{organization}/_apis/serviceendpoint/endpoints', summary: 'List service connections' },
  ],
}
```

### Artifacts & Feeds
```typescript
{
  id: 'artifacts',
  name: 'Artifacts & Feeds',
  description: 'Package feeds, packages, and artifact management',
  icon: '📦',
  items: [
    { method: 'GET', path: '/{organization}/{project}/_apis/packaging/feeds', summary: 'List package feeds' },
    { method: 'GET', path: '/{organization}/_apis/packaging/feeds', summary: 'List org-level feeds' },
  ],
}
```

---

## 14. Service Hooks Reference (Azure DevOps)

Replace GitHub webhook events with Azure DevOps service hook events:

```typescript
interface ServiceHookEvent {
  name: string;
  description: string;
  publisherId: string;     // e.g., 'tfs', 'pipelines', 'git'
  eventType: string;       // e.g., 'workitem.created'
  actions: string[];
  keyPayloadFields: Array<{ field: string; type: string; description: string }>;
  docsUrl: string;
}
```

### Key Events to Document

| Publisher | Event Type | Description |
|---|---|---|
| **tfs** | `workitem.created` | A work item is created |
| **tfs** | `workitem.updated` | A work item is updated |
| **tfs** | `workitem.deleted` | A work item is deleted |
| **tfs** | `workitem.commented` | A comment is added to a work item |
| **git** | `git.push` | Code is pushed to a repository |
| **git** | `git.pullrequest.created` | A pull request is created |
| **git** | `git.pullrequest.updated` | A pull request is updated |
| **git** | `git.pullrequest.merged` | A pull request is merged |
| **pipelines** | `build.complete` | A build completes |
| **pipelines** | `ms.vss-release.release-created-event` | A release is created |
| **pipelines** | `ms.vss-release.deployment-completed-event` | A deployment completes |
| **pipelines** | `ms.vss-pipelines.run-state-changed-event` | A pipeline run state changes |
| **tfs** | `tfvc.checkin` | A TFVC check-in occurs |
| **tfs** | `message.posted` | A message is posted in a team room |

---

## 15. Getting Started

### Setup Steps
```bash
# 1. Clone and install
git clone <repo-url>
cd azure-devops-api-explorer
npm install

# 2. Import the API catalog
npm run import-api

# 3. Start the dev server
npm run dev

# 4. Open http://localhost:3000
# 5. Go to Settings → Create a new environment:
#    - Name: My Azure DevOps Org
#    - Base URL: https://dev.azure.com/{your-org}
#    - Organization: your-org-name
#    - Project: your-default-project
#    - Auth: PAT
#    - Token: paste your PAT
# 6. Click Test → verify connection
# 7. Go to API Explorer → start exploring!
```

### Environment Configuration
- **Name**: Human-readable label
- **API Base URL**: `https://dev.azure.com/{organization}` for cloud, or TFS URL for on-prem
- **Organization**: Azure DevOps organization name
- **Default Project**: Default project to use for `{project}` param auto-fill
- **Auth Method**: `pat` (Personal Access Token) or `oauth` (Azure AD)
- **Token**: PAT value (encrypted at rest)

### Azure DevOps PAT Scopes
Recommend creating a PAT with these scopes for full exploration:
- **Code**: Read
- **Build**: Read
- **Release**: Read
- **Work Items**: Read
- **Test Management**: Read
- **Project & Team**: Read
- **Graph**: Read
- **Analytics**: Read
- **Audit Log**: Read
- **Extension Management**: Read
- **Packaging**: Read

---

## 16. Project Configuration Files

These config files are needed to bootstrap the project:

### `package.json` scripts
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "import-api": "tsx scripts/import-openapi.ts",
    "import-api:version": "tsx scripts/import-openapi.ts"
  }
}
```

### `next.config.ts`
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
```

### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### `postcss.config.mjs`
```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
export default config;
```

---

## 17. Key Implementation Details

### Rate Limit Event Bus
The `RequestBuilder` dispatches a custom DOM event when a response includes rate limit data. The `TopBar` listens for it to update the rate limit progress bar:
```typescript
// RequestBuilder — after receiving a response:
if (data.rateLimit) {
  window.dispatchEvent(new CustomEvent('rate-limit-update', { detail: { rateLimit: data.rateLimit } }));
}

// TopBar — listener:
window.addEventListener('rate-limit-update', (e: CustomEvent) => {
  setRateLimit({ remaining: e.detail.rateLimit.remaining, limit: e.detail.rateLimit.limit });
});
```

### JSON Body Generation from Schema
The `RequestBuilder` generates example JSON from the OpenAPI body schema:
```typescript
function generateExampleBody(schema: unknown): string {
  // Generates a JSON string from the schema's `properties` and `required` fields
  // Uses schema.default values, falls back to type-based defaults:
  //   string → "", number → 0, boolean → false, array → [], object → {}
  // Recurses into nested properties (max depth ~3)
  // Returns pretty-printed JSON
}
```

### JSON Response Filtering
The `ResponseViewer` provides a filter input that recursively filters the JSON tree:
- Matches against both **keys** and **values**
- If a key matches, the **entire value subtree** is kept
- If a value matches deep inside an object, the **parent path** is preserved
- Arrays are filtered to only matching items

### JSON Tree Viewer
The `ResponseViewer` includes a custom `JsonViewer` component:
- **Collapsible nodes**: Objects/arrays auto-collapse at depth > 2
- **Syntax highlighting**: Keys, strings, numbers, booleans, null all colored
- **Long string truncation**: Strings > 200 chars truncated at depth > 0
- **Badge counts**: Collapsed nodes show `{N keys}` or `[N items]`

### Preview Tab
The `PreviewRenderer` in `ResponseViewer` provides a rich preview:
- Detects and renders **image URLs** as thumbnails (`<img>` tags)
- Detects and renders **URLs** as clickable links
- Color-codes **booleans** (green/red), **numbers** (blue), **null** (muted italic)
- **Nested objects** are expandable with depth tracking
- Separates content into: images → URLs → scalar values → nested objects

### CSV Download
For array responses, the CSV download:
- Collects **all unique keys** across all array items
- Excludes keys whose values are nested objects
- Escapes double quotes in values
- Downloads as `response-{YYYY-MM-DD}.csv`

### Batch Execution
The batch execution feature in `RequestBuilder`:
- Shows a textarea for entering multiple values (one per line)
- Selects which path param to iterate over (dropdown)
- Executes requests **sequentially** (not parallel)
- Updates the response pane **progressively** after each request
- Final response body is a structured `_batch: true` object with per-value results
- Status is `207 Multi-Status` if any requests failed, `200` if all passed

### Save to Collection from Request Builder
A `SaveToCollectionButton` component in the URL bar allows saving the current request (with all params, headers, and body) directly to a collection without navigating away.

### Collection "Run All" Results
When running all items in a collection:
- Sequential execution with a progress indicator
- Each item shows: status badge, timing, error message if applicable
- Expandable response body per item
- Summary bar: `X passed, Y failed` with total timing
- CSV export of results (status, timing, path per item)
- **Destructive action confirmation**: Before running, if any items contain destructive methods (DELETE/PATCH/PUT/POST), a confirmation dialog is shown

### History Diff Viewer
The history page allows comparing two selected entries side-by-side:
- **Two-column layout** with request labels + timestamps
- **Status + timing comparison**: Shows both statuses and timings
- **Response body diff**: Side-by-side JSON views
- **Header comparison**: Side-by-side headers

### Keyboard Shortcuts
| Shortcut | Action |
|---|---|
| `Ctrl+K` / `⌘K` | Focus sidebar search |
| `Ctrl+Enter` / `⌘Enter` | Send current request |
| `Escape` | Close confirmation dialog |
| `Ctrl+Click` | Bulk-select endpoints in sidebar |

### OpenAPI Spec Fetch Strategy

The original fetches GitHub's spec from their public repo:
```
https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/{version}/{version}.json
```

For Azure DevOps, you'll need to adapt this to fetch from the Azure DevOps REST API specs. Options:
1. **Microsoft's REST API specs repo**: `https://github.com/MicrosoftDocs/vsts-rest-api-specs`
2. **Azure DevOps REST API reference docs**: Parse from the official documentation
3. **Bundle locally**: Download the Swagger/OpenAPI specs and include them in the `data/` directory
4. **Generate from `OPTIONS` requests**: Some Azure DevOps endpoints support `OPTIONS`

**Important**: Before implementing the OpenAPI import, consult the [Azure DevOps REST API reference](https://learn.microsoft.com/en-us/rest/api/azure/devops/) to identify the correct Swagger/OpenAPI spec locations. The specs are organized per API area (Git, Build, Work Item Tracking, etc.) rather than as a single bundled file like GitHub's. You may need to fetch and merge multiple spec files, or use the [vsts-rest-api-specs](https://github.com/MicrosoftDocs/vsts-rest-api-specs) repo which contains per-area spec files. Each area spec covers one API version (e.g., `git/7.1/git.json`, `build/7.1/build.json`).

The spec parser handles:
- `x-github.category` → For Azure DevOps, use `tags` or custom `x-ms-*` metadata
- `$ref` resolution for shared parameters (e.g., `#/components/parameters/api-version`)
- Path-level + operation-level parameter merging (operation overrides path)
- Fallback: infer path params from `{param}` segments when OpenAPI spec doesn't declare them
- Schema simplification: Nested schemas are simplified to max depth 4 for storage
- Description truncation: Capped at 2000 characters

### `.env.local` Auto-Generation
On first run, if no `ENCRYPTION_KEY` is set:
1. Generate 32 random bytes → hex string (64 chars)
2. Append `ENCRYPTION_KEY=...` to `.env.local`
3. Cache in `process.env` for the current process

### `.gitignore` Requirements
```
.env.local
data/
.next/
node_modules/
```

---

## Appendix: Key Differences from GitHub Version

| Aspect | GitHub API Explorer | Azure DevOps API Explorer |
|---|---|---|
| **API versioning** | `X-GitHub-Api-Version` header | `api-version` query parameter (mandatory) |
| **Auth header** | `Authorization: token <PAT>` | `Authorization: Basic base64(":" + <PAT>)` |
| **Pagination** | `Link` header with `rel="next"` | `x-ms-continuationtoken` header or `continuationToken` field |
| **Rate limiting** | Well-defined `X-RateLimit-*` headers | `Retry-After` header, `429` status, variable headers |
| **GraphQL** | Full GraphQL API | No GraphQL; use OData/Analytics instead |
| **OpenAPI specs** | `github/rest-api-description` repo | `MicrosoftDocs/vsts-rest-api-specs` or docs site |
| **SDK** | `@octokit/rest` | `azure-devops-node-api` or raw fetch |
| **Org hierarchy** | Enterprise → Organization → Repository | Organization → Project → Repository |
| **Accept header** | `application/vnd.github+json` | `application/json` |
| **Enterprise slug** | URL path segment | Part of base URL |
| **Webhook events** | GitHub Webhooks | Azure DevOps Service Hooks |
| **Default base URL** | `https://api.github.com` | `https://dev.azure.com/{org}` |
