# GitHub API Explorer — Copilot Instructions

## What This Project Is

A local-first Next.js application for exploring, testing, and automating GitHub REST and GraphQL APIs. It supports multiple GitHub environments (cloud EMU, GHES), encrypted credential storage, request history, collections, and batch operations like org creation.

## Critical Warning

This project uses **Next.js 16** with **React 19** and **Tailwind CSS 4**. These versions have breaking changes from what you were trained on. Before using any unfamiliar API, check `node_modules/next/dist/docs/`. Heed deprecation notices in `AGENTS.md`.

## Tech Stack

| Technology | Version | Key Detail |
|---|---|---|
| Next.js | 16.2.1 | App Router only. `better-sqlite3` in `serverExternalPackages`. |
| React | 19.2.4 | Add `'use client'` only to components that use client-side React features |
| TypeScript | 5.x | Strict mode. Path alias `@/*` → `./src/*` |
| Tailwind CSS | 4.x | Config lives in `@theme` blocks in `globals.css`, NOT in `tailwind.config.js` |
| better-sqlite3 | 12.x | Synchronous SQLite, WAL mode, foreign keys |
| @octokit/rest | 22.x | GitHub API SDK with PAT + GitHub App auth |

## Architecture

- **Unified full-stack**: Next.js serves both UI and API routes. No separate backend.
- **Local-first**: SQLite DB at `data/harness.db` (gitignored). Zero cloud dependencies.
- **Backend proxy**: All GitHub API calls go through `/api/execute` (REST) or `/api/graphql` (GraphQL). Tokens never reach the browser.
- **Multi-environment**: Users configure multiple GitHub instances and switch between them.
- **No UI library**: Hand-rolled components with Tailwind + CSS custom properties. No shadcn, Radix, or MUI.

## Project Structure

```
src/
├── app/
│   ├── api/          # API routes (execute, graphql, environments, history, etc.)
│   ├── graphql/      # GraphQL editor + batch-orgs sub-page
│   ├── settings/     # Environment & auth config
│   ├── history/      # Request history
│   ├── collections/  # Saved request groups
│   └── page.tsx      # Main three-panel workspace
├── components/       # PascalCase.tsx, named exports, 'use client'
└── lib/              # kebab-case.ts (auth, db, types, templates, webhooks)
```

## Key Conventions

### Styling
- Use project design tokens as Tailwind classes: `bg-canvas`, `bg-panel`, `bg-surface`, `text-text-primary`, `text-text-secondary`, `text-text-muted`, `border-border`, `bg-accent-emphasis`, `text-success`, `text-danger`, `text-warning`
- Dark theme is the default (`data-theme="dark"`). Light mode is an override.
- Never use arbitrary Tailwind values when a design token exists.

### Security
- Never expose auth tokens to the client. All external API calls must go through server-side API routes.
- SSRF protection: validate target hostnames against the configured base URL.
- Credentials are AES-256-CBC encrypted at rest in SQLite.

### Accessibility
- The primary user is colorblind. Never use color alone to convey meaning.
- Always pair color with a text label, icon, or symbol (e.g., `✔ Created` not just a green dot).
- Use high-contrast combinations for selected/active states.
- Prefer `✔` over `✅` emoji (the emoji is hard to see at small sizes).
- Reserve red text exclusively for errors/failures.

### UX Preferences
- Conserve vertical space. Prefer inline layouts and collapsible sections over stacked rows.
- Use explicit button triggers for dropdowns, not browser-native `<datalist>`.
- Dropdowns should be at least `w-96` wide so content isn't truncated.
- Filter out the enterprise setup user (`{slug}_admin`) from admin defaults — it cannot own organizations.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server (http://localhost:3000) |
| `npm run build` | Production build |
| `npm run lint` | ESLint check |
| `npm test` | Regression tests |
| `npm run import-api` | Import GitHub OpenAPI spec into local DB |

## File-Specific Instructions

More detailed conventions are in `.github/instructions/`:
- `coding-conventions.instructions.md` — applies to all `*.{ts,tsx}`
- `component-patterns.instructions.md` — applies to components and pages
- `api-routes.instructions.md` — applies to API route handlers
- `accessibility-ux.instructions.md` — applies to all TSX files
