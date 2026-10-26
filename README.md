# GitHub API Explorer

Explore, test, and compare GitHub REST and GraphQL APIs — all from your browser.

**1,100+ endpoints** auto-imported from GitHub's official OpenAPI spec. Built for developers and admins working with GitHub Enterprise EMU or any GitHub instance.

## Features

- **API Explorer** — browse and search 1,100+ REST endpoints, send requests, view responses
- **GraphQL Editor** — query editor with examples, variables, and resizable panels
- **Request History** — full log with expandable details, replay, and add-to-collection
- **Collections** — organize requests into reusable groups and run them in batch
- **API Version Compare** — diff endpoints across GitHub cloud and GHES versions
- **Templates** — pre-built request templates for common workflows
- **Webhook Reference** — browse event types, actions, and payload fields
- **Multi-Environment** — switch between instances with separate credentials
- **Dark/Light Theme** — GitHub Primer design language

## Quick Start

```bash
git clone https://github.com/thomasiverson/github-api-explorer.git
cd github-api-explorer
npm install
npm run import-api
npm run dev
```

Open **http://localhost:43117**, go to **Settings**, add an environment with your PAT, and start exploring.

## Tech Stack

Next.js 16 · TypeScript · Tailwind CSS · Octokit · better-sqlite3 · OpenAPI 3.0

## Documentation

See [docs/GUIDE.md](docs/GUIDE.md) for detailed setup, usage, configuration, and architecture.

## Security

Credentials encrypted at rest (AES-256). All API calls proxied through the backend with SSRF protection. Tokens never reach the browser.

## Testing