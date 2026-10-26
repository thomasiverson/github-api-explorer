# GitHub API Explorer — User Guide

Detailed documentation for setup, usage, and architecture.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Install & Run](#install--run)
- [First-Time Setup](#first-time-setup)
- [Usage](#usage)
- [Scripts](#scripts)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Security](#security)

## Prerequisites

- **Node.js** 18+ and **npm**
- A GitHub **Personal Access Token** (classic or fine-grained) with appropriate scopes
- Python build tools for `better-sqlite3` native module (usually already present)

## Install & Run

```bash
git clone https://github.com/thomasiverson/github-api-explorer.git
cd github-api-explorer
npm install
npm run import-api
npm run dev
```

Open **http://localhost:43117** in your browser.

## First-Time Setup

1. Go to **Settings** (top nav) → click **+ New Environment**
2. Fill in:
   - **Name**: e.g. `My EMU`
   - **API Base URL**: `https://api.github.com` (for cloud EMU) or your GHES URL
   - **Enterprise Slug**: your enterprise slug (e.g. `tpitest`)
   - **Organization Login**: the org's URL slug — find it at `github.com/orgs/<this-value>` (not the display name)
   - **Auth Method**: `Personal Access Token`
   - **Token**: paste your PAT (`ghp_...` or `github_pat_...`)
3. Click **Save** → click **Test** to verify the connection
4. Go back to the home page → start exploring APIs!

### Finding Your Org Login

If you're not sure what your org login is, configure your PAT first, then hit the `GET /user/orgs` endpoint. The `login` field in the response is what you need.

## Usage

### Exploring Endpoints

- **Browse** — expand categories in the left sidebar (actions, copilot, repos, orgs, etc.)
- **Search** — press `⌘K` (or `Ctrl+K`) and type endpoint names, paths, or descriptions
- **Select** — click any endpoint to load it into the request builder

### Sending Requests

1. Select an endpoint from the sidebar
2. Fill in path parameters (auto-populated where possible)
3. Check/uncheck query parameters and set values
4. For POST/PUT/PATCH, edit the JSON body (pre-populated from the OpenAPI schema)
5. Click **Send**
6. View the response in the right panel — switch between Body, Headers, Raw, and Preview tabs

### Response Tabs

| Tab | Description |
|-----|-------------|
| **Body** | Collapsible JSON tree with syntax highlighting |
| **Headers** | Response headers with rate limit info |
| **Raw** | Pretty-printed JSON text |
| **Preview** | URLs rendered as clickable links, image thumbnails, values with type coloring |

### Pagination

When a response includes pagination (`Link` header), a **"Load More →"** button appears at the bottom of the Body tab. Click it to fetch the next page — results are appended to the current view.

### GraphQL

The GraphQL page provides a query editor with:
- Pre-built example queries (viewer info, repo details, org members, Copilot usage, enterprise overview, search)
- Variables panel for parameterized queries
- Resizable query/results panes
- Beginner guide explaining GraphQL concepts and how to use the GitHub GraphQL API

### History

- Every request is logged with method, category, resolved URL, status, and timing
- Expand any row to see path parameters, query parameters, and request body
- Replay requests or add them to collections (preserving all parameters and body)
- Filter by method, path, or category

### Collections

- Group related requests for batch execution
- Items show resolved URLs with filled-in parameters
- Expandable details show path params, query params, and request body
- Run all items in sequence with pass/fail results

### API Version Comparison

- Import multiple API spec versions (cloud, GHES 3.10, 3.20, etc.) from Settings or Compare page
- Diff two versions to see added, removed, and changed endpoints
- Export comparison results as HTML or CSV

### Webhooks

- Browse all GitHub webhook event types
- View available actions, key payload fields, and HTTP headers for each event
- Links to official documentation

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run import-api` | Import/refresh the API catalog from GitHub's OpenAPI spec (cloud) |
| `npm run import-api:ghes ghes-3.12` | Import a GHES-versioned API catalog |

## Configuration

### Environment Variables (`.env.local`)

Created automatically on first run. Contains:

| Variable | Description |
|----------|-------------|
| `ENCRYPTION_KEY` | Auto-generated AES-256 key for encrypting credentials at rest |
| `GITHUB_API_BASE_URL` | Default API base URL (overridden per-environment in the UI) |

### Multi-Environment Support

Configure multiple environments in Settings — each with its own base URL, enterprise slug, org, and credentials. Switch between them using the dropdown in the top bar to test across different customer EMU instances.

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── collections/  # Collections CRUD + items
│   │   ├── compare/      # API version comparison + diff
│   │   ├── endpoints/    # Endpoint catalog queries
│   │   ├── environments/ # Environment CRUD + auth validation
│   │   ├── execute/      # Request proxy (SSRF-protected)
│   │   ├── favorites/    # Favorite endpoints
│   │   ├── graphql/      # GraphQL query proxy
│   │   ├── history/      # Request history CRUD + category backfill
│   │   ├── import/       # OpenAPI spec import
│   │   └── variables/    # Environment variables
│   ├── collections/      # Collections management page
│   ├── compare/          # API version comparison page
│   ├── graphql/          # GraphQL query editor
│   ├── history/          # Request history with expandable details
│   ├── settings/         # Environment, auth config, API catalog
│   ├── templates/        # Request templates
│   ├── webhooks/         # Webhook event reference
│   └── page.tsx          # Main three-panel workspace
├── components/
│   ├── AppContext.tsx     # Global state (environment, endpoint, response)
│   ├── TopBar.tsx         # Two-row header: branding + nav with active indicators
│   ├── Sidebar.tsx        # API explorer with category tree + search
│   ├── RequestBuilder.tsx # URL bar, params, body editor, endpoint docs
│   ├── ResponseViewer.tsx # JSON tree, headers, raw, preview tabs
│   └── ResizablePanels.tsx# Drag-to-resize panel layout
├── lib/
│   ├── auth.ts           # Octokit factory (PAT + GitHub App)
│   ├── db.ts             # SQLite schema, CRUD, encryption, category lookup
│   ├── openapi-import.ts # OpenAPI spec parser
│   ├── templates.ts      # Request template definitions
│   ├── types.ts          # TypeScript interfaces
│   └── webhooks.ts       # Webhook event definitions
scripts/
└── import-openapi.ts     # CLI for importing the API catalog
data/
└── harness.db            # Local SQLite database (gitignored)
```

### Tech Stack

- **Next.js 16** (App Router) — unified frontend + backend
- **TypeScript** — end-to-end type safety
- **Tailwind CSS** — GitHub Primer dark theme tokens
- **@octokit/rest** + **@octokit/auth-app** — GitHub API SDK with auth strategies
- **better-sqlite3** — local database, zero external dependencies
- **OpenAPI 3.0** — auto-generated endpoint catalog from `github/rest-api-description`

## Security

- **Credentials encrypted at rest** — AES-256-CBC with a locally generated key
- **SSRF protection** — the execute endpoint validates request URLs against the configured API base
- **Backend proxy** — tokens never leave the server; browser never sees raw credentials
- **`.env.local` and `data/` are gitignored** — no secrets in source control
