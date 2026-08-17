# Workspace Environments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CALM Hub environment a declared property of a workspace bundle that every `calm workspace` command reads — for hub resolution, `$id` construction, and output — so a bundle can no longer be pushed to the wrong hub.

**Architecture:** Environments are declared centrally in `.calm-workspace/config.json` as labels mapping to `{ url, namespace?, domain? }`. Each bundle records its label in a new `.calm-workspace/bundles/<name>/bundle.json`. Three shared modules consume that: `hub-resolution.ts` (which hub a command talks to), environment-derived defaults in the `$id` prompt (where new documents are authored), and `environment-consistency.ts` (do the tracked `$id`s match the bundle's environment). A bundle with no `bundle.json` has no environment and behaves exactly as it does today.

**Tech Stack:** TypeScript 5.8+, Commander.js 14, Vitest, npm workspaces, Node 26.

**Spec:** `docs/superpowers/specs/2026-08-14-workspace-migrate-design.md`

**Scope note:** This plan implements the spec's delivery stages 1–3. Stage 4 (`calm workspace migrate`) is a separate plan, `docs/superpowers/plans/2026-08-17-workspace-migrate.md`, which depends on this one. This plan ships working, valuable software on its own: it closes the cross-environment push hazard for users who never promote anything.

## Global Constraints

- **Node 26 is required.** Run `node --version` before starting; it MUST show `v26.x.x`. If not, run `nvm use` (`.nvmrc` pins `26.3.1`). `.npmrc` sets `engine-strict=true`.
- **Run all npm commands from the repository root**, using workspaces: `npm test --workspace cli`. Never `cd cli && npm test`.
- **Single-file test runs** must be run from the `cli` directory or below so `vitest.config.mts` resolves: `cd cli && npx vitest run src/command-helpers/workspace/<file>.spec.ts`.
- **Never use bare `vitest`** — always `vitest run`. Bare `vitest` enters watch mode and hangs.
- **Never commit to `main`.** Create a feature branch first (Task 0).
- **Conventional Commits**, enforced by commitlint + husky. Type + scope, e.g. `feat(cli): add environment config parsing`. No period at the end of the subject.
- **Do NOT add `Co-Authored-By` trailers to commits.** They break the CLA check in CI.
- **Coverage on new code must exceed 80%.** Every new function needs tests for success and error cases.
- **Lint must pass with 0 errors:** `npm run lint --workspace cli`.
- **Modifying `shared/` requires running the full test suite** (`npm test` from root), because CLI, VSCode extension and others depend on it. This applies to Task 7 only.
- Existing behaviour for bundles with no `bundle.json` must not change. Several tasks assert this explicitly; do not weaken those assertions.

---

### Task 0: Feature branch

**Files:** none

- [ ] **Step 1: Verify Node version**

Run: `node --version`
Expected: `v26.x.x`. If not, run `nvm use` and re-check.

- [ ] **Step 2: Create the feature branch**

```bash
git checkout -b feat/workspace-environments
```

- [ ] **Step 3: Confirm a clean baseline**

Run: `npm test --workspace cli`
Expected: PASS. If the baseline is already failing, stop and report — do not start work on a broken tree.

---

### Task 1: Environment config types, validation and resolution

The `environments` block in `.calm-workspace/config.json`. `loadWorkspaceConfig` must stay forgiving (it never throws today, and commands that don't use environments must not start failing because of a malformed block they never read), so it returns the block **raw and unvalidated**. Validation lives in `environment.ts` and throws, because it is only called from places where a wrong value has consequences.

**Files:**
- Create: `cli/src/command-helpers/workspace/environment.ts`
- Create: `cli/src/command-helpers/workspace/environment.spec.ts`
- Modify: `cli/src/command-helpers/workspace/config.ts:11-29` (interface + load return)
- Modify: `cli/src/command-helpers/workspace/config.spec.ts` (add cases)

**Interfaces:**
- Consumes: `WorkspaceConfig` and `loadWorkspaceConfig` from `./config`.
- Produces:
  - `interface WorkspaceEnvironment { url: string; namespace?: string; domain?: string }`
  - `type EnvironmentMap = Record<string, WorkspaceEnvironment>`
  - `function validateEnvironments(raw: unknown): EnvironmentMap` — throws on anything malformed or absent
  - `function resolveEnvironment(environments: EnvironmentMap, label: string): WorkspaceEnvironment` — throws listing known labels
  - `function describeEnvironment(label: string, env: WorkspaceEnvironment): string`
  - `function normaliseUrl(url: string): string`
  - `WorkspaceConfig.environments?: unknown`

- [ ] **Step 1: Write the failing tests**

Create `cli/src/command-helpers/workspace/environment.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateEnvironments, resolveEnvironment, describeEnvironment, normaliseUrl } from './environment';

describe('validateEnvironments', () => {
    it('accepts a well-formed block and strips trailing slashes from urls', () => {
        const result = validateEnvironments({
            dev: { url: 'https://calm-dev.corp/' },
            prod: { url: 'https://calm.corp', namespace: 'trading-prod', domain: 'security-prod' },
        });
        expect(result).toEqual({
            dev: { url: 'https://calm-dev.corp' },
            prod: { url: 'https://calm.corp', namespace: 'trading-prod', domain: 'security-prod' },
        });
    });

    it('throws when no environments are declared', () => {
        expect(() => validateEnvironments(undefined)).toThrow(/No environments are defined/);
    });

    it('throws when the block is empty', () => {
        expect(() => validateEnvironments({})).toThrow(/No environments are defined/);
    });

    it('throws when the block is not an object', () => {
        expect(() => validateEnvironments(['dev'])).toThrow(/must be an object/);
    });

    it('throws naming the offending entry when url is missing', () => {
        expect(() => validateEnvironments({ dev: {} })).toThrow(/Environment 'dev' is missing a non-empty 'url'/);
    });

    it('throws naming the offending entry when namespace is not a string', () => {
        expect(() => validateEnvironments({ dev: { url: 'https://h', namespace: 7 } }))
            .toThrow(/Environment 'dev' has an invalid 'namespace'/);
    });

    it('throws naming the offending entry when domain is not a string', () => {
        expect(() => validateEnvironments({ dev: { url: 'https://h', domain: '' } }))
            .toThrow(/Environment 'dev' has an invalid 'domain'/);
    });
});

describe('resolveEnvironment', () => {
    const envs = { dev: { url: 'https://dev' }, prod: { url: 'https://prod' } };

    it('returns the named environment', () => {
        expect(resolveEnvironment(envs, 'prod')).toEqual({ url: 'https://prod' });
    });

    it('throws listing the declared labels for an unknown label', () => {
        expect(() => resolveEnvironment(envs, 'qa')).toThrow(/Unknown environment 'qa'.*dev, prod/s);
    });
});

describe('describeEnvironment', () => {
    it('describes a url-only environment', () => {
        expect(describeEnvironment('dev', { url: 'https://dev' })).toBe('dev (https://dev)');
    });

    it('includes namespace and domain overrides when present', () => {
        expect(describeEnvironment('prod', { url: 'https://p', namespace: 'ns', domain: 'dm' }))
            .toBe('prod (https://p, namespace: ns, domain: dm)');
    });
});

describe('normaliseUrl', () => {
    it('trims whitespace and trailing slashes', () => {
        expect(normaliseUrl('  https://h/api//  ')).toBe('https://h/api');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && npx vitest run src/command-helpers/workspace/environment.spec.ts`
Expected: FAIL — `Failed to resolve import "./environment"`.

- [ ] **Step 3: Write the implementation**

Create `cli/src/command-helpers/workspace/environment.ts`:

```ts
/**
 * A CalmHub environment: a label in `.calm-workspace/config.json` mapping to a hub instance and,
 * optionally, the namespace and/or domain that documents live under in that environment.
 */
export interface WorkspaceEnvironment {
    url: string;
    /** Namespace override for namespace resources. Omitted means "keep the source document's". */
    namespace?: string;
    /** Domain override for control requirements and configurations. */
    domain?: string;
}

export type EnvironmentMap = Record<string, WorkspaceEnvironment>;

const CONFIG_HINT =
    'Declare them in .calm-workspace/config.json, for example:\n' +
    '  "environments": {\n' +
    '    "dev":  { "url": "https://calm-dev.corp" },\n' +
    '    "prod": { "url": "https://calm.corp", "namespace": "trading-prod" }\n' +
    '  }';

/** Strip whitespace and trailing slashes so two spellings of the same hub URL compare equal. */
export function normaliseUrl(url: string): string {
    return url.trim().replace(/\/+$/, '');
}

/**
 * Validate the raw `environments` block from the workspace config.
 *
 * Unlike the rest of the config, this never falls back to a default: pointing at the wrong hub is
 * worse than failing, so every problem raises with the offending entry named.
 */
export function validateEnvironments(raw: unknown): EnvironmentMap {
    if (raw === undefined || raw === null) {
        throw new Error(`No environments are defined for this workspace.\n${CONFIG_HINT}`);
    }
    if (typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`'environments' in .calm-workspace/config.json must be an object.\n${CONFIG_HINT}`);
    }

    const entries = Object.entries(raw as Record<string, unknown>);
    if (entries.length === 0) {
        throw new Error(`No environments are defined for this workspace.\n${CONFIG_HINT}`);
    }

    const result: EnvironmentMap = {};
    for (const [label, value] of entries) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error(`Environment '${label}' must be an object with a 'url'.`);
        }
        const { url, namespace, domain } = value as Record<string, unknown>;

        if (typeof url !== 'string' || !url.trim()) {
            throw new Error(`Environment '${label}' is missing a non-empty 'url'.`);
        }
        if (namespace !== undefined && (typeof namespace !== 'string' || !namespace.trim())) {
            throw new Error(`Environment '${label}' has an invalid 'namespace' - expected a non-empty string.`);
        }
        if (domain !== undefined && (typeof domain !== 'string' || !domain.trim())) {
            throw new Error(`Environment '${label}' has an invalid 'domain' - expected a non-empty string.`);
        }

        result[label] = {
            url: normaliseUrl(url),
            ...(typeof namespace === 'string' ? { namespace: namespace.trim() } : {}),
            ...(typeof domain === 'string' ? { domain: domain.trim() } : {}),
        };
    }
    return result;
}

/** Look up one environment by label, erroring with the declared labels when it is not found. */
export function resolveEnvironment(environments: EnvironmentMap, label: string): WorkspaceEnvironment {
    const environment = environments[label];
    if (!environment) {
        throw new Error(
            `Unknown environment '${label}'. Declared environments: ${Object.keys(environments).join(', ')}`
        );
    }
    return environment;
}

/** One-line human description, e.g. `prod (https://calm.corp, namespace: trading-prod)`. */
export function describeEnvironment(label: string, environment: WorkspaceEnvironment): string {
    const extras = [
        environment.namespace ? `namespace: ${environment.namespace}` : null,
        environment.domain ? `domain: ${environment.domain}` : null,
    ].filter((x): x is string => x !== null);
    return `${label} (${environment.url}${extras.length > 0 ? ', ' + extras.join(', ') : ''})`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd cli && npx vitest run src/command-helpers/workspace/environment.spec.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Add the config passthrough test**

Append to the `describe('workspace config', ...)` block in `cli/src/command-helpers/workspace/config.spec.ts`:

```ts
    it('passes the environments block through untouched', async () => {
        await writeConfig(JSON.stringify({
            environments: { dev: { url: 'https://calm-dev.corp' } },
        }));
        const config = await loadWorkspaceConfig(gitRoot);
        expect(config.environments).toEqual({ dev: { url: 'https://calm-dev.corp' } });
    });

    it('does not throw on a malformed environments block', async () => {
        await writeConfig(JSON.stringify({ environments: 'nonsense' }));
        const config = await loadWorkspaceConfig(gitRoot);
        expect(config.environments).toBe('nonsense');
        expect(config.push.failIfModified).toBe(false);
    });
```

- [ ] **Step 6: Run to verify the new config tests fail**

Run: `cd cli && npx vitest run src/command-helpers/workspace/config.spec.ts`
Expected: FAIL — `expected undefined to deeply equal { dev: ... }`.

- [ ] **Step 7: Add `environments` to the config type and loader**

In `cli/src/command-helpers/workspace/config.ts`, add the field to the interface, immediately after the `bump` block:

```ts
    /**
     * Environment declarations, returned exactly as they appear on disk. Deliberately `unknown`:
     * this loader never throws, and validating here would make a malformed block break commands
     * that never read it. Validate with `validateEnvironments` from `./environment` at the point
     * of use.
     */
    environments?: unknown;
```

and in `loadWorkspaceConfig`, add the field to the returned object literal, after the `bump` block:

```ts
            environments: parsed?.environments,
```

- [ ] **Step 8: Run the config tests to verify they pass**

Run: `cd cli && npx vitest run src/command-helpers/workspace/config.spec.ts`
Expected: PASS. The pre-existing `returns defaults when the config file is absent` test still passes because `toEqual` ignores properties whose value is `undefined`.

- [ ] **Step 9: Lint and commit**

```bash
npm run lint --workspace cli
git add cli/src/command-helpers/workspace/environment.ts cli/src/command-helpers/workspace/environment.spec.ts cli/src/command-helpers/workspace/config.ts cli/src/command-helpers/workspace/config.spec.ts
git commit -m "feat(cli): add workspace environment config parsing and validation"
```

---

### Task 2: Bundle environment metadata (`bundle.json`)

Where a bundle records which environment it belongs to. Loading is forgiving (a missing or corrupt `bundle.json` means "no environment", matching how `loadManifest` treats a bad manifest) because the absence of an environment is a legitimate, supported state.

**Files:**
- Create: `cli/src/command-helpers/workspace/bundle-metadata.ts`
- Create: `cli/src/command-helpers/workspace/bundle-metadata.spec.ts`

**Interfaces:**
- Consumes: `cleanWorkspaceBundle` from `./workspace` (test only).
- Produces:
  - `const BUNDLE_METADATA_FILENAME = 'bundle.json'`
  - `interface BundleMetadata { environment?: string; promotedFrom?: string }`
  - `function loadBundleMetadata(bundlePath: string): Promise<BundleMetadata | undefined>`
  - `function saveBundleMetadata(bundlePath: string, metadata: BundleMetadata): Promise<void>`
  - `function setBundleEnvironment(bundlePath: string, label: string | undefined): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `cli/src/command-helpers/workspace/bundle-metadata.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdir, writeFile, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import {
    BUNDLE_METADATA_FILENAME,
    loadBundleMetadata,
    saveBundleMetadata,
    setBundleEnvironment,
} from './bundle-metadata';
import { cleanWorkspaceBundle } from './workspace';

describe('bundle metadata', () => {
    const gitRoot = path.join(__dirname, 'test-bundle-metadata');
    const bundlePath = path.join(gitRoot, '.calm-workspace', 'bundles', 'trading');

    beforeEach(async () => {
        await rm(gitRoot, { recursive: true, force: true });
        await mkdir(bundlePath, { recursive: true });
    });

    afterAll(async () => {
        await rm(gitRoot, { recursive: true, force: true });
    });

    it('returns undefined when bundle.json is absent', async () => {
        expect(await loadBundleMetadata(bundlePath)).toBeUndefined();
    });

    it('returns undefined when bundle.json is invalid JSON', async () => {
        await writeFile(path.join(bundlePath, BUNDLE_METADATA_FILENAME), 'not json {{{', 'utf8');
        expect(await loadBundleMetadata(bundlePath)).toBeUndefined();
    });

    it('round-trips metadata through save and load', async () => {
        await saveBundleMetadata(bundlePath, { environment: 'dev', promotedFrom: 'trading' });
        expect(await loadBundleMetadata(bundlePath)).toEqual({ environment: 'dev', promotedFrom: 'trading' });
    });

    it('setBundleEnvironment preserves other metadata fields', async () => {
        await saveBundleMetadata(bundlePath, { environment: 'dev', promotedFrom: 'trading' });
        await setBundleEnvironment(bundlePath, 'prod');
        expect(await loadBundleMetadata(bundlePath)).toEqual({ environment: 'prod', promotedFrom: 'trading' });
    });

    it('setBundleEnvironment creates bundle.json when it does not exist', async () => {
        await setBundleEnvironment(bundlePath, 'dev');
        expect(await loadBundleMetadata(bundlePath)).toEqual({ environment: 'dev' });
    });

    it('setBundleEnvironment with undefined removes the environment', async () => {
        await saveBundleMetadata(bundlePath, { environment: 'dev', promotedFrom: 'trading' });
        await setBundleEnvironment(bundlePath, undefined);
        expect(await loadBundleMetadata(bundlePath)).toEqual({ promotedFrom: 'trading' });
    });

    it('writes bundle.json with a trailing newline and two-space indentation', async () => {
        await saveBundleMetadata(bundlePath, { environment: 'dev' });
        const raw = await readFile(path.join(bundlePath, BUNDLE_METADATA_FILENAME), 'utf8');
        expect(raw).toBe('{\n  "environment": "dev"\n}\n');
    });

    it('clean does not remove the bundle environment', async () => {
        await setBundleEnvironment(bundlePath, 'dev');
        await mkdir(path.join(bundlePath, 'files'), { recursive: true });
        await writeFile(path.join(bundlePath, 'files', 'doc.json'), '{}', 'utf8');

        await cleanWorkspaceBundle(gitRoot, 'trading');

        expect(existsSync(path.join(bundlePath, 'files'))).toBe(false);
        expect(await loadBundleMetadata(bundlePath)).toEqual({ environment: 'dev' });
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && npx vitest run src/command-helpers/workspace/bundle-metadata.spec.ts`
Expected: FAIL — `Failed to resolve import "./bundle-metadata"`.

- [ ] **Step 3: Write the implementation**

Create `cli/src/command-helpers/workspace/bundle-metadata.ts`:

```ts
import path from 'path';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

export const BUNDLE_METADATA_FILENAME = 'bundle.json';

/**
 * Per-bundle metadata, stored alongside the manifest. A bundle without this file has no
 * environment and behaves exactly as bundles did before environments existed.
 */
export interface BundleMetadata {
    /** Environment label, as declared in `.calm-workspace/config.json`. */
    environment?: string;
    /** For a promoted bundle, the name of the bundle it was promoted from. */
    promotedFrom?: string;
}

function metadataPath(bundlePath: string): string {
    return path.join(bundlePath, BUNDLE_METADATA_FILENAME);
}

/**
 * Load a bundle's metadata. Returns undefined when the file is absent, unreadable or invalid —
 * "no environment" is a supported state, so a bad file must not break unrelated commands.
 */
export async function loadBundleMetadata(bundlePath: string): Promise<BundleMetadata | undefined> {
    const filePath = metadataPath(bundlePath);
    if (!existsSync(filePath)) return undefined;
    try {
        const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
        return parsed as BundleMetadata;
    } catch {
        return undefined;
    }
}

export async function saveBundleMetadata(bundlePath: string, metadata: BundleMetadata): Promise<void> {
    await writeFile(metadataPath(bundlePath), JSON.stringify(metadata, null, 2) + '\n', 'utf8');
}

/**
 * Set (or, with `undefined`, remove) the bundle's environment, leaving every other metadata field
 * intact.
 */
export async function setBundleEnvironment(bundlePath: string, label: string | undefined): Promise<void> {
    const existing = (await loadBundleMetadata(bundlePath)) ?? {};
    const updated: BundleMetadata = { ...existing };
    if (label === undefined) {
        delete updated.environment;
    } else {
        updated.environment = label;
    }
    await saveBundleMetadata(bundlePath, updated);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd cli && npx vitest run src/command-helpers/workspace/bundle-metadata.spec.ts`
Expected: PASS, 8 tests. The `clean` test passes without changing `cleanWorkspaceBundle` — it already only removes `files/` and resets the manifest. The test locks that in as a guarantee.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint --workspace cli
git add cli/src/command-helpers/workspace/bundle-metadata.ts cli/src/command-helpers/workspace/bundle-metadata.spec.ts
git commit -m "feat(cli): record a workspace bundle's environment in bundle.json"
```

---

### Task 3: `init --environment` and the `environment` command group

**Files:**
- Modify: `cli/src/command-helpers/workspace/commands.ts:31-48` (`init`), and add the `environment` group after `init`
- Modify: `cli/src/command-helpers/workspace/commands.spec.ts` (mocks + new describes)

**Interfaces:**
- Consumes: `validateEnvironments`, `resolveEnvironment`, `describeEnvironment` from `./environment` (Task 1); `loadBundleMetadata`, `setBundleEnvironment` from `./bundle-metadata` (Task 2); existing `loadWorkspaceConfig`, `findGitRoot`, `findWorkspaceManifestPath`, `listWorkspaces`, `getActiveWorkspace`.
- Produces: CLI surface `calm workspace init --environment <label>`, `calm workspace environment [list|show|set|unset]`. No new exported functions.

- [ ] **Step 1: Add the new mocks to the command test file**

In `cli/src/command-helpers/workspace/commands.spec.ts`, add these entries to the `vi.hoisted` mocks object:

```ts
        loadBundleMetadata: vi.fn<() => Promise<{ environment?: string } | undefined>>(async () => ({ environment: 'dev' })),
        setBundleEnvironment: vi.fn(async () => { }),
```

update the `loadWorkspaceConfig` mock so it carries environments:

```ts
        loadWorkspaceConfig: vi.fn(async () => ({
            push: { failIfModified: false },
            bump: { defaultIncrement: 'MINOR' },
            environments: {
                dev: { url: 'https://calm-dev.corp' },
                prod: { url: 'https://calm.corp', namespace: 'trading-prod' },
            },
        })),
```

and add the module mock alongside the others:

```ts
vi.mock('./bundle-metadata', () => ({
    loadBundleMetadata: mocks.loadBundleMetadata,
    setBundleEnvironment: mocks.setBundleEnvironment,
}));
```

Note: do **not** mock `./environment`. Its functions are pure and the tests should exercise the real validation.

- [ ] **Step 2: Write the failing tests**

Add to `cli/src/command-helpers/workspace/commands.spec.ts`, after the `describe('workspace init', ...)` block:

```ts
    describe('workspace init --environment', () => {
        it('sets the bundle environment when the label is declared', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'init', 'my-ws', '--environment', 'prod']);
            expect(mocks.setBundleEnvironment).toHaveBeenCalledWith('/fake/bundle', 'prod');
        });

        it('does not touch bundle.json when no environment is given', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'init', 'my-ws']);
            expect(mocks.setBundleEnvironment).not.toHaveBeenCalled();
        });

        it('exits when the label is not declared', async () => {
            await expect(
                program.parseAsync(['node', 'test', 'workspace', 'init', 'my-ws', '--environment', 'nope'])
            ).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
            expect(mocks.setBundleEnvironment).not.toHaveBeenCalled();
        });
    });

    describe('workspace environment', () => {
        it('set records the environment on the active bundle', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'environment', 'set', 'prod']);
            expect(mocks.setBundleEnvironment).toHaveBeenCalledWith('/fake/bundle', 'prod');
        });

        it('set exits for an undeclared label', async () => {
            await expect(
                program.parseAsync(['node', 'test', 'workspace', 'environment', 'set', 'nope'])
            ).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
            expect(mocks.setBundleEnvironment).not.toHaveBeenCalled();
        });

        it('unset clears the environment', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'environment', 'unset']);
            expect(mocks.setBundleEnvironment).toHaveBeenCalledWith('/fake/bundle', undefined);
        });

        it('list reads the declared environments from config', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'environment', 'list']);
            expect(mocks.loadWorkspaceConfig).toHaveBeenCalledWith('/fake/repo');
        });

        it('show resolves a named environment', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'environment', 'show', 'prod']);
            expect(mocks.loadWorkspaceConfig).toHaveBeenCalledWith('/fake/repo');
        });

        it('show exits for an undeclared label', async () => {
            await expect(
                program.parseAsync(['node', 'test', 'workspace', 'environment', 'show', 'nope'])
            ).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('with no subcommand reports the active bundle environment', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'environment']);
            expect(mocks.loadBundleMetadata).toHaveBeenCalledWith('/fake/bundle');
        });

        it('with no subcommand does not fail when the bundle has no environment', async () => {
            mocks.loadBundleMetadata.mockResolvedValueOnce(undefined);
            await program.parseAsync(['node', 'test', 'workspace', 'environment']);
            expect(exitSpy).not.toHaveBeenCalled();
        });
    });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd cli && npx vitest run src/command-helpers/workspace/commands.spec.ts`
Expected: FAIL — commander rejects the unknown option `--environment` and the unknown command `environment`.

- [ ] **Step 4: Implement `init --environment`**

In `cli/src/command-helpers/workspace/commands.ts`, add the imports:

```ts
import { loadBundleMetadata, setBundleEnvironment } from './bundle-metadata';
import { validateEnvironments, resolveEnvironment, describeEnvironment } from './environment';
```

Replace the `init` command registration with:

```ts
    workspaceCmd
        .command('init')
        .description('Initialize or update CALM workspace in a repository')
        .argument('<name>', 'The name of the workspace to create or update')
        .option('--dir <path>', 'Directory in which to create the workspace (defaults to git root)')
        .option('--environment <label>', 'Environment this workspace belongs to (from .calm-workspace/config.json)')
        .action(async (name: string, options: { dir?: string; environment?: string }) => {
            const workspaceName: string = name as string;
            const targetDir = options.dir ? path.resolve(options.dir) : (findGitRoot(process.cwd()) ?? process.cwd());

            try {
                // Validate the label before creating anything, so a typo does not leave a bundle behind.
                if (options.environment) {
                    const config = await loadWorkspaceConfig(targetDir);
                    resolveEnvironment(validateEnvironments(config.environments), options.environment);
                }

                const created = await ensureWorkspaceBundle(targetDir, workspaceName);
                if (options.environment) {
                    await setBundleEnvironment(created, options.environment);
                    logger.info(`Workspace '${workspaceName}' belongs to environment '${options.environment}'`);
                }
                logger.info(`Workspace '${workspaceName}' created/updated at ${path.dirname(created)}`);
                logger.info(`Bundle directory ensured at ${created}`);
            } catch (err) {
                logger.error('Failed to create workspace: ' + (err instanceof Error ? err.message : String(err)));
                process.exit(1);
            }
        });
```

- [ ] **Step 5: Implement the `environment` command group**

Add immediately after the `init` registration in `cli/src/command-helpers/workspace/commands.ts`:

```ts
    const environmentCmd = workspaceCmd
        .command('environment')
        .description('Show or change the environment the active workspace bundle belongs to')
        .action(async () => {
            try {
                const bundlePath = requireBundlePath();
                const label = (await loadBundleMetadata(bundlePath))?.environment;
                if (!label) {
                    logger.info('This workspace bundle has no environment. Set one with `calm workspace environment set <label>`.');
                    return;
                }
                const environments = validateEnvironments((await loadWorkspaceConfig(requireGitRoot())).environments);
                logger.info(describeEnvironment(label, resolveEnvironment(environments, label)));
            } catch (err) {
                logger.error('Failed to read the workspace environment: ' + (err instanceof Error ? err.message : String(err)));
                process.exit(1);
            }
        });

    environmentCmd
        .command('list')
        .description('List the environments declared in .calm-workspace/config.json')
        .action(async () => {
            try {
                const gitRoot = requireGitRoot();
                const environments = validateEnvironments((await loadWorkspaceConfig(gitRoot)).environments);

                // Map each environment to the bundles that belong to it, so `list` answers
                // "who is pointing at prod?" without inspecting every bundle by hand.
                const usage: Record<string, string[]> = {};
                for (const workspaceName of await listWorkspaces(gitRoot)) {
                    const label = (await loadBundleMetadata(getWorkspaceBundlePath(gitRoot, workspaceName)))?.environment;
                    if (label) (usage[label] ??= []).push(workspaceName);
                }

                logger.info('Declared environments:');
                for (const [label, environment] of Object.entries(environments)) {
                    const bundles = usage[label]?.length ? ` - bundles: ${usage[label].join(', ')}` : '';
                    logger.info(`  ${describeEnvironment(label, environment)}${bundles}`);
                }
            } catch (err) {
                logger.error('Failed to list environments: ' + (err instanceof Error ? err.message : String(err)));
                process.exit(1);
            }
        });

    environmentCmd
        .command('show')
        .description('Show one environment\'s url, namespace and domain')
        .argument('[label]', 'Environment label (defaults to the active bundle\'s environment)')
        .action(async (label?: string) => {
            try {
                const gitRoot = requireGitRoot();
                const resolvedLabel = label ?? (await loadBundleMetadata(requireBundlePath()))?.environment;
                if (!resolvedLabel) {
                    logger.error('No environment given and the active bundle has no environment.');
                    process.exit(1);
                    return;
                }
                const environments = validateEnvironments((await loadWorkspaceConfig(gitRoot)).environments);
                logger.info(describeEnvironment(resolvedLabel, resolveEnvironment(environments, resolvedLabel)));
            } catch (err) {
                logger.error('Failed to show environment: ' + (err instanceof Error ? err.message : String(err)));
                process.exit(1);
            }
        });

    environmentCmd
        .command('set')
        .description('Set the environment the active workspace bundle belongs to')
        .argument('<label>', 'Environment label from .calm-workspace/config.json')
        .action(async (label: string) => {
            try {
                const bundlePath = requireBundlePath();
                const environments = validateEnvironments((await loadWorkspaceConfig(requireGitRoot())).environments);
                const environment = resolveEnvironment(environments, label);
                await setBundleEnvironment(bundlePath, label);
                logger.info(`Workspace bundle now belongs to ${describeEnvironment(label, environment)}`);
            } catch (err) {
                logger.error('Failed to set environment: ' + (err instanceof Error ? err.message : String(err)));
                process.exit(1);
            }
        });

    environmentCmd
        .command('unset')
        .description('Remove the active bundle\'s environment')
        .action(async () => {
            try {
                const bundlePath = requireBundlePath();
                await setBundleEnvironment(bundlePath, undefined);
                logger.info('Workspace bundle no longer belongs to an environment.');
            } catch (err) {
                logger.error('Failed to unset environment: ' + (err instanceof Error ? err.message : String(err)));
                process.exit(1);
            }
        });
```

- [ ] **Step 6: Add the two lookup helpers**

The `environment` actions above use two helpers that turn the repeated "resolve or exit" preamble into one call. Add them next to `enforceOptionPresenceByPrompt` at the bottom of `cli/src/command-helpers/workspace/commands.ts`, and add `getWorkspaceBundlePath` to the existing `./workspace` import:

```ts
/** Resolve the git root or throw — every environment lookup needs it to find config.json. */
function requireGitRoot(): string {
    const gitRoot = findGitRoot(process.cwd());
    if (!gitRoot) {
        throw new Error('No git repository found. Please run this command from within a git repository.');
    }
    return gitRoot;
}

/** Resolve the active bundle directory or throw. */
function requireBundlePath(): string {
    const bundlePath = findWorkspaceManifestPath(process.cwd());
    if (!bundlePath) {
        throw new Error('No CALM workspace bundle found. Create one with `calm workspace init <name>`');
    }
    return bundlePath;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd cli && npx vitest run src/command-helpers/workspace/commands.spec.ts`
Expected: PASS, including all pre-existing tests.

- [ ] **Step 8: Lint and commit**

```bash
npm run lint --workspace cli
git add cli/src/command-helpers/workspace/commands.ts cli/src/command-helpers/workspace/commands.spec.ts
git commit -m "feat(cli): add workspace environment command group"
```

---

### Task 4: Hub resolution module

The single place that decides which hub a workspace command talks to. Three tiers, plus the conflict check that closes the cross-environment push hazard.

**Files:**
- Create: `cli/src/command-helpers/workspace/hub-resolution.ts`
- Create: `cli/src/command-helpers/workspace/hub-resolution.spec.ts`

**Interfaces:**
- Consumes: `loadBundleMetadata` (Task 2); `validateEnvironments`, `resolveEnvironment`, `normaliseUrl`, `WorkspaceEnvironment` (Task 1); `loadWorkspaceConfig` from `./config`; `resolveCalmHubOptions` from `../hub-commands`; `CalmHubOptions` from `@finos/calm-shared/src/hub/calm-hub-client`.
- Produces:
  - `interface ResolveWorkspaceHubOptions { bundlePath: string; gitRoot: string | null; calmHubUrl?: string; environmentOverride?: string; expectEnvironment?: string }`
  - `interface WorkspaceHubResolution { calmHubOptions: CalmHubOptions; environmentLabel?: string; environment?: WorkspaceEnvironment }`
  - `function resolveWorkspaceHub(options: ResolveWorkspaceHubOptions): Promise<WorkspaceHubResolution>`

- [ ] **Step 1: Write the failing tests**

Create `cli/src/command-helpers/workspace/hub-resolution.spec.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    loadBundleMetadata: vi.fn<() => Promise<{ environment?: string } | undefined>>(async () => undefined),
    loadWorkspaceConfig: vi.fn(async () => ({
        push: { failIfModified: false },
        bump: { defaultIncrement: 'MINOR' },
        environments: {
            dev: { url: 'https://calm-dev.corp' },
            prod: { url: 'https://calm.corp', namespace: 'trading-prod' },
        },
    })),
    resolveCalmHubOptions: vi.fn(async (opts: { calmHubUrl?: string }) => ({
        calmHubUrl: opts.calmHubUrl ?? 'https://from-user-config',
    })),
}));

vi.mock('./bundle-metadata', () => ({ loadBundleMetadata: mocks.loadBundleMetadata }));
vi.mock('./config', () => ({ loadWorkspaceConfig: mocks.loadWorkspaceConfig }));
vi.mock('../hub-commands', () => ({ resolveCalmHubOptions: mocks.resolveCalmHubOptions }));

import { resolveWorkspaceHub } from './hub-resolution';

describe('resolveWorkspaceHub', () => {
    const base = { bundlePath: '/bundle', gitRoot: '/repo' };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.loadBundleMetadata.mockResolvedValue(undefined);
    });

    it('falls back to the user config when the bundle has no environment', async () => {
        const result = await resolveWorkspaceHub(base);
        expect(result.calmHubOptions.calmHubUrl).toBe('https://from-user-config');
        expect(result.environmentLabel).toBeUndefined();
        expect(result.environment).toBeUndefined();
    });

    it('uses an explicit --calm-hub-url when the bundle has no environment', async () => {
        const result = await resolveWorkspaceHub({ ...base, calmHubUrl: 'https://explicit' });
        expect(result.calmHubOptions.calmHubUrl).toBe('https://explicit');
    });

    it("uses the bundle environment's url", async () => {
        mocks.loadBundleMetadata.mockResolvedValue({ environment: 'prod' });
        const result = await resolveWorkspaceHub(base);
        expect(result.calmHubOptions.calmHubUrl).toBe('https://calm.corp');
        expect(result.environmentLabel).toBe('prod');
        expect(result.environment).toEqual({ url: 'https://calm.corp', namespace: 'trading-prod' });
    });

    it('accepts a --calm-hub-url that agrees with the environment, ignoring a trailing slash', async () => {
        mocks.loadBundleMetadata.mockResolvedValue({ environment: 'prod' });
        const result = await resolveWorkspaceHub({ ...base, calmHubUrl: 'https://calm.corp/' });
        expect(result.calmHubOptions.calmHubUrl).toBe('https://calm.corp/');
    });

    it('errors when --calm-hub-url conflicts with the bundle environment', async () => {
        mocks.loadBundleMetadata.mockResolvedValue({ environment: 'dev' });
        await expect(resolveWorkspaceHub({ ...base, calmHubUrl: 'https://calm.corp' }))
            .rejects.toThrow(/conflicts with environment 'dev'/);
    });

    it('applies an environment override without changing the bundle', async () => {
        mocks.loadBundleMetadata.mockResolvedValue({ environment: 'dev' });
        const result = await resolveWorkspaceHub({ ...base, environmentOverride: 'prod' });
        expect(result.calmHubOptions.calmHubUrl).toBe('https://calm.corp');
        expect(result.environmentLabel).toBe('prod');
    });

    it('errors for an unknown environment label', async () => {
        mocks.loadBundleMetadata.mockResolvedValue({ environment: 'staging' });
        await expect(resolveWorkspaceHub(base)).rejects.toThrow(/Unknown environment 'staging'/);
    });

    it('passes expectEnvironment when it matches the bundle', async () => {
        mocks.loadBundleMetadata.mockResolvedValue({ environment: 'prod' });
        const result = await resolveWorkspaceHub({ ...base, expectEnvironment: 'prod' });
        expect(result.environmentLabel).toBe('prod');
    });

    it('errors when expectEnvironment does not match the bundle', async () => {
        mocks.loadBundleMetadata.mockResolvedValue({ environment: 'dev' });
        await expect(resolveWorkspaceHub({ ...base, expectEnvironment: 'prod' }))
            .rejects.toThrow(/Expected the active bundle to belong to environment 'prod', but it belongs to 'dev'/);
    });

    it('errors when expectEnvironment is given and the bundle has no environment', async () => {
        await expect(resolveWorkspaceHub({ ...base, expectEnvironment: 'prod' }))
            .rejects.toThrow(/has no environment/);
    });

    it('errors when an environment is needed but there is no git root', async () => {
        mocks.loadBundleMetadata.mockResolvedValue({ environment: 'prod' });
        await expect(resolveWorkspaceHub({ ...base, gitRoot: null }))
            .rejects.toThrow(/no git repository found/);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && npx vitest run src/command-helpers/workspace/hub-resolution.spec.ts`
Expected: FAIL — `Failed to resolve import "./hub-resolution"`.

- [ ] **Step 3: Write the implementation**

Create `cli/src/command-helpers/workspace/hub-resolution.ts`:

```ts
import { CalmHubOptions } from '@finos/calm-shared/src/hub/calm-hub-client';
import { resolveCalmHubOptions } from '../hub-commands';
import { loadWorkspaceConfig } from './config';
import { loadBundleMetadata } from './bundle-metadata';
import { WorkspaceEnvironment, normaliseUrl, resolveEnvironment, validateEnvironments } from './environment';

export interface ResolveWorkspaceHubOptions {
    /** Absolute path to the active bundle directory. */
    bundlePath: string;
    /** Repository root, used to find `.calm-workspace/config.json`. */
    gitRoot: string | null;
    /** Explicit `--calm-hub-url`, if the user passed one. */
    calmHubUrl?: string;
    /** `--environment <label>`: resolve against another environment without changing the bundle. */
    environmentOverride?: string;
    /** `--expect-environment <label>`: assert the bundle's own environment before doing anything. */
    expectEnvironment?: string;
}

export interface WorkspaceHubResolution {
    calmHubOptions: CalmHubOptions;
    /** The environment in play, if any — the override when given, otherwise the bundle's own. */
    environmentLabel?: string;
    environment?: WorkspaceEnvironment;
}

/**
 * Decide which CalmHub a workspace command talks to.
 *
 * Precedence:
 *  1. explicit `--calm-hub-url`
 *  2. the bundle's environment url
 *  3. `~/.calm.json` / `CALM_HUB_URL` (via `resolveCalmHubOptions`)
 *
 * A bundle with no environment never reaches rule 2, which is what keeps existing workspaces
 * behaving exactly as they did. When the bundle does have an environment and `--calm-hub-url`
 * disagrees with it, this raises rather than silently publishing to the wrong instance.
 */
export async function resolveWorkspaceHub(options: ResolveWorkspaceHubOptions): Promise<WorkspaceHubResolution> {
    const bundleLabel = (await loadBundleMetadata(options.bundlePath))?.environment;

    // Checked against the bundle's own environment, never the override: this exists so CI can
    // assert what it is about to publish.
    if (options.expectEnvironment && options.expectEnvironment !== bundleLabel) {
        throw new Error(
            `Expected the active bundle to belong to environment '${options.expectEnvironment}', but it ` +
            (bundleLabel ? `belongs to '${bundleLabel}'.` : 'has no environment.')
        );
    }

    const label = options.environmentOverride ?? bundleLabel;

    let environment: WorkspaceEnvironment | undefined;
    if (label) {
        if (!options.gitRoot) {
            throw new Error(`Cannot resolve environment '${label}': no git repository found.`);
        }
        const config = await loadWorkspaceConfig(options.gitRoot);
        environment = resolveEnvironment(validateEnvironments(config.environments), label);
    }

    if (environment && options.calmHubUrl && normaliseUrl(options.calmHubUrl) !== normaliseUrl(environment.url)) {
        throw new Error(
            `--calm-hub-url ${options.calmHubUrl} conflicts with environment '${label}' (${environment.url}). ` +
            'Drop the flag, or change the bundle\'s environment with `calm workspace environment set <label>`.'
        );
    }

    const calmHubOptions = await resolveCalmHubOptions({ calmHubUrl: options.calmHubUrl ?? environment?.url });
    return { calmHubOptions, environmentLabel: label, environment };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd cli && npx vitest run src/command-helpers/workspace/hub-resolution.spec.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint --workspace cli
git add cli/src/command-helpers/workspace/hub-resolution.ts cli/src/command-helpers/workspace/hub-resolution.spec.ts
git commit -m "feat(cli): add environment-aware CalmHub resolution for workspace commands"
```

---

### Task 5: Route `push`, `check` and `bump` through hub resolution

This is the task that fixes the wrong-hub hazard. All three commands currently call `resolveCalmHubOptions({ calmHubUrl: options.calmHubUrl })` directly; that call site is the seam.

`--environment` is registered on `push` and `bump` **only so it can be rejected with a useful message** — commander's default "unknown option" error would not tell the user what to do instead.

**Files:**
- Modify: `cli/src/command-helpers/workspace/commands.ts:338-363` (`push`), `:365-417` (`check`), `:419-534` (`bump`)
- Modify: `cli/src/command-helpers/workspace/commands.spec.ts`

**Interfaces:**
- Consumes: `resolveWorkspaceHub` from `./hub-resolution` (Task 4); `describeEnvironment` from `./environment` (Task 1).
- Produces: CLI flags `push --expect-environment <label>`, `check --environment <label>`. No new exported functions.

- [ ] **Step 1: Add the mock and write the failing tests**

In `cli/src/command-helpers/workspace/commands.spec.ts`, add to the `vi.hoisted` mocks:

```ts
        resolveWorkspaceHub: vi.fn(async () => ({
            calmHubOptions: { calmHubUrl: 'https://calm-dev.corp' },
            environmentLabel: 'dev',
            environment: { url: 'https://calm-dev.corp' },
        })),
```

and the module mock:

```ts
vi.mock('./hub-resolution', () => ({ resolveWorkspaceHub: mocks.resolveWorkspaceHub }));
```

Then add a new describe block:

```ts
    describe('environment-aware hub resolution', () => {
        it('push resolves its hub through resolveWorkspaceHub', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'push']);
            expect(mocks.resolveWorkspaceHub).toHaveBeenCalledWith(
                expect.objectContaining({ bundlePath: '/fake/bundle', gitRoot: '/fake/repo' })
            );
        });

        it('push passes --expect-environment through', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'push', '--expect-environment', 'prod']);
            expect(mocks.resolveWorkspaceHub).toHaveBeenCalledWith(
                expect.objectContaining({ expectEnvironment: 'prod' })
            );
        });

        it('push exits when hub resolution fails', async () => {
            mocks.resolveWorkspaceHub.mockRejectedValueOnce(new Error('conflicts with environment'));
            await expect(program.parseAsync(['node', 'test', 'workspace', 'push'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
            expect(mocks.pushWorkspaceToHub).not.toHaveBeenCalled();
        });

        it('push rejects --environment with a pointer to the right command', async () => {
            await expect(
                program.parseAsync(['node', 'test', 'workspace', 'push', '--environment', 'prod'])
            ).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
            expect(mocks.pushWorkspaceToHub).not.toHaveBeenCalled();
        });

        it('check passes --environment through as an override', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'check', '--environment', 'prod']);
            expect(mocks.resolveWorkspaceHub).toHaveBeenCalledWith(
                expect.objectContaining({ environmentOverride: 'prod' })
            );
        });

        it('bump resolves its hub through resolveWorkspaceHub', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'bump']);
            expect(mocks.resolveWorkspaceHub).toHaveBeenCalled();
        });

        it('bump rejects --environment with a pointer to the right command', async () => {
            await expect(
                program.parseAsync(['node', 'test', 'workspace', 'bump', '--environment', 'prod'])
            ).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
            expect(mocks.bumpWorkspace).not.toHaveBeenCalled();
        });
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && npx vitest run src/command-helpers/workspace/commands.spec.ts`
Expected: FAIL — `resolveWorkspaceHub` is never called, and `--expect-environment` is an unknown option.

- [ ] **Step 3: Add the shared helper and imports**

In `cli/src/command-helpers/workspace/commands.ts`, add the import:

```ts
import { resolveWorkspaceHub } from './hub-resolution';
```

and add this helper next to `requireGitRoot`:

```ts
/**
 * Resolve the hub for a workspace command and announce the target, so an unexpected environment is
 * visible at the moment it matters rather than after the fact.
 */
async function resolveHubAndAnnounce(
    action: string,
    bundlePath: string,
    options: { calmHubUrl?: string; environmentOverride?: string; expectEnvironment?: string }
) {
    const resolution = await resolveWorkspaceHub({
        bundlePath,
        gitRoot: findGitRoot(process.cwd()),
        calmHubUrl: options.calmHubUrl,
        environmentOverride: options.environmentOverride,
        expectEnvironment: options.expectEnvironment,
    });

    const bundleName = path.basename(bundlePath);
    const target = resolution.environmentLabel
        ? `${resolution.environmentLabel} -> ${resolution.calmHubOptions.calmHubUrl}`
        : `${resolution.calmHubOptions.calmHubUrl}`;
    logger.info(`${action} bundle '${bundleName}' (${target})`);

    return resolution;
}

/** `--environment` is accepted only on read-only or explicitly-targeted commands. */
function rejectEnvironmentOverride(command: string): never {
    throw new Error(
        `\`calm workspace ${command}\` does not accept --environment: it acts on the bundle's own environment. ` +
        'Change it with `calm workspace environment set <label>`, or promote with `calm workspace migrate <environment>`.'
    );
}
```

- [ ] **Step 4: Rewire `push`**

Replace the `push` registration's options and the head of its action in `cli/src/command-helpers/workspace/commands.ts`:

```ts
    workspaceCmd
        .command('push')
        .description('Push all files in the current workspace manifest to CalmHub. Does not auto-bump; pushes the version each document declares.')
        .option('--calm-hub-url <url>', 'CalmHub base URL (overrides ~/.calm.json)')
        .option('--expect-environment <label>', 'Fail unless the active bundle belongs to this environment (CI guard)')
        .option('--environment <label>', 'Not supported on push - see the error message')
        .option('--fail-if-modified', 'Fail if a modified document already exists in CalmHub at its declared version (overrides the workspace config; strict merge-time mode)')
        .action(async (options: { calmHubUrl?: string; expectEnvironment?: string; environment?: string; failIfModified?: boolean }) => {
            try {
                if (options.environment) rejectEnvironmentOverride('push');
                const bundlePath = requireBundlePath();

                const { calmHubOptions } = await resolveHubAndAnnounce('Pushing', bundlePath, {
                    calmHubUrl: options.calmHubUrl,
                    expectEnvironment: options.expectEnvironment,
                });

                const gitRoot = findGitRoot(process.cwd());
                const workspaceConfig = gitRoot ? await loadWorkspaceConfig(gitRoot) : undefined;
                const failIfModified = options.failIfModified ?? workspaceConfig?.push.failIfModified ?? false;

                const client = new CalmHubClient(calmHubOptions);
                await pushWorkspaceToHub(bundlePath, client, { failIfModified });
            } catch (err) {
                logger.error('Failed to push workspace: ' + (err instanceof Error ? err.message : String(err)));
                process.exit(1);
            }
        });
```

- [ ] **Step 5: Rewire `check` and `bump`**

In `check`, add the option and replace the resolution lines:

```ts
        .option('--environment <label>', 'Check against this environment instead of the bundle\'s own (read-only)')
```

```ts
                const bundlePath = requireBundlePath();
                const { calmHubOptions } = await resolveHubAndAnnounce('Checking', bundlePath, {
                    calmHubUrl: options.calmHubUrl,
                    environmentOverride: options.environment,
                });
                const client = new CalmHubClient(calmHubOptions);
```

with the action signature widened to `(options: { calmHubUrl?: string; environment?: string })`.

In `bump`, add the rejected option:

```ts
        .option('--environment <label>', 'Not supported on bump - see the error message')
```

widen the action signature with `environment?: string`, and replace the resolution lines, keeping the existing mutual-exclusion check first:

```ts
                if (options.environment) rejectEnvironmentOverride('bump');
                const bundlePath = requireBundlePath();

                if ([options.major, options.minor, options.patch].filter(Boolean).length > 1) {
                    logger.error('Cannot use --major, --minor and --patch together.');
                    process.exit(1);
                }

                const { calmHubOptions } = await resolveHubAndAnnounce('Bumping', bundlePath, {
                    calmHubUrl: options.calmHubUrl,
                });
```

Replace each command's existing `findWorkspaceManifestPath` preamble with the `requireBundlePath()` call shown above; the old `if (!bundlePath) { logger.error(...); process.exit(1); }` blocks are now handled by the helper's throw plus the existing catch.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd cli && npx vitest run src/command-helpers/workspace/commands.spec.ts`
Expected: PASS. Pre-existing push/check/bump tests still pass because `resolveWorkspaceHub` is mocked to return a valid `calmHubOptions`.

- [ ] **Step 7: Run the whole CLI suite**

Run: `npm test --workspace cli`
Expected: PASS.

- [ ] **Step 8: Lint and commit**

```bash
npm run lint --workspace cli
git add cli/src/command-helpers/workspace/commands.ts cli/src/command-helpers/workspace/commands.spec.ts
git commit -m "feat(cli): resolve the CalmHub target from the bundle environment on push, check and bump"
```

---

### Task 6: Environment-aware `$id` defaults in `add` and `new`

Stops a document being *authored* into the wrong environment. `promptForDocumentId` currently defaults only the base URL, from `~/.calm.json`; when the bundle has an environment it should default the base URL, namespace and domain from that instead.

**Files:**
- Modify: `cli/src/command-helpers/workspace/document-id-prompt.ts:24-29` (options), `:41-44` (`promptSegment`), `:81-101` (call sites)
- Modify: `cli/src/command-helpers/workspace/document-id-prompt.spec.ts`
- Modify: `cli/src/command-helpers/workspace/commands.ts` (`add` and `new` actions)
- Modify: `cli/src/command-helpers/workspace/commands.spec.ts`

**Interfaces:**
- Consumes: `loadBundleMetadata` (Task 2), `validateEnvironments`/`resolveEnvironment` (Task 1).
- Produces: `PromptForDocumentIdOptions` gains `namespaceDefault?: string` and `domainDefault?: string`.

- [ ] **Step 1: Write the failing prompt tests**

Add to `cli/src/command-helpers/workspace/document-id-prompt.spec.ts`, inside `describe('promptForDocumentId', ...)`:

```ts
    it('defaults the namespace from the environment when nothing is entered', async () => {
        // inputs: baseUrl, version, namespace, mapping - namespace left empty so the default applies
        queueAnswers(
            ['namespace', 'architectures'],
            ['https://hub.example.com', '1.0.0', undefined, 'my-arch']
        );

        const result = await promptForDocumentId({ namespaceDefault: 'trading-prod' });

        expect(result.namespace).toBe('trading-prod');
        expect(result.id).toBe('https://hub.example.com/calm/namespaces/trading-prod/architectures/my-arch/versions/1.0.0');
    });

    it('lets an explicit namespace answer override the environment default', async () => {
        queueAnswers(
            ['namespace', 'architectures'],
            ['https://hub.example.com', '1.0.0', 'typed-by-hand', 'my-arch']
        );

        const result = await promptForDocumentId({ namespaceDefault: 'trading-prod' });

        expect(result.namespace).toBe('typed-by-hand');
    });

    it('defaults the domain from the environment for control requirements', async () => {
        // inputs: baseUrl, version, domain, controlName - domain left empty so the default applies
        queueAnswers(
            ['requirement'],
            ['https://hub.example.com', '1.0.0', undefined, 'encryption']
        );

        const result = await promptForDocumentId({ domainDefault: 'security-prod' });

        expect(result.id).toBe('https://hub.example.com/calm/domains/security-prod/controls/encryption/requirement/versions/1.0.0');
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && npx vitest run src/command-helpers/workspace/document-id-prompt.spec.ts`
Expected: FAIL — namespace resolves to `''` because no default is passed through, so `constructDocumentId` produces an id with an empty segment and `assertConformant` throws.

- [ ] **Step 3: Thread the defaults through the prompt**

In `cli/src/command-helpers/workspace/document-id-prompt.ts`, extend the options interface:

```ts
export interface PromptForDocumentIdOptions {
    /** Pre-filled default for the base URL prompt (typically the environment or configured CalmHub URL). */
    baseUrlDefault?: string;
    /** Pre-filled default for the namespace prompt (from the bundle's environment). */
    namespaceDefault?: string;
    /** Pre-filled default for the domain prompt (from the bundle's environment). */
    domainDefault?: string;
    /** Default version (defaults to 1.0.0). */
    version?: string;
}
```

give `promptSegment` an optional default:

```ts
async function promptSegment(message: string, label: string, defaultValue?: string): Promise<string> {
    const value = await input({ message, default: defaultValue, validate: segmentValidator(label) });
    return value.trim();
}
```

and pass the defaults at the two call sites:

```ts
        const namespace = await promptSegment('Namespace:', 'Namespace', opts.namespaceDefault);
```

```ts
    const domain = await promptSegment('Domain:', 'Domain', opts.domainDefault);
```

- [ ] **Step 4: Run the prompt tests to verify they pass**

Run: `cd cli && npx vitest run src/command-helpers/workspace/document-id-prompt.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing command tests**

Add to `cli/src/command-helpers/workspace/commands.spec.ts`:

```ts
    describe('environment-aware $id defaults', () => {
        it('add defaults the base URL and namespace from the bundle environment', async () => {
            mocks.loadBundleMetadata.mockResolvedValueOnce({ environment: 'prod' });
            await program.parseAsync(['node', 'test', 'workspace', 'add', 'test.json']);
            expect(mocks.promptForDocumentId).toHaveBeenCalledWith(
                expect.objectContaining({
                    baseUrlDefault: 'https://calm.corp',
                    namespaceDefault: 'trading-prod',
                })
            );
        });

        it('add falls back to the CLI config base URL when the bundle has no environment', async () => {
            mocks.loadBundleMetadata.mockResolvedValueOnce(undefined);
            await program.parseAsync(['node', 'test', 'workspace', 'add', 'test.json']);
            expect(mocks.promptForDocumentId).toHaveBeenCalledWith(
                expect.objectContaining({ baseUrlDefault: 'https://calmhub.example.com' })
            );
            expect(mocks.promptForDocumentId).toHaveBeenCalledWith(
                expect.not.objectContaining({ namespaceDefault: expect.anything() })
            );
        });

        it('new defaults the base URL and namespace from the bundle environment', async () => {
            mocks.loadBundleMetadata.mockResolvedValueOnce({ environment: 'prod' });
            await program.parseAsync(['node', 'test', 'workspace', 'new', 'architecture', 'My Arch', 'empty']);
            expect(mocks.promptForDocumentId).toHaveBeenCalledWith(
                expect.objectContaining({
                    baseUrlDefault: 'https://calm.corp',
                    namespaceDefault: 'trading-prod',
                })
            );
        });
    });
```

- [ ] **Step 6: Run to verify they fail**

Run: `cd cli && npx vitest run src/command-helpers/workspace/commands.spec.ts`
Expected: FAIL — `promptForDocumentId` is called with only `baseUrlDefault` from the CLI config.

- [ ] **Step 7: Implement the defaults in `add` and `new`**

Add this helper next to `requireGitRoot` in `cli/src/command-helpers/workspace/commands.ts`:

```ts
/**
 * Prompt defaults for building a `$id`. When the bundle belongs to an environment, that environment
 * supplies the base URL and any namespace/domain override, so new documents are authored into the
 * right place instead of being corrected later.
 */
async function documentIdDefaults(bundlePath: string): Promise<{
    baseUrlDefault?: string;
    namespaceDefault?: string;
    domainDefault?: string;
}> {
    const label = (await loadBundleMetadata(bundlePath))?.environment;
    const gitRoot = findGitRoot(process.cwd());
    if (label && gitRoot) {
        const environments = validateEnvironments((await loadWorkspaceConfig(gitRoot)).environments);
        const environment = resolveEnvironment(environments, label);
        return {
            baseUrlDefault: environment.url,
            ...(environment.namespace ? { namespaceDefault: environment.namespace } : {}),
            ...(environment.domain ? { domainDefault: environment.domain } : {}),
        };
    }
    return { baseUrlDefault: (await loadCliConfig())?.calmHubUrl };
}
```

In the `add` action, replace:

```ts
                const baseUrlDefault = (await loadCliConfig())?.calmHubUrl;
```

with:

```ts
                const idDefaults = await documentIdDefaults(bundlePath);
```

and replace the `promptForDocumentId({ baseUrlDefault })` call with `promptForDocumentId(idDefaults)`.

In the `new` action, replace:

```ts
                const baseUrlDefault = (await loadCliConfig())?.calmHubUrl;
                const documentId = await promptForDocumentId({ baseUrlDefault });
```

with:

```ts
                const documentId = await promptForDocumentId(await documentIdDefaults(bundlePath));
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd cli && npx vitest run src/command-helpers/workspace/commands.spec.ts`
Expected: PASS.

- [ ] **Step 9: Lint and commit**

```bash
npm run lint --workspace cli
git add cli/src/command-helpers/workspace/document-id-prompt.ts cli/src/command-helpers/workspace/document-id-prompt.spec.ts cli/src/command-helpers/workspace/commands.ts cli/src/command-helpers/workspace/commands.spec.ts
git commit -m "feat(cli): default new document ids from the bundle environment"
```

---

### Task 7: `parseAnyDocumentId` in shared

Consistency checking needs to read the base URL, namespace and domain out of a bare `$id` string. `document-id-utils.ts` already owns the regexes but exposes them only through parsers that need a whole document (and a `title`). This adds one narrow export over the existing private parsers.

**This task modifies `shared/`.** Per `shared/AGENTS.md`, the full test suite must be run before committing.

**Files:**
- Modify: `shared/src/hub/document-id-utils.ts` (add after `namespaceFromDocumentId`, around line 93)
- Modify: `shared/src/hub/document-id-utils.spec.ts`

**Interfaces:**
- Consumes: existing private `parseDocumentId` and `parseControlDocumentId` in the same file.
- Produces:
  - `type ParsedDocumentId` — a discriminated union on `kind`
  - `function parseAnyDocumentId(documentId: string): ParsedDocumentId | null` (null = not a conformant CalmHub id)

- [ ] **Step 1: Write the failing tests**

Add to `shared/src/hub/document-id-utils.spec.ts`, importing `parseAnyDocumentId` alongside the existing imports:

```ts
describe('parseAnyDocumentId', () => {
    it('parses a namespace resource id', () => {
        expect(parseAnyDocumentId('https://calm.corp/calm/namespaces/trading/patterns/gateway/versions/1.2.3')).toEqual({
            kind: 'namespace',
            baseUrl: 'https://calm.corp',
            namespace: 'trading',
            type: 'patterns',
            mapping: 'gateway',
            version: '1.2.3',
        });
    });

    it('parses a control requirement id', () => {
        expect(parseAnyDocumentId('https://calm.corp/calm/domains/security/controls/encryption/requirement/versions/2.0.0')).toEqual({
            kind: 'requirement',
            baseUrl: 'https://calm.corp',
            domain: 'security',
            controlName: 'encryption',
            version: '2.0.0',
        });
    });

    it('parses a control configuration id', () => {
        expect(parseAnyDocumentId('https://calm.corp/calm/domains/security/controls/encryption/configurations/at-rest/versions/2.0.0')).toEqual({
            kind: 'configuration',
            baseUrl: 'https://calm.corp',
            domain: 'security',
            controlName: 'encryption',
            configName: 'at-rest',
            version: '2.0.0',
        });
    });

    it('returns null for a non-conformant id', () => {
        expect(parseAnyDocumentId('adr-0007')).toBeNull();
    });

    it('returns null for a namespace-shaped id with an invalid resource type', () => {
        expect(parseAnyDocumentId('https://calm.corp/calm/namespaces/trading/widgets/gateway/versions/1.0.0')).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd shared && npx vitest run src/hub/document-id-utils.spec.ts`
Expected: FAIL — `parseAnyDocumentId is not a function`.

- [ ] **Step 3: Write the implementation**

Add to `shared/src/hub/document-id-utils.ts`, after `namespaceFromDocumentId`:

```ts
/**
 * A conformant CalmHub `$id`, decomposed. Discriminated on `kind` so callers can branch between
 * namespace-scoped resources and domain-scoped control documents without re-matching the id.
 */
export type ParsedDocumentId =
    | { kind: 'namespace'; baseUrl: string; namespace: string; type: ResourceType; mapping: string; version: string }
    | { kind: 'requirement'; baseUrl: string; domain: string; controlName: string; version: string }
    | { kind: 'configuration'; baseUrl: string; domain: string; controlName: string; configName: string; version: string };

/**
 * Parse any conformant CalmHub `$id` — namespace resource, control requirement or control
 * configuration — without needing the surrounding document.
 *
 * Returns null rather than throwing for ids that are not CalmHub-addressable (flows, ADRs,
 * timelines, external URLs), because callers treat those as "not our concern" rather than an error.
 */
export function parseAnyDocumentId(documentId: string): ParsedDocumentId | null {
    try {
        const m = parseDocumentId(documentId);
        if (m.namespace) {
            return {
                kind: 'namespace',
                baseUrl: m.baseUrl,
                namespace: m.namespace,
                type: m.type,
                mapping: m.mapping,
                version: m.version,
            };
        }
    } catch {
        // not a namespace-resource id - fall through to the control forms
    }

    try {
        const c = parseControlDocumentId(documentId);
        if (c.kind === 'configuration') {
            return {
                kind: 'configuration',
                baseUrl: c.baseUrl,
                domain: c.domain,
                controlName: c.controlName,
                configName: c.configName ?? '',
                version: c.version,
            };
        }
        return {
            kind: 'requirement',
            baseUrl: c.baseUrl,
            domain: c.domain,
            controlName: c.controlName,
            version: c.version,
        };
    } catch {
        return null;
    }
}
```

- [ ] **Step 4: Run the shared tests to verify they pass**

Run: `cd shared && npx vitest run src/hub/document-id-utils.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run the FULL test suite**

Run from the repository root: `npm test`
Expected: PASS. This is mandatory for any `shared/` change — CLI, VSCode extension and widgets all depend on it.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add shared/src/hub/document-id-utils.ts shared/src/hub/document-id-utils.spec.ts
git commit -m "feat(shared): add parseAnyDocumentId for decomposing a CalmHub \$id"
```

---

### Task 8: Environment consistency checking

Do the tracked documents' `$id`s actually belong to the bundle's environment? This is the only protection that works when two environments share a hub URL and differ only by namespace — the case where the `--calm-hub-url` conflict check catches nothing.

Warning on `push`, failure on `check`.

**Files:**
- Create: `cli/src/command-helpers/workspace/environment-consistency.ts`
- Create: `cli/src/command-helpers/workspace/environment-consistency.spec.ts`
- Modify: `cli/src/command-helpers/workspace/commands.ts` (`push` and `check` actions)
- Modify: `cli/src/command-helpers/workspace/commands.spec.ts`

**Interfaces:**
- Consumes: `parseAnyDocumentId` from `@finos/calm-shared/src/hub/document-id-utils` (Task 7); `WorkspaceEnvironment` and `normaliseUrl` from `./environment` (Task 1); `loadManifest`, `resolveFilePath` from `./bundle`.
- Produces:
  - `interface ConsistencyFinding { id: string; documentId: string; reason: string }`
  - `function checkEnvironmentConsistency(bundlePath: string, environment: WorkspaceEnvironment): Promise<ConsistencyFinding[]>`

- [ ] **Step 1: Write the failing tests**

Create `cli/src/command-helpers/workspace/environment-consistency.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import path from 'path';
import { checkEnvironmentConsistency } from './environment-consistency';
import { saveManifest } from './bundle';

describe('checkEnvironmentConsistency', () => {
    const bundlePath = path.join(__dirname, 'test-env-consistency');
    const filesDir = path.join(bundlePath, 'files');

    beforeEach(async () => {
        await rm(bundlePath, { recursive: true, force: true });
        await mkdir(filesDir, { recursive: true });
    });

    afterAll(async () => {
        await rm(bundlePath, { recursive: true, force: true });
    });

    /** Write one document into the bundle and register it in the manifest. */
    async function track(id: string, documentId: string) {
        await writeFile(path.join(filesDir, `${id}.json`), JSON.stringify({ $id: documentId }), 'utf8');
        await saveManifest(bundlePath, { [id]: { path: `files/${id}.json`, type: 'architecture' } });
    }

    it('reports nothing when every id matches the environment', async () => {
        await track('gateway', 'https://calm.corp/calm/namespaces/trading-prod/patterns/gateway/versions/1.0.0');
        const findings = await checkEnvironmentConsistency(bundlePath, {
            url: 'https://calm.corp',
            namespace: 'trading-prod',
        });
        expect(findings).toEqual([]);
    });

    it('reports a base URL that belongs to another hub', async () => {
        await track('gateway', 'https://calm-dev.corp/calm/namespaces/trading-prod/patterns/gateway/versions/1.0.0');
        const findings = await checkEnvironmentConsistency(bundlePath, { url: 'https://calm.corp' });
        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({ id: 'gateway' });
        expect(findings[0].reason).toMatch(/base URL is https:\/\/calm-dev\.corp, expected https:\/\/calm\.corp/);
    });

    it('reports a namespace that belongs to another environment on the same hub', async () => {
        await track('gateway', 'https://calm.corp/calm/namespaces/trading-dev/patterns/gateway/versions/1.0.0');
        const findings = await checkEnvironmentConsistency(bundlePath, {
            url: 'https://calm.corp',
            namespace: 'trading-prod',
        });
        expect(findings).toHaveLength(1);
        expect(findings[0].reason).toMatch(/namespace is 'trading-dev', expected 'trading-prod'/);
    });

    it('ignores the namespace when the environment declares no override', async () => {
        await track('gateway', 'https://calm.corp/calm/namespaces/anything/patterns/gateway/versions/1.0.0');
        const findings = await checkEnvironmentConsistency(bundlePath, { url: 'https://calm.corp' });
        expect(findings).toEqual([]);
    });

    it('reports a control document in the wrong domain', async () => {
        await track('encryption', 'https://calm.corp/calm/domains/security-dev/controls/encryption/requirement/versions/1.0.0');
        const findings = await checkEnvironmentConsistency(bundlePath, {
            url: 'https://calm.corp',
            domain: 'security-prod',
        });
        expect(findings).toHaveLength(1);
        expect(findings[0].reason).toMatch(/domain is 'security-dev', expected 'security-prod'/);
    });

    it('exempts non-conformant ids', async () => {
        await track('adr-0007', 'adr-0007');
        const findings = await checkEnvironmentConsistency(bundlePath, {
            url: 'https://calm.corp',
            namespace: 'trading-prod',
        });
        expect(findings).toEqual([]);
    });

    it('ignores documents whose file is missing or unparseable', async () => {
        await saveManifest(bundlePath, { ghost: { path: 'files/ghost.json', type: 'architecture' } });
        const findings = await checkEnvironmentConsistency(bundlePath, { url: 'https://calm.corp' });
        expect(findings).toEqual([]);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && npx vitest run src/command-helpers/workspace/environment-consistency.spec.ts`
Expected: FAIL — `Failed to resolve import "./environment-consistency"`.

- [ ] **Step 3: Write the implementation**

Create `cli/src/command-helpers/workspace/environment-consistency.ts`:

```ts
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { parseAnyDocumentId } from '@finos/calm-shared/src/hub/document-id-utils';
import { loadManifest, resolveFilePath } from './bundle';
import { WorkspaceEnvironment, normaliseUrl } from './environment';

export interface ConsistencyFinding {
    /** Manifest key of the offending document. */
    id: string;
    /** The document's `$id` as it stands on disk. */
    documentId: string;
    /** Human-readable explanation of the mismatch. */
    reason: string;
}

/**
 * Check that every tracked document's `$id` belongs to the given environment.
 *
 * Documents whose `$id` is not CalmHub-addressable (flows, ADRs, timelines) are exempt — they have
 * no environment to be wrong about. Unreadable or unparseable files are skipped rather than
 * reported, because that is a different problem with its own diagnostics.
 */
export async function checkEnvironmentConsistency(
    bundlePath: string,
    environment: WorkspaceEnvironment
): Promise<ConsistencyFinding[]> {
    const manifest = await loadManifest(bundlePath);
    const findings: ConsistencyFinding[] = [];

    for (const [id, entry] of Object.entries(manifest)) {
        const filePath = resolveFilePath(bundlePath, entry.path);
        if (!existsSync(filePath)) continue;

        let documentId: unknown;
        try {
            documentId = JSON.parse(await readFile(filePath, 'utf8'))?.['$id'];
        } catch {
            continue;
        }
        if (typeof documentId !== 'string') continue;

        const parsed = parseAnyDocumentId(documentId);
        if (!parsed) continue;

        if (normaliseUrl(parsed.baseUrl) !== normaliseUrl(environment.url)) {
            findings.push({
                id,
                documentId,
                reason: `base URL is ${parsed.baseUrl}, expected ${environment.url}`,
            });
            continue;
        }

        if (parsed.kind === 'namespace') {
            if (environment.namespace && parsed.namespace !== environment.namespace) {
                findings.push({
                    id,
                    documentId,
                    reason: `namespace is '${parsed.namespace}', expected '${environment.namespace}'`,
                });
            }
            continue;
        }

        if (environment.domain && parsed.domain !== environment.domain) {
            findings.push({
                id,
                documentId,
                reason: `domain is '${parsed.domain}', expected '${environment.domain}'`,
            });
        }
    }

    return findings;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd cli && npx vitest run src/command-helpers/workspace/environment-consistency.spec.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the failing wiring tests**

In `cli/src/command-helpers/workspace/commands.spec.ts` add the mock:

```ts
        checkEnvironmentConsistency: vi.fn<() => Promise<Array<{ id: string; documentId: string; reason: string }>>>(async () => []),
```

```ts
vi.mock('./environment-consistency', () => ({ checkEnvironmentConsistency: mocks.checkEnvironmentConsistency }));
```

and the tests:

```ts
    describe('environment consistency', () => {
        const finding = { id: 'gateway', documentId: 'https://dev/x', reason: 'base URL is https://dev, expected https://prod' };

        it('push warns but still pushes when a document belongs elsewhere', async () => {
            mocks.checkEnvironmentConsistency.mockResolvedValueOnce([finding]);
            await program.parseAsync(['node', 'test', 'workspace', 'push']);
            expect(mocks.pushWorkspaceToHub).toHaveBeenCalled();
            expect(exitSpy).not.toHaveBeenCalled();
        });

        it('check fails when a document belongs elsewhere', async () => {
            mocks.checkEnvironmentConsistency.mockResolvedValueOnce([finding]);
            await expect(program.parseAsync(['node', 'test', 'workspace', 'check'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('does not check consistency when the bundle has no environment', async () => {
            mocks.resolveWorkspaceHub.mockResolvedValueOnce({
                calmHubOptions: { calmHubUrl: 'https://from-user-config' },
                environmentLabel: undefined,
                environment: undefined,
            });
            await program.parseAsync(['node', 'test', 'workspace', 'push']);
            expect(mocks.checkEnvironmentConsistency).not.toHaveBeenCalled();
        });
    });
```

- [ ] **Step 6: Run to verify they fail**

Run: `cd cli && npx vitest run src/command-helpers/workspace/commands.spec.ts`
Expected: FAIL — `checkEnvironmentConsistency` is never called and `check` exits 0.

- [ ] **Step 7: Wire it into `push` and `check`**

Add the import to `cli/src/command-helpers/workspace/commands.ts`:

```ts
import { checkEnvironmentConsistency } from './environment-consistency';
```

In the `push` action, after the `resolveHubAndAnnounce` call, destructure `environment` from the resolution and add:

```ts
                if (environment) {
                    for (const finding of await checkEnvironmentConsistency(bundlePath, environment)) {
                        logger.warn(`'${finding.id}' does not belong to this environment: ${finding.reason}`);
                    }
                }
```

In the `check` action, after the resolution, add:

```ts
                let inconsistent = false;
                if (environment) {
                    const findings = await checkEnvironmentConsistency(bundlePath, environment);
                    if (findings.length > 0) {
                        inconsistent = true;
                        logger.error(`${findings.length} document(s) do not belong to this environment:`);
                        for (const finding of findings) {
                            logger.error(`  ${finding.id}: ${finding.reason}`);
                        }
                    }
                }
```

and include it in `check`'s existing exit condition:

```ts
                if (needsBump || validationFailed || inconsistent) {
                    process.exit(1);
                }
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd cli && npx vitest run src/command-helpers/workspace/commands.spec.ts`
Expected: PASS.

- [ ] **Step 9: Lint and commit**

```bash
npm run lint --workspace cli
git add cli/src/command-helpers/workspace/environment-consistency.ts cli/src/command-helpers/workspace/environment-consistency.spec.ts cli/src/command-helpers/workspace/commands.ts cli/src/command-helpers/workspace/commands.spec.ts
git commit -m "feat(cli): warn on push and fail on check when documents leave their environment"
```

---

### Task 9: Annotate `list`, `show` and `switch`

Make the environment visible in the commands people use to orient themselves.

**Files:**
- Modify: `cli/src/command-helpers/workspace/commands.ts` (`list`, `show`, `switch` actions)
- Modify: `cli/src/command-helpers/workspace/commands.spec.ts`

**Interfaces:**
- Consumes: `loadBundleMetadata` (Task 2), `getWorkspaceBundlePath` from `./workspace`.
- Produces: no new exported functions.

- [ ] **Step 1: Write the failing tests**

Add to `cli/src/command-helpers/workspace/commands.spec.ts`:

```ts
    describe('environment annotations', () => {
        it('list reads each bundle\'s environment', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'list']);
            expect(mocks.loadBundleMetadata).toHaveBeenCalledTimes(2); // 'default' and 'other'
        });

        it('list still works when a bundle has no environment', async () => {
            mocks.loadBundleMetadata.mockResolvedValue(undefined);
            await program.parseAsync(['node', 'test', 'workspace', 'list']);
            expect(exitSpy).not.toHaveBeenCalled();
        });

        it('show reads the active bundle\'s environment', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'show']);
            expect(mocks.loadBundleMetadata).toHaveBeenCalledWith('/fake/bundle');
        });

        it('switch reads the target bundle\'s environment', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'switch', 'other']);
            expect(mocks.setActiveWorkspace).toHaveBeenCalledWith('/fake/repo', 'other');
            expect(mocks.loadBundleMetadata).toHaveBeenCalled();
        });
    });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd cli && npx vitest run src/command-helpers/workspace/commands.spec.ts`
Expected: FAIL — `loadBundleMetadata` is not called by these commands.

- [ ] **Step 3: Annotate `list`**

In the `list` action, replace the loop body:

```ts
                logger.info('Available workspaces:');
                for (const ws of workspaces) {
                    const label = (await loadBundleMetadata(getWorkspaceBundlePath(gitRoot, ws)))?.environment;
                    const suffix = label ? ` (${label})` : '';
                    logger.info(`${ws === activeWorkspace ? '*' : ' '} ${ws}${suffix}`);
                }
```

- [ ] **Step 4: Annotate `show` and `switch`**

In the `show` action, after `logger.info(activeWorkspace);`, add:

```ts
                const bundlePath = findWorkspaceManifestPath(process.cwd());
                if (bundlePath) {
                    const label = (await loadBundleMetadata(bundlePath))?.environment;
                    if (label) {
                        const environments = validateEnvironments((await loadWorkspaceConfig(gitRoot)).environments);
                        logger.info(`Environment: ${describeEnvironment(label, resolveEnvironment(environments, label))}`);
                    } else {
                        logger.info('Environment: none');
                    }
                }
```

and remove the now-duplicated `const bundlePath = findWorkspaceManifestPath(process.cwd());` further down in that action, reusing this one.

In the `switch` action, replace the success log:

```ts
                await setActiveWorkspace(gitRoot, name);
                const label = (await loadBundleMetadata(getWorkspaceBundlePath(gitRoot, name)))?.environment;
                logger.info(`Switched to workspace '${name}'${label ? ` (${label})` : ''}.`);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd cli && npx vitest run src/command-helpers/workspace/commands.spec.ts`
Expected: PASS. Note `show` calls `loadWorkspaceConfig`, whose mock already returns environments including `dev`.

- [ ] **Step 6: Run the whole CLI suite with coverage**

Run: `npm test --workspace cli -- --coverage`
Expected: PASS, with the new modules above 80% coverage.

- [ ] **Step 7: Lint and commit**

```bash
npm run lint --workspace cli
git add cli/src/command-helpers/workspace/commands.ts cli/src/command-helpers/workspace/commands.spec.ts
git commit -m "feat(cli): show the environment in workspace list, show and switch"
```

---

### Task 10: Documentation

**Files:**
- Modify: `cli/AGENTS.md` (the `workspace` entry under "Key Commands", around the `10. **workspace**` bullet)
- Modify: `cli/README.md` (workspace command reference)

**Interfaces:**
- Consumes: everything above. Produces: no code.

- [ ] **Step 1: Update `cli/AGENTS.md`**

In the `10. **workspace**` bullet, add `environment` to the subcommand list and append these bullets after the `workspace bump` bullet:

```markdown
    - `workspace environment` — show the active bundle's environment; `environment list` lists the environments declared in `.calm-workspace/config.json` and which bundles use each; `environment show [label]` resolves one; `environment set <label>` / `environment unset` change the active bundle's environment. `workspace init <name> --environment <label>` sets it at creation time.
    - **Environments.** `.calm-workspace/config.json` may declare an `environments` block mapping a label to `{ url, namespace?, domain? }`. `url` is required; `namespace` applies to namespace resources and `domain` to control documents, and omitting either means "keep whatever the document has". A bundle records its label in `.calm-workspace/bundles/<name>/bundle.json`; a bundle without that file has no environment and behaves exactly as bundles did before this feature.
    - **Hub resolution order** for `push`, `check` and `bump`: explicit `--calm-hub-url`, then the bundle's environment URL, then `~/.calm.json`/`CALM_HUB_URL`. A `--calm-hub-url` that disagrees with the bundle's environment is an error. `push --expect-environment <label>` fails unless the active bundle belongs to that environment (a CI guard). `check --environment <label>` dry-checks against another environment; `push` and `bump` reject `--environment` because they act on the bundle's own environment.
    - **Consistency.** When a bundle has an environment, `push` warns and `check` fails if any tracked document's `$id` belongs to a different base URL, namespace or domain. Non-CalmHub `$id`s (flow, adr, timeline) are exempt.
```

- [ ] **Step 2: Update `cli/README.md`**

Add a `### Environments` subsection to the `workspace` command documentation containing: the `environments` config example from the spec's Configuration section, the `calm workspace environment` command list from the spec's Command surface section, and the "Setup 1" walkthrough from the spec's End-to-end walkthroughs section (omitting the `migrate` and CI steps, which arrive with the next plan).

- [ ] **Step 3: Verify the docs match the implementation**

Run: `cd cli && npx tsx src/index.ts workspace environment --help` (or `npm run link:cli` from the root, then `calm workspace environment --help`)
Expected: the subcommands and descriptions match what the docs claim. Fix whichever is wrong.

- [ ] **Step 4: Full verification before opening the PR**

```bash
npm test -- --coverage
npm run lint
npm run build
```
Expected: all PASS. Report any failure rather than proceeding.

- [ ] **Step 5: Commit and open the PR**

```bash
git add cli/AGENTS.md cli/README.md
git commit -m "docs(cli): document workspace environments"
git push -u origin feat/workspace-environments
```

Then open a PR using the repository template at `.github/pull_request_template.md`, populating every section accurately.
