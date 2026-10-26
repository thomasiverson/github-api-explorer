# Assessment remediation

The enterprise assessment separates finding detection from remediation. Assessment runs store
observed evidence and stable rule keys. Remediation behavior lives in a typed code registry so a
future GitHub API change can be reviewed once without rewriting historical assessment records.

## Safety model

Remediation follows this lifecycle:

1. **Inspect** the current GitHub setting with a read request.
2. **Prepare** a registry-defined proposed request.
3. **Review** the target, parameters, body, impact, and rollback value.
4. **Apply** only through a separate, explicit API Explorer action.
5. **Verify** with a read request and a new assessment.

The assessment page does not execute write requests. A prepared-change preview opens the request
in API Explorer, where the existing confirmation flow remains in effect. A successful HTTP response
does not prove a finding is resolved; verification must read the resulting setting and the assessment
must evaluate it again.

The browser receives only a rule key, a registered API target, and resolved path values. Request
bodies come from the registry, not from URL input. The handoff parser rejects method and path
combinations that are not registered for that rule.

## Remediation modes

Every assessment rule declares one mode in
[`src/lib/assessment-remediation.ts`](../src/lib/assessment-remediation.ts):

- `executable`: a deterministic, reversible recipe exists. This mode can expose inspection and a
  prepared request. The current implementation is preview-only.
- `api-explorer`: a relevant API exists, but the target or desired value requires human judgment.
  The assessment can prefill the endpoint and unambiguous path values.
- `advisory`: GitHub does not expose a safe, deterministic API change. The settings workflow remains
  the source of remediation guidance.

Registry entries also declare risk, supported GitHub products, API version, last review date,
rationale, and structured API targets.

## Finding and registry contract

Finding instances include a stable `ruleKey`. The complete runtime key list is exported as
`ASSESSMENT_FINDING_RULE_KEYS` from
[`src/lib/assessment.ts`](../src/lib/assessment.ts).

`ASSESSMENT_REMEDIATION_REGISTRY` is compile-time exhaustive over those keys. Tests also compare the
runtime key list with the registry so an added or removed rule cannot silently lose its remediation
classification.

When adding or changing an assessment rule:

1. Add or update its evidence definition and advisory playbook in
   [`src/lib/assessment.ts`](../src/lib/assessment.ts).
2. Add or update the matching registry entry in
   [`src/lib/assessment-remediation.ts`](../src/lib/assessment-remediation.ts).
3. Choose the least-permissive valid mode.
4. Record exact product compatibility and a current review date.
5. Confirm each endpoint exists in the imported GitHub API catalog or document why it is omitted.
6. Add tests for target resolution, compatibility, and any recipe-specific behavior.
7. Run the assessment against a non-production enterprise before enabling a write path.

Do not store copied playbook or recipe definitions in assessment database rows. Historical findings
should retain evidence, affected targets, and their stable rule key. Future execution records should
store prepared request identifiers, before and after values, verification results, timestamps, and
the acting environment.

## API Explorer handoff

`createRemediationHandoffUrl` generates a URL with a JSON-encoded `remediation` query parameter.
The home page validates it with `parseRemediationHandoff`, reconstructs a request selection, and
removes the parameter from browser history.

The handoff:

- never sends a request automatically;
- never accepts a request body supplied by the URL;
- rejects unregistered rule, method, and path combinations;
- preloads only path values that can be inferred safely;
- marks the request as assessment-prepared;
- disables batch execution unless the recipe explicitly allows it.

Repository resources are inferred only from exact `owner/repository` values. Compound identifiers
such as collaborators, teams, rulesets, and cost centers remain unresolved so the user must select
them in API Explorer.

## Preview pilot

The initial executable recipe covers these organization base-permission findings:

- `organization-default-repository-admin`
- `organization-default-repository-write`

The sequence is:

1. Inspect `GET /orgs/{org}`.
2. Read `default_repository_permission`.
3. Propose `PATCH /orgs/{org}` with
   `{ "default_repository_permission": "read" }`.
4. Show rollback as restoring the inspected value.
5. Prepare the PATCH request only after inspection succeeds.
6. Verify later with `GET /orgs/{org}` and a new assessment.

The recipe sets `execution: "preview-only"` and `batchAllowed: false`. Do not change either value
until a server-side prepared-change store, verification workflow, and audit trail are implemented.

## Product compatibility

Registry compatibility is explicit:

- `ghec` represents GitHub Enterprise Cloud at `api.github.com`.
- `ghes` represents GitHub Enterprise Server base URLs.

Enterprise billing, some Copilot, and enterprise code-security endpoints are cloud-only. Standard
organization and repository endpoints may support both products. Compatibility metadata prevents the
assessment from presenting an unsupported action as callable, but it does not replace version-aware
GHES validation.

Before enabling an endpoint for GHES, test it against the oldest supported GHES release and record
that support policy in the registry or a future version constraint.

## API drift review

GitHub may add an endpoint to documentation before adding it to an OpenAPI document, omit an
endpoint from one product specification, rename an operation, change parameters, or alter a response
shape.

For every API catalog refresh:

1. Run the existing import sentinel checks.
2. Compare all remediation targets by method and path against the merged catalog.
3. Review request schemas for required-field or enum changes.
4. Review response fields used by `currentValuePath` and `verificationValuePath`.
5. Reconfirm GHEC and GHES compatibility.
6. Update `lastReviewedOn` only after completing the review.
7. Keep a recipe advisory or preview-only when the API contract is ambiguous.

If a target disappears or becomes incompatible, downgrade the rule to `api-explorer` or `advisory`.
Never substitute a similarly named endpoint without validating scope, permissions, request schema,
and rollback behavior.

## Future write execution

Actual inline execution requires a server-side allowlist:

1. The server creates a short-lived prepared-change ID from a registry recipe and inspected value.
2. The browser reviews the immutable target, request body, and rollback plan.
3. The server rejects changed, expired, or already-used prepared changes.
4. An explicit confirmation applies exactly the stored request.
5. The server runs the registered verification read.
6. The audit record stores before, proposed, after, verification, actor, environment, and timestamps.

Batch remediation should remain disabled until single-target execution is proven. A future batch flow
must inspect and prepare each target independently, cap concurrency, support partial failure, and
never infer success from a write response alone.

## Validation

The remediation tests in
[`tests/assessment-remediation.test.ts`](../tests/assessment-remediation.test.ts) cover:

- exhaustive 42-rule classification;
- mode and target requirements;
- preview-only pilot semantics;
- handoff round trips and tamper rejection;
- conservative path-value inference;
- unresolved parameter reporting;
- product compatibility;
- inspected-value extraction and formatting.

Before merging remediation changes, run:

```powershell
npx tsx --test tests/assessment-remediation.test.ts
npm test
npm run lint
npm run build
```

Also verify in the browser that inspection performs only a GET, the prepared request does not execute
on navigation, write confirmation remains active, batch is unavailable, mobile layouts do not
overflow, and the browser console is clean.
