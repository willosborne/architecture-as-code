# `calm workspace` — first-class environments and promotion

**Status:** proposal
**Date:** 2026-08-14
**Package:** `cli` (`@finos/calm-cli`)

Environments become a concept the whole `workspace` command group understands, rather than a flag on
one new command. `migrate` is the command that moves documents between them; the rest of the suite
gains awareness of which environment it is operating in, so the environment is stated once and then
respected everywhere.

## Problem

A CALM document's identity is its `$id`:

```
$BASE_URL/calm/namespaces/$NAMESPACE/$TYPE/$MAPPING_ID/versions/$VERSION   # namespace resources
$BASE_URL/calm/domains/$DOMAIN/controls/$CONTROL/requirement/versions/$VERSION          # control requirements
$BASE_URL/calm/domains/$DOMAIN/controls/$CONTROL/configurations/$CONFIG/versions/$VERSION # control configurations
```

The base URL is the CalmHub instance, so every document is tied to one instance. Teams want to run
several instances as environments — experiment in dev, validate in qa, promote to prod — but there is
no supported way to move a coherent set of documents from one instance to another.

The gap is not merely missing tooling; today's behaviour is actively unsafe. `CalmHubClient` posts to
its own configured base URL, and `validateDocumentId` deliberately skips `baseUrl` when comparing
expected against actual metadata. So `calm workspace push --calm-hub-url https://prod-hub` already
succeeds against a dev workspace, and the documents land in prod still carrying `$id`s and `$ref`s
that point at the dev hub. Nothing warns.

Promotion also has to preserve *set* coherence. A workspace's documents reference each other by
versioned `$id`. Moving them one at a time leaves references dangling or pointing across
environments. Promotion must be a single operation over the whole tracked set.

## Goals

- Make the environment a declared property of a bundle, stated once, that every workspace command
  reads — for hub resolution, for `$id` construction, and for what it prints.
- Promote every document tracked in a workspace bundle from one environment to another in one command.
- Rewrite `$id` and every inter-document `$ref` to the target environment, so the promoted set is
  internally consistent and contains no references back to the source environment.
- Resolve each document's target version against the target hub, skipping documents whose content is
  already published there.
- Leave a reviewable, committable artifact of exactly what was promoted, before anything is published.
- Make it impossible to push a bundle to the wrong hub, and hard to author a document into the wrong
  environment in the first place.
- Change nothing for workspaces that do not declare environments.

## Non-goals

- Publishing. `migrate` writes to disk only; `workspace push` publishes.
- Deleting or deprecating documents in the target hub.
- Rollback.
- Cross-environment diffing. A future `workspace diff dev prod` is a natural follow-up, not part of this.

## Design decisions

| Decision | Choice |
|---|---|
| What identifies an environment | A label mapping to `{ url, namespace?, domain? }` — separate instances, per-env namespaces, or both |
| Effect on disk | A generated bundle per environment, alongside the authored source bundle |
| Version semantics | Re-derived per document against the target hub |
| Publish step | Materialise only; `workspace push` publishes separately |
| Increment selection | Mirrors `workspace bump` — skip unchanged, prompt per changed doc, flags for CI |
| Control documents | Optional `domain` override, symmetric with `namespace` |
| Target drift | Provenance recorded in the target manifest; warn by default, `--fail-on-drift` for CI |
| Scope | Environments are suite-wide: every workspace command that touches a hub or builds an `$id` is environment-aware |
| Backwards compatibility | A bundle with no environment set behaves exactly as today |

## Configuration

Environments are declared once, centrally, in the existing `.calm-workspace/config.json`. That file
already holds `push.failIfModified` and `bump.defaultIncrement`, and `loadWorkspaceConfig` already
falls back to defaults for a missing file, invalid JSON, or any individual invalid field.

```json
{
  "push": { "failIfModified": false },
  "bump": { "defaultIncrement": "MINOR" },
  "environments": {
    "dev":  { "url": "https://calm-dev.corp" },
    "qa":   { "url": "https://calm-qa.corp",  "namespace": "trading-qa" },
    "prod": { "url": "https://calm.corp", "namespace": "trading-prod", "domain": "security-prod" }
  }
}
```

`url` is required. `namespace` and `domain` are optional; omitting one means "keep whatever the source
document has". `namespace` applies to namespace resources, `domain` to control requirements and
configurations. The two are independent.

Unlike the existing config fields, a malformed `environments` block must not fall back silently —
promoting to the wrong hub is worse than failing. `loadWorkspaceConfig` keeps its current forgiving
behaviour and returns the `environments` block as-is without throwing, so `push` and `bump` on bundles
with no environment are unaffected by a broken block they never read. Validation is a separate
exported function in `environment.ts`, called by `migrate` and by hub resolution — the two places where
a bad value has consequences — and it raises rather than defaulting.

## A bundle's environment

A bundle declares its environment once, in a new `bundle.json` alongside the manifest. Everything
else in this design reads that one fact.

```
.calm-workspace/
  config.json
  workspace.json                    # active workspace name (unchanged)
  bundles/
    trading/
      bundle.json                   # { "environment": "dev" }
      workspace-manifest.json
    trading-prod/
      bundle.json                   # { "environment": "prod", "promotedFrom": "trading" }
      workspace-manifest.json
      files/…                       # always copies — promoted docs are rewritten
```

A bundle with no `bundle.json` **has no environment**. Every bundle that exists today is in that
state, and those bundles behave exactly as they do now — this is the compatibility guarantee that lets
environments be suite-wide without being mandatory.

The environment is set by `workspace init <name> --environment <label>` for new bundles and
`workspace environment set <label>` for existing ones, both validated against `config.json`. That
second command matters more than it looks: without it, every bundle in existence could only adopt an
environment by hand-editing JSON.

`workspace clean` keeps `bundle.json`. Clearing the documents out of a bundle does not change which
environment it belongs to.

## Environments across the command suite

Three capabilities flow from a bundle knowing its environment. Each is a shared module, not
per-command logic.

**Hub resolution** — which hub a command talks to:

1. Explicit `--calm-hub-url`.
2. The active bundle's environment URL, if it has one.
3. `~/.calm.json` / `CALM_HUB_URL`.

Today all three hub-touching commands call `resolveCalmHubOptions({ calmHubUrl })` directly; that call
site becomes the seam. If the bundle has an environment **and** `--calm-hub-url` disagrees with it, the
command errors rather than proceeding. A bundle with no environment never reaches rule 2, so existing
behaviour is untouched.

**`$id` defaulting** — `add` and `new` currently take their base URL from `loadCliConfig().calmHubUrl`
and prompt for a namespace. When the bundle has an environment, the base URL and the namespace/domain
default come from it instead, still overridable at the prompt. This is what stops a document being
*authored* into the wrong environment, which no amount of push-time checking can undo cleanly.

**Consistency validation** — does every tracked document's `$id` actually belong to the bundle's
environment? A warning on `push` and a failure on `check`. It is the only protection that works when
several environments share one hub URL and differ by namespace, where the `--calm-hub-url` conflict
check is vacuous.

| Command | Environment-aware behaviour |
|---|---|
| `init` | `--environment <label>` records the bundle's environment |
| `environment` | **New subgroup.** `environment set <label>` / `environment unset` for an existing bundle; `environment list` shows what's configured and which bundles use each; `environment show [label]` resolves one |
| `add` | Base URL and namespace/domain default from the environment; warns if the document's `$id` belongs elsewhere |
| `new` | Same defaulting, so new documents are born in the right environment |
| `push` | Resolves the hub from the environment; prints the target; warns on inconsistent `$id`s; `--expect-environment <label>` for CI to assert what it is publishing |
| `check` | Resolves the hub from the environment; fails on inconsistent `$id`s; accepts `--environment <label>` to dry-check against another one |
| `bump` | Resolves the hub from the environment; prints the target |
| `migrate` | **New.** Promotes the bundle to another environment |
| `list` | Annotates each bundle with its environment |
| `show` | Reports the environment, its URL, and any namespace/domain override |
| `switch` | Announces the environment being switched into |
| `tree`, `rm` | Unchanged |
| `clean` | Unchanged, except that it keeps `bundle.json` |

`--environment` is accepted on `check` and `migrate` and deliberately **not** on `push` or `bump`.
`check` is read-only, so pointing it at another environment is a question, not an action. `push`
publishes and `bump` rewrites on-disk versions from hub state; for those, the bundle's own environment
is the single source of truth, and an ad-hoc override would reintroduce exactly the hazard this design
removes.

Every hub-touching command prints its target before acting — `Pushing bundle 'trading' (dev →
https://calm-dev.corp)`. Cheap, and it makes a wrong environment visible at the moment it matters.

## Command surface

```
calm workspace init <name> [--environment <label>] [--dir <path>]

calm workspace environment                 The active bundle's environment, and where it points
calm workspace environment list            Configured environments, and which bundles use each
calm workspace environment show [label]    One environment's url, namespace and domain
calm workspace environment set <label>     Set the active bundle's environment
calm workspace environment unset           Remove it, returning the bundle to today's behaviour
```

```
calm workspace migrate <environment> [options]

  <environment>             Target environment label from .calm-workspace/config.json
  --as <bundle-name>        Target bundle name (default: derived, see below)
  --major | --minor | --patch   Fixed increment for every changed document; skips prompts
  --inherit-change-type     Cascade-bumped documents inherit their trigger's increment silently
  --fail-on-drift           Error instead of warning when the target hub has drifted
  --dry-run                 Resolve and print the plan; write nothing
```

Default target bundle name: the source bundle name with a trailing `-<sourceEnv>` stripped if present,
then `-<targetEnv>` appended. `trading` (dev) → `trading-prod`; `trading-qa` (qa) → `trading-prod`.

Re-running `migrate prod` updates the existing target bundle in place.

## Algorithm

`migrate` runs in two phases: **resolve** (read-only, all hub traffic) then **write**. Nothing is
written until every document has resolved successfully, so a hub failure or an unparseable document
leaves the working tree untouched rather than half-promoted.

### Preconditions

- The target `<environment>` exists in `config.json` and has a `url`.
- The active bundle has an environment. A source bundle without one errors, naming the remedy
  (`calm workspace environment set <label>`), because provenance needs the source environment label.
- Source environment ≠ target environment.

### Resolve phase

Build the source bundle's dependency graph (`buildDependencyGraph`) and process documents in
topological order, dependencies first. A document's target version depends on its content, its
content includes its references, and its references point at its dependencies' target versions — so
dependencies must resolve first.

For each document:

1. **Classify the `$id`.** Namespace resource, control document, or non-conformant.

   Non-conformant `$id`s (flows, ADRs, timelines, anything not addressable in CalmHub) are copied
   verbatim into the target bundle with a warning. No `$id` change, no version resolution. They are
   tracked but not pushable, and `push` already skips them.

2. **Compute the target `$id` skeleton.** Replace the base URL with the environment's `url`. Replace
   the namespace with `env.namespace` if set, or the domain with `env.domain` if set. Everything else
   — resource type, mapping id, control name, config name — is preserved. Version is still unresolved.

3. **Rewrite references.** Apply the source→target id map accumulated so far to the values of
   `$ref`, `$schema`, `requirement-url` and `config-url`, reusing the existing `replaceRefsInObject`
   walker. Rules are keyed on the source document's full `$id` and its version-stripped base path, so
   both exact-version and unversioned references are caught.

   References to documents not tracked in this workspace — CALM meta-schemas, external URLs — are left
   untouched.

4. **Query the target hub** for existing versions of this resource.

   - **No versions exist** (new in the target environment): target version = source version. Keeping
     the number rather than resetting to `1.0.0` preserves traceability when nothing forces otherwise.
   - **Versions exist**: fetch the latest and continue to step 5.

5. **Drift check.** If the target bundle's manifest already records `promotedAs: X` for this document
   and the target hub's latest is not `X`, the target has drifted — something was published there that
   `migrate` did not publish. Warn by default; `--fail-on-drift` makes it an error. Either way the new
   version is computed on top of the hub's actual latest, never on top of the recorded one.

   Drift is checked *before* the unchanged check below, because the unchanged check returns early. A
   target that drifted to content identical to ours is still a target that someone else published to,
   and the user should hear about it.

6. **Unchanged check.** Take the candidate document, set its `$id` to the target hub latest's `$id`,
   and compare with `canonicalEqual`. Equal means the target environment already has this exact
   content: reuse that version, no bump, report as unchanged. This is what makes re-running `migrate`
   idempotent.

7. **Resolve the increment.** With `--major`/`--minor`/`--patch`, apply it. Otherwise prompt per
   document, exactly as `bump` does, defaulting to `config.bump.defaultIncrement`.

   Distinguishing a directly-changed document from a cascade requires two comparisons against the
   target hub latest: once with references pinned at the dependencies' *pre-existing* target versions,
   and once with references at their *newly resolved* versions. Differing in the first case means the
   document changed on its own merits. Differing only in the second means it changed because a
   dependency moved — the prompt is labelled with the trigger and defaults to the maximum increment
   applied to its triggers, and `--inherit-change-type` suppresses the prompt entirely. This mirrors
   `bumpWorkspace`'s cascade behaviour and is the fiddliest part of the implementation.

   Target version = `computeSemVerBump(targetHubLatest, increment)`.

8. **Record** source `$id` → target `$id` in the id map for subsequent documents.

If the dependency graph contains a cycle, warn and fall back to manifest order. The final reference
pass (below) still produces correct references, only the cascade labelling degrades.

### Write phase

1. Write `bundle.json` with `{ "environment": "<target>", "promotedFrom": "<source bundle>" }`.
2. Write every resolved document into `files/` as a copy. Promoted bundles never hold by-reference
   entries, because their content differs from the source files.
3. Run one final reference pass over the materialised bundle using the *complete* source→target id
   map. For a DAG this is a no-op, but it is cheap and idempotent and covers cycles or ordering
   surprises. It must use source→target rules, not `buildRefRulesFromDiskIds`, which derives rules
   from the target bundle's own `$id`s and would be a no-op here.
4. Write `workspace-manifest.json`. Each entry keeps `path`, `type` and `namespace`, and gains
   provenance:

   ```json
   {
     "gateway": {
       "path": "files/gateway.json",
       "type": "architecture",
       "namespace": "trading-prod",
       "promotedFrom": { "bundle": "trading", "env": "dev", "version": "1.3.0" },
       "promotedAs": "4.1.0"
     }
   }
   ```

   `loadManifest` already tolerates and preserves unknown-shaped entries via its
   `path`-plus-object check, so the added fields need no migration.

5. Documents present in the target manifest but no longer tracked in the source are removed from the
   target bundle, with a warning. The target bundle is a projection of the source. Versions already
   published to the target hub are untouched — CalmHub has no promotion-driven delete.

6. Print a summary and an explicit reminder that nothing was published.

`--dry-run` runs the resolve phase and prints the plan, writing nothing.

### Worked example

```
$ calm workspace migrate prod
Promoting bundle 'trading' (dev) -> 'trading-prod' (prod, https://calm.corp)

  schema     unchanged in prod, reusing 5.2.0
  gateway    prod latest 4.0.0
  ? Bump type for 'gateway' (currently 4.0.0): minor (default)
  trading    prod latest 2.1.0
  ? Bump type for 'trading' (depends on gateway): minor (inherited)
  onboarding not in prod, taking source version 1.0.0
  warn: 'adr-0007' has a non-CalmHub $id — copied verbatim, not versioned

Wrote .calm-workspace/bundles/trading-prod/ (5 documents)
Nothing published. Review the bundle, then:
  calm workspace switch trading-prod && calm workspace push
```

## End-to-end walkthroughs

Two topologies, both covered by the same commands. The only thing that differs is `config.json`.

### Setup 1 — a CalmHub per environment, prod writable only by CI

An architect iterates on a pattern locally against the dev hub, then promotes to prod. They have write
access to dev but not prod; releasing to prod is CI's job.

**One-time, committed to the repo:**

```jsonc
// .calm-workspace/config.json
{
  "push": { "failIfModified": false },
  "bump": { "defaultIncrement": "MINOR" },
  "environments": {
    "dev":  { "url": "https://calm-dev.corp" },
    "prod": { "url": "https://calm.corp" }
  }
}
```

```bash
calm workspace environment list                  # confirm what's configured
calm workspace init trading --environment dev    # bundles/trading/bundle.json = { "environment": "dev" }
calm workspace add ./patterns/trading.pattern.json
calm workspace add ./patterns/gateway.pattern.json
```

`add` no longer asks for a base URL — the bundle's environment is `dev`, so the `$id` is built against
`https://calm-dev.corp`. An existing bundle would run `calm workspace environment set dev` instead of
re-running `init`.

**The inner loop — repeated as many times as it takes.** No `--calm-hub-url` anywhere: the bundle's
environment is `dev`, so every command resolves to the dev hub on its own.

```bash
$EDITOR patterns/trading.pattern.json

calm workspace check      # what changed against dev?
calm workspace bump       # re-derive versions against dev, rewrite $ids and $refs
calm workspace push       # publish to https://calm-dev.corp
```

If they fat-finger `calm workspace push --calm-hub-url https://calm.corp`, it now errors — the bundle
says `dev` and the flag says otherwise. Today that command silently publishes dev-pointing documents
into prod.

**Promotion, once they are happy:**

```bash
calm workspace migrate prod --dry-run     # read prod, print the plan, write nothing
calm workspace migrate prod               # prompts per changed document
```

```
Promoting bundle 'trading' (dev) -> 'trading-prod' (prod, https://calm.corp)

  gateway   prod latest 4.0.0
  ? Bump type for 'gateway' (currently 4.0.0): minor
  trading   prod latest 2.1.0
  ? Bump type for 'trading' (depends on gateway): minor (inherited)

Wrote .calm-workspace/bundles/trading-prod/ (2 documents)
Nothing published.
```

The result is a plain directory of files. Review and ship it as a normal change:

```bash
git diff .calm-workspace/bundles/trading-prod/
git add .calm-workspace/bundles/trading-prod/
git commit -m "feat(trading): promote gateway 4.1.0, trading 2.2.0 to prod"
git push && gh pr create
```

**CI, on merge**, holding the prod credentials the architect does not have:

```bash
calm workspace switch trading-prod              # "Switched to workspace 'trading-prod' (prod)"
calm workspace push --expect-environment prod   # resolves to https://calm.corp via bundle.json
```

CI passes no `--calm-hub-url` either — the bundle it just checked out states which hub it belongs to,
so the wrong-hub mistake is not available to the pipeline either. `--expect-environment prod` makes the
pipeline assert its own assumption: if someone renames a bundle or changes its environment, the release
job fails before it publishes rather than after.

**One access-model consequence worth stating plainly.** `migrate` reads the target hub (it must, to
resolve versions), so the architect needs *read* on prod even though they have no *write*. If prod is
read-restricted too, `migrate prod` moves into CI and the architect's promotion step becomes "open a
PR that asks for it" — the same commands, run by the pipeline instead.

### Setup 2 — one CalmHub, environments separated by namespace

Same repo, same commands, single instance. Only `config.json` changes:

```jsonc
"environments": {
  "dev":  { "url": "https://calm.corp", "namespace": "trading-dev"  },
  "prod": { "url": "https://calm.corp", "namespace": "trading-prod" }
}
```

The inner loop and the promotion commands are byte-for-byte identical to setup 1. What changes is what
`migrate` rewrites: the base URL stays put and the namespace segment moves, so
`…/calm/namespaces/trading-dev/pattern/gateway/versions/1.3.0` becomes
`…/calm/namespaces/trading-prod/pattern/gateway/versions/4.1.0`. Access control is enforced per
namespace rather than per instance. Control documents partition the same way via `domain`.

This setup is why environments have to be suite-wide rather than a `migrate` flag. Both environments
share a URL, so the `--calm-hub-url` conflict check catches nothing at all here; the only things keeping
a dev document out of the prod namespace are the environment-derived `$id` defaults in `add`/`new` and
the consistency check in `push`/`check`. A `migrate`-only design would leave this case unguarded.

A hybrid — dev on its own instance, qa and prod as namespaces on a shared one — needs no extra
machinery; it is just a third entry in the same map.

## Error handling

| Condition | Behaviour |
|---|---|
| No `environments` block in `config.json` | Error explaining that environments must be declared before `migrate` or `--environment` can be used, with the config snippet |
| Unknown environment label | Error, listing the labels defined in `config.json` |
| Environment missing `url`, or `environments` malformed | Error naming the offending entry |
| Source bundle has no environment | Error naming the remedy (`calm workspace environment set <label>`) |
| Source environment == target environment | Error |
| Target hub unreachable or errors | Abort during resolve; nothing written |
| Tracked document missing or unparseable | Abort during resolve; nothing written |
| Non-conformant `$id` | Warn, copy verbatim, do not version |
| Dependency cycle | Warn, fall back to manifest order |
| Target drift | Warn, or error with `--fail-on-drift` |
| Non-TTY with no increment flag | Error instructing the user to pass `--major`/`--minor`/`--patch` |
| Bundle with an environment pushed with a conflicting `--calm-hub-url` | Error |
| `environment set <label>` naming an undeclared environment | Error, listing the labels defined in `config.json` |
| Tracked `$id` inconsistent with the bundle's environment | Warn on `push`, fail on `check` |
| `push --expect-environment <label>` not matching the bundle's environment | Error before any hub traffic |
| `--environment` passed to `push` or `bump` | Rejected by the parser; the message points at `environment set` or `migrate` |

## Module layout

New files under `cli/src/command-helpers/workspace/`, each with a colocated `*.spec.ts`, following the
existing convention:

- **`environment.ts`** — environment config parsing and validation; `$id` rewriting for both the
  namespace-resource and control-document forms. Pure functions, no I/O.
- **`bundle-metadata.ts`** — load and save `bundle.json`; the no-environment fallback.
- **`hub-resolution.ts`** — three-tier hub resolution shared by `push`, `check`, `bump` and `migrate`,
  plus the conflict check. The single place that decides which hub a command talks to.
- **`environment-consistency.ts`** — does every tracked `$id` belong to the bundle's environment?
  Returns findings; callers decide whether they are warnings or failures.
- **`migrate.ts`** — the resolve and write phases. Takes a `CalmHubClient`, so tests inject a fake.

Changes to existing files:

- **`config.ts`** — add the `environments` field, returned as-is; validation lives in `environment.ts`.
- **`commands.ts`** — register `migrate` and the `environment` subgroup; add `--environment` to `init`;
  route `push`/`check`/`bump` through `hub-resolution.ts`; annotate `list`, `show` and `switch` output.
- **`document-id-prompt.ts`** — accept environment-derived base URL and namespace/domain defaults, so
  `add` and `new` author into the right environment.
- **`bundle.ts`** — extend `WorkspaceManifestEntry` with the optional provenance fields.

Each module has one job and a narrow interface: `environment.ts` knows about `$id` shapes and nothing
about bundles; `migrate.ts` orchestrates and owns no parsing logic; the two policy modules
(`hub-resolution.ts`, `environment-consistency.ts`) are what make the suite-wide behaviour a handful of
shared calls rather than logic scattered across a dozen command actions.

### Suggested delivery order

The suite-wide plumbing is independently valuable and is what the promotion command stands on, so it
should land first:

1. `environments` config, `bundle.json`, `init --environment`, and the `environment` subgroup.
2. `hub-resolution.ts` wired into `push`/`check`/`bump`, plus the conflict error and target printing.
   This alone fixes the wrong-hub push hazard, for people who never promote anything.
3. Environment-aware `$id` defaulting in `add`/`new`, and `environment-consistency.ts` in
   `push`/`check`.
4. `migrate`.

## Testing

Vitest, colocated `*.spec.ts`, run from the repository root with `npm test --workspace cli`.

**Unit**

- `environment.ts`: config validation, including malformed environments; `$id` rewriting across all
  three `$id` forms, with and without `namespace`/`domain` overrides; non-conformant ids left alone.
- `bundle-metadata.ts`: round-trip; a bundle with no `bundle.json` returns undefined rather than
  throwing; `clean` keeping the environment; `environment unset` removing it.
- `hub-resolution.ts`: all three tiers; the conflict error; bundles with no environment preserving
  today's behaviour.
- `environment-consistency.ts`: mismatched base URL, mismatched namespace, mismatched domain, and the
  same-URL-different-namespace case that motivates the check; non-conformant ids exempt.
- `add`/`new` defaulting: the bundle's environment supplies base URL and namespace; explicit flags
  still win; a bundle with no environment falls back to `~/.calm.json` exactly as today.
- `migrate.ts` against a fake `CalmHubClient`, covering the version-resolution matrix (no versions in
  target / unchanged / directly changed / cascade-changed), drift detection with and without
  `--fail-on-drift`, topological ordering, reference rewriting across environments, `--dry-run`
  writing nothing, removal of documents dropped from the source, and abort-before-write on hub failure.

**Smoke** — extend `cli/smoke/` with a promotion flow. The smoke harness runs a single hub, so the
flow promotes `smoke-migrate-dev` → `smoke-migrate-prod` using namespace overrides on one instance.
This is precisely the case the `{ url, namespace }` model was chosen to support.

Coverage on new code must exceed 80%, per the repository's pre-commit checklist.

## Documentation

- `cli/AGENTS.md` — add `migrate` and `environment` to the workspace subcommand list; document
  `environments` in `.calm-workspace/config.json`, `bundle.json`, the hub-resolution order, and what
  changes for a bundle once it has an environment.
- `cli/README.md` — user-facing command reference plus both walkthroughs from this document.

## Open questions

**The command name.** `migrate` usually connotes schema or data migration; this is promotion between
environments, and `calm workspace promote prod` describes it more accurately. Specified as `migrate`
as requested.

**Should a bundle with no environment stay silent?** As specified, it behaves exactly as it does
today, with no nudge. Once `environments` is declared in `config.json`, a bundle without one is more
likely an oversight than a choice — a one-line hint from `push` (`bundle 'trading' has no environment;
set one with calm workspace environment set <label>`) would catch that, at the cost of noise for anyone
deliberately going without.
