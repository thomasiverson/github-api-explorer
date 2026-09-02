---
applyTo: "**/*.{ts,tsx}"
---

# Coding Conventions

## Tech Stack (exact versions matter)
- Next.js 16 App Router — has breaking changes from training data. Check `node_modules/next/dist/docs/` before using unfamiliar APIs.
- React 19, TypeScript 5 (strict mode), Tailwind CSS 4 (config in CSS `@theme` blocks, no tailwind.config.js)
- better-sqlite3 for local DB, @octokit/rest + @octokit/auth-app for GitHub API

## File Naming
- Components: `PascalCase.tsx` (e.g., `TopBar.tsx`, `AppContext.tsx`)
- Lib modules: `kebab-case.ts` (e.g., `openapi-import.ts`, `types.ts`)
- Pages: `kebab-case/page.tsx` (Next.js convention)
- API routes: `kebab-case/route.ts`

## Exports
- Components use **named exports**: `export function TopBar()` — not `export default`
- Exception: `page.tsx` and `layout.tsx` use `export default function` (Next.js requirement)
- Custom hooks: `export function useApp()`

## TypeScript
- Interfaces defined **inline** in the component file that uses them, directly above the component
- Only export interfaces if needed by other files; shared types go in `src/lib/types.ts`
- Use `import type` for type-only imports: `import type { HttpMethod } from '@/lib/types'`
- Use `@/*` path alias for imports from `src/` (e.g., `@/lib/auth`, `@/components/TopBar`)
- Relative imports for sibling files in the same directory

## Imports
- Import only the React runtime values and hooks used by the file; the React 19 JSX transform does not require a default `React` import
- Next.js imports: `import { NextResponse } from 'next/server'`, `import { usePathname } from 'next/navigation'`

## Database
- All queries use prepared statements: `getDb().prepare('...').all()` / `.get()` / `.run()`
- DB columns are `snake_case`; TypeScript interfaces use `camelCase` — but components often consume `snake_case` directly from DB results
- IDs are UUIDs generated via `uuid` v4 in API routes before passing to DB functions
- Credentials encrypted at rest with AES-256-CBC
