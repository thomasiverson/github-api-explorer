# Feature Request: Batch Organization Creator via CSV

## Goal

Add a new feature to the GitHub API Explorer that lets a user upload or paste a CSV file containing organization definitions, then executes the `createEnterpriseOrganization` GraphQL mutation in a loop for each row — displaying real-time results in the UI.

## Context

The GitHub REST API does not support creating organizations in a GitHub Enterprise. However, the **GraphQL API** has a `createEnterpriseOrganization` mutation that works. This feature automates calling that mutation for a batch of orgs defined in a CSV.

## The GraphQL Mutation

This is the exact mutation to execute for each row in the CSV:

```graphql
mutation($enterpriseId: ID!, $login: String!, $profileName: String!, $billingEmail: String!, $adminLogins: [String!]!) {
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
}
```

### Variables per row

| Variable | Type | Source |
|---|---|---|
| `enterpriseId` | `ID!` | Looked up once from the enterprise slug (see lookup query below) |
| `login` | `String!` | CSV column: `name` — the org slug/URL name |
| `profileName` | `String!` | CSV column: `display_name` — human-readable name |
| `billingEmail` | `String!` | CSV column: `billing_email` |
| `adminLogins` | `[String!]!` | CSV column: `admin_logins` — semicolon-separated usernames, split into an array |

### Enterprise ID Lookup Query

Before running the loop, look up the enterprise node ID from its slug. This only needs to run once:

```graphql
query($slug: String!) {
  enterprise(slug: $slug) {
    id
    name
  }
}
```

The slug is the last segment of the enterprise URL. For example, `https://github.com/enterprises/tpitest` → slug is `tpitest`.

## CSV Format

The CSV file has a header row and uses these exact column names:

```csv
name,display_name,billing_email,admin_logins
my-new-org,My New Org,billing@example.com,admin1;admin2
another-org,Another Org,billing@example.com,admin1
simple-org,Simple Org,billing@example.com,admin1;admin2;admin3
```

- `name` — the org login/slug (alphanumeric + hyphens, max 39 chars)
- `display_name` — the org's display/profile name
- `billing_email` — email address for billing
- `admin_logins` — one or more GitHub usernames separated by semicolons (`;`)

## UI Requirements

### New Page or Tab

Add a new tab/page called **"Batch Create Orgs"** (or similar) accessible from the top navigation alongside API Explorer, History, Collections, etc.

### Input Section

1. **Enterprise slug** — a text input field, defaulting to `tpitest` (or read from current connection/settings if available)
2. **CSV input** — either:
   - A file upload button that accepts `.csv` files, OR
   - A textarea where the user can paste CSV content
   - Ideally both — upload populates the textarea so the user can review/edit before running
3. **Preview table** — after CSV is loaded, display a table showing the parsed rows so the user can verify before executing:
   - Columns: Name, Display Name, Billing Email, Admin Logins
   - Highlight any validation errors (empty required fields, invalid characters in name, etc.)
4. **Run button** — labeled "Create Organizations" or similar. Disabled until CSV is loaded and validated.
5. **Dry Run checkbox** — when checked, only validates and previews without executing mutations.

### Execution Behavior

When the user clicks the run button:

1. **Look up enterprise ID** — call the enterprise slug query once. If it fails, show an error and stop.
2. **Loop through each CSV row** and for each:
   - Call the `createEnterpriseOrganization` mutation with that row's data
   - Update the results table in real-time (don't wait for all to finish)
   - Add a 500ms delay between requests to avoid rate limiting
3. **Handle errors per-row** — if a mutation fails (e.g., org name already taken), log the error for that row and continue to the next one. Do NOT stop the entire batch.

### Results Table

Display a results table that updates in real-time as each org is processed:

| Org Name | Display Name | Status | Org URL / Error | Timestamp |
|---|---|---|---|---|
| my-new-org | My New Org | ✅ Created | https://github.com/my-new-org | 2026-04-15T10:30:00Z |
| another-org | Another Org | ❌ Failed | Name is already taken | 2026-04-15T10:30:01Z |
| simple-org | Simple Org | ⏳ Pending | — | — |

- Use color coding: green for created, red for failed, gray/spinner for pending
- Show a summary line at the bottom: "3 created, 1 failed, 2 pending"

### Export Results

After execution completes, provide a button to **download the results as CSV** with columns: `name`, `status`, `org_id`, `org_url`, `error`, `timestamp`.

## Authentication

Use the same authentication mechanism the explorer already uses (the connection shown in the top-right as "TPI Test EMU (tpitest) • Connected"). The GraphQL calls should use the same token/auth headers that the existing "Run Query" button uses.

## Validation Rules

Before executing, validate each row:

- `name` is required, contains only alphanumeric characters and hyphens, max 39 characters, does not start or end with a hyphen
- `display_name` is required, non-empty
- `billing_email` is required, contains an `@` character
- `admin_logins` is required, at least one username after splitting on `;`

Show validation errors inline in the preview table. Do not allow execution if any row has validation errors.

## Summary

The flow is:

1. User navigates to "Batch Create Orgs" tab
2. User enters enterprise slug and uploads/pastes a CSV
3. App parses and displays a preview table with validation
4. User clicks "Create Organizations"
5. App looks up enterprise ID, then loops through rows calling the GraphQL mutation
6. Results table updates in real-time with status per org
7. User can download results as CSV when done
