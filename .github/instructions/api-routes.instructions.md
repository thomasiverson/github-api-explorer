---
applyTo: "src/app/api/**/route.ts"
---

# API Route Patterns

## Request Handling
- Parse request bodies at the route boundary and validate their runtime shape before use; do not rely on TypeScript assertions for untrusted JSON
- Return HTTP 400 for malformed JSON, unsupported actions, missing required fields, and invalid parameter types
- Use action-based multiplexing only for existing resource routes that already follow that pattern
- Validate all inputs before authentication, database writes, or external requests

## Authentication
- Always server-side via `createOctokit(envId)` — never expose tokens to the browser
- All GitHub API requests must be proxied through API routes (`/api/execute` for REST, `/api/graphql` for GraphQL)
- Validate environment exists before making external calls
- SSRF protection: validate the target origin and configured API base path before proxying requests; hostname-only checks are insufficient

## Error Handling
- Preserve meaningful status classes: 400 for invalid input, 403 for blocked targets, 404 for missing resources, and the appropriate upstream/proxy status for GitHub failures
- Use HTTP 500 only for genuinely unexpected server failures
- Catch errors at boundaries where the route can add context or map them to an accurate response; do not add broad catches that hide failures or return success-shaped fallbacks
- Narrow caught values from `unknown`: `const message = err instanceof Error ? err.message : 'Unknown error'`
- Keep the HTTP status and any status field in the response payload consistent; never use status `0`
- Surface malformed response JSON explicitly instead of relabeling it as a generic network failure

## Response Format
- Always use `NextResponse.json()`
- Follow the established response contract for the route; CRUD routes may return data directly or `{ success: true }`
- The execute endpoint returns `{ status, statusText, headers, body, timing, rateLimit, nextPageUrl, nextPageRequest }`
- Execute endpoint proxy errors use the same response shape as successful proxy responses plus an `error` field
- Include timing data where applicable: `const startTime = performance.now()` ... `Math.round(performance.now() - startTime)`

## Database Access
- Import from `@/lib/db` — use the exported CRUD functions, not raw `getDb()` in routes
- Use database transactions for multi-step replacements or writes that must be atomic
- Generate UUIDs at the established ownership boundary before calling DB functions
