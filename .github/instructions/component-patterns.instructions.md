---
applyTo: "src/components/**/*.tsx,src/app/**/page.tsx"
---

# Component & Page Patterns

## Client Components
- Add `'use client'` to components and pages that use hooks, browser APIs, event handlers, or client context
- Keep server-only components as Server Components; `layout.tsx` is a Server Component that wraps children in `<AppProvider>`

## State Management
- Single global context in `AppContext.tsx` — provides `useApp()` hook
- `useApp()` exposes: `activeEnv`, `setActiveEnv`, `selectedEndpoint`, `selectEndpoint`, `response`, `setResponse`, `isLoading`, `theme`, `toggleTheme`, panel collapse toggles
- Use `useState` for local component state, `useRef` for DOM refs and mutable values
- Use `useCallback` for stable function references passed as props or used in effects

## Styling
- Use Tailwind utility classes with project design tokens — NOT arbitrary values
- Design tokens: `bg-canvas`, `bg-panel`, `bg-surface`, `text-text-primary`, `text-text-secondary`, `text-text-muted`, `border-border`, `bg-accent-emphasis`, `text-success`, `text-danger`, `text-warning`
- HTTP method badges: `method-get-bg`, `method-post-bg`, `method-put-bg`, `method-patch-bg`, `method-delete-bg`
- Status colors: `status-2xx`, `status-3xx`, `status-4xx`, `status-5xx`
- Dark theme is default (`data-theme="dark"`). Light mode overrides via `[data-theme="light"]` in globals.css
- No external UI component library — all components are hand-rolled (dialogs, comboboxes, resizable panels, dropdowns)

## Component Structure
- Components are self-contained: state, data fetching, event handlers, and JSX in one function body
- Constants (lookup maps, example data) defined at module level above the component
- Interfaces defined inline above the component, not exported unless shared
- Large components are acceptable — don't prematurely split into sub-components

## Common UI Patterns
- Buttons: `px-3 py-1.5 text-sm rounded-md` with `bg-accent-emphasis text-white` for primary, `border border-border text-text-secondary hover:bg-surface` for secondary
- Form inputs: `bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent`
- Section cards: `bg-panel border border-border rounded-lg p-4`
- Table headers: `text-xs font-semibold text-text-muted uppercase`
- Loading spinners: Inline SVG with `animate-spin` class
- Collapsible sections: Use native `<details>/<summary>` elements
