# Workspace Migrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `calm workspace migrate <environment>`, which promotes every document tracked in a workspace bundle from one CalmHub environment to another — rewriting `$id`s and inter-document references, re-deriving each version against the target hub, and materialising the result as a reviewable bundle on disk without publishing anything.

**Architecture:** Two phases. **Resolve** does all hub traffic and every decision, processing documents in dependency order so a document's references point at its dependencies' *target* versions; nothing is written until every document resolves. **Write** materialises the target bundle, runs one final reference pass with the complete source→target id map, and records provenance in the manifest. Publishing stays with `workspace push`.

**Tech Stack:** TypeScript 5.8+, Commander.js 14, Vitest, npm workspaces, Node 26.

**Spec:** `docs/superpowers/specs/2026-08-14-workspace-migrate-design.md`

**Depends on:** `docs/superpowers/plans/2026-08-17-workspace-environments.md` must be merged first. This plan uses `WorkspaceEnvironment`, `validateEnvironments`, `resolveEnvironment`, `normaliseUrl` (`environment.ts`), `loadBundleMetadata`/`saveBundleMetadata` (`bundle-metadata.ts`), `resolveWorkspaceHub` (`hub-resolution.ts`), `parseAnyDocumentId` (shared), and the `requireBundlePath`/`requireGitRoot` helpers in `commands.ts` — none of which exist without it.

## Global Constraints

- **Node 26 is required.** Run `node --version`; it MUST show `v26.x.x`. If not, run `nvm use` (`.nvmrc` pins `26.3.1`).
- **Run all npm commands from the repository root**, using workspaces: `npm test --workspace cli`.
- **Single-file test runs** from the `cli` directory or below so `vitest.config.mts` resolves: `cd cli && npx vitest run src/command-helpers/workspace/<file>.spec.ts`.
- **Never use bare `vitest`** — always `vitest run`.
- **Never commit to `main`.** Create a feature branch first (Task 0).
- **Conventional Commits**, enforced by commitlint + husky. No period at the end of the subject.
- **Do NOT add `Co-Authored-By` trailers to commits.** They break the CLA check in CI.
- **Coverage on new code must exceed 80%.**
- **Lint must pass with 0 errors:** `npm run lint --workspace cli`.
- **`migrate` never publishes.** No task in this plan may call `client.createMappedResourceVersion`, `client.createControlRequirementVersion` or `client.createControlConfigurationVersion`. Every hub call is a read.
- **`migrate` never writes before resolving.** A hub failure or an unparseable document must leave the working tree untouched.

---

### Task 0: Feature branch

**Files:** none

- [ ] **Step 1: Verify Node version and that the environments work is present**

Run: `node --version`
Expected: `v26.x.x`.

Run: `cd cli && npx vitest run src/command-helpers/workspace/hub-resolution.spec.ts`
Expected: PASS. If this file does not exist, stop — the prerequisite plan has not been merged.

- [ ] **Step 2: Create the feature branch**

```bash
git checkout -b feat/workspace-migrate
```

- [ ] **Step 3: Confirm a clean baseline**

Run: `npm test --workspace cli`
Expected: PASS.

---

### Task 1: Rewrite a `$id` for a target environment

The pure transformation at the heart of promotion: take a source `$id`, produce the equivalent `$id` in another environment. Base URL is replaced; namespace or domain are replaced only when the environment declares an override; resource type, mapping id, control name and config name are always preserved.

**Files:**
- Modify: `cli/src/command-helpers/workspace/environment.ts` (append)
- Modify: `cli/src/command-helpers/workspace/environment.spec.ts` (append)

**Interfaces:**
- Consumes: `parseAnyDocumentId`, `constructDocumentId`, `constructControlDocumentId` from `@finos/calm-shared/src/hub/document-id-utils`; `WorkspaceEnvironment` from this module.
- Produces: `function rewriteDocumentIdForEnvironment(documentId: string, environment: WorkspaceEnvironment, version?: string): string | null` — null when the id is not CalmHub-conformant. When `version` is omitted the source version is kept.

- [ ] **Step 1: Write the failing tests**

Append to `cli/src/command-helpers/workspace/environment.spec.ts`:

```ts
import { rewriteDocumentIdForEnvironment } from './environment';

describe('rewriteDocumentIdForEnvironment', () => {
    const sourceNamespaceId = 'https://calm-dev.corp/calm/namespaces/trading/patterns/gateway/versions/1.3.0';
    const sourceRequirementId = 'https://calm-dev.corp/calm/domains/security/controls/encryption/requirement/versions/1.3.0';
    const sourceConfigId = 'https://calm-dev.corp/calm/domains/security/controls/encryption/configurations/at-rest/versions/1.3.0';

    it('replaces the base URL and keeps the version when none is given', () => {
        expect(rewriteDocumentIdForEnvironment(sourceNamespaceId, { url: 'https://calm.corp' }))
            .toBe('https://calm.corp/calm/namespaces/trading/patterns/gateway/versions/1.3.0');
    });

    it('applies the namespace override and the new version', () => {
        expect(rewriteDocumentIdForEnvironment(sourceNamespaceId, { url: 'https://calm.corp', namespace: 'trading-prod' }, '4.1.0'))
            .toBe('https://calm.corp/calm/namespaces/trading-prod/patterns/gateway/versions/4.1.0');
    });

    it('leaves the namespace alone when the environment declares no override', () => {
        expect(rewriteDocumentIdForEnvironment(sourceNamespaceId, { url: 'https://calm.corp', domain: 'security-prod' }, '2.0.0'))
            .toBe('https://calm.corp/calm/namespaces/trading/patterns/gateway/versions/2.0.0');
    });

    it('applies the domain override to a control requirement', () => {
        expect(rewriteDocumentIdForEnvironment(sourceRequirementId, { url: 'https://calm.corp', domain: 'security-prod' }, '2.0.0'))
            .toBe('https://calm.corp/calm/domains/security-prod/controls/encryption/requirement/versions/2.0.0');
    });

    it('applies the domain override to a control configuration and keeps the config name', () => {
        expect(rewriteDocumentIdForEnvironment(sourceConfigId, { url: 'https://calm.corp', domain: 'security-prod' }, '2.0.0'))
            .toBe('https://calm.corp/calm/domains/security-prod/controls/encryption/configurations/at-rest/versions/2.0.0');
    });

    it('ignores a namespace override for a control document', () => {
        expect(rewriteDocumentIdForEnvironment(sourceRequirementId, { url: 'https://calm.corp', namespace: 'trading-prod' }))
            .toBe('https://calm.corp/calm/domains/security/controls/encryption/requirement/versions/1.3.0');
    });

    it('returns null for a non-conformant id', () => {
        expect(rewriteDocumentIdForEnvironment('adr-0007', { url: 'https://calm.corp' })).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && npx vitest run src/command-helpers/workspace/environment.spec.ts`
Expected: FAIL — `rewriteDocumentIdForEnvironment is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `cli/src/command-helpers/workspace/environment.ts`, adding the import at the top of the file:

```ts
import {
    parseAnyDocumentId,
    constructDocumentId,
    constructControlDocumentId,
} from '@finos/calm-shared/src/hub/document-id-utils';
```

```ts
/**
 * Produce the equivalent `$id` for a document in another environment.
 *
 * The base URL always changes. The namespace changes only when the environment declares a
 * `namespace` (and only for namespace resources); the domain only when it declares a `domain` (and
 * only for control documents). Everything that identifies *which* document this is — resource type,
 * mapping id, control name, config name — is preserved.
 *
 * @param version New version, or omitted to keep the source version.
 * @returns The rewritten `$id`, or null when the input is not a conformant CalmHub id (flows, ADRs
 *          and timelines are promoted verbatim rather than rewritten).
 */
export function rewriteDocumentIdForEnvironment(
    documentId: string,
    environment: WorkspaceEnvironment,
    version?: string
): string | null {
    const parsed = parseAnyDocumentId(documentId);
    if (!parsed) return null;

    if (parsed.kind === 'namespace') {
        return constructDocumentId({
            rawDocumentId: '',
            baseUrl: environment.url,
            namespace: environment.namespace ?? parsed.namespace,
            type: parsed.type,
            mapping: parsed.mapping,
            version: version ?? parsed.version,
            name: '',
        });
    }

    return constructControlDocumentId({
        rawDocumentId: '',
        baseUrl: environment.url,
        domain: environment.domain ?? parsed.domain,
        controlName: parsed.controlName,
        configName: parsed.kind === 'configuration' ? parsed.configName : undefined,
        kind: parsed.kind,
        version: version ?? parsed.version,
    });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd cli && npx vitest run src/command-helpers/workspace/environment.spec.ts`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint --workspace cli
git add cli/src/command-helpers/workspace/environment.ts cli/src/command-helpers/workspace/environment.spec.ts
git commit -m "feat(cli): rewrite a document \$id for a target environment"
```

---

### Task 2: Cross-environment reference rules

`buildRefRulesFromDiskIds` derives its rules from a bundle's *own* `$id`s, so it is a no-op for cross-environment rewriting — the rules must map source ids to target ids explicitly. The rule shape and the `replaceRefsInObject` walker are reused unchanged.

**Files:**
- Create: `cli/src/command-helpers/workspace/migrate-refs.ts`
- Create: `cli/src/command-helpers/workspace/migrate-refs.spec.ts`

**Interfaces:**
- Consumes: `RefRule`, `stripVersionSuffix`, `replaceRefsInObject` from `./ref-rewrite`.
- Produces:
  - `interface IdMapping { bareId: string; sourceDocumentId: string; targetDocumentId: string }`
  - `function buildCrossEnvironmentRefRules(mappings: IdMapping[]): RefRule[]`
  - `function applyRefRules(json: unknown, rules: RefRule[]): { updated: unknown; changeCount: number }`

- [ ] **Step 1: Write the failing tests**

Create `cli/src/command-helpers/workspace/migrate-refs.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildCrossEnvironmentRefRules, applyRefRules } from './migrate-refs';

const mappings = [{
    bareId: 'gateway',
    sourceDocumentId: 'https://calm-dev.corp/calm/namespaces/trading/patterns/gateway/versions/1.3.0',
    targetDocumentId: 'https://calm.corp/calm/namespaces/trading-prod/patterns/gateway/versions/4.1.0',
}];

describe('buildCrossEnvironmentRefRules', () => {
    it('keys rules on the bare id and the version-stripped source path', () => {
        expect(buildCrossEnvironmentRefRules(mappings)).toEqual([{
            bareId: 'gateway',
            targetPath: 'https://calm.corp/calm/namespaces/trading-prod/patterns/gateway/versions/4.1.0',
            basePath: 'https://calm-dev.corp/calm/namespaces/trading/patterns/gateway',
        }]);
    });
});

describe('applyRefRules', () => {
    const rules = buildCrossEnvironmentRefRules(mappings);

    it('rewrites a versioned full-URL $ref across hosts and versions', () => {
        const { updated, changeCount } = applyRefRules(
            { nodes: [{ $ref: 'https://calm-dev.corp/calm/namespaces/trading/patterns/gateway/versions/1.3.0' }] },
            rules
        );
        expect(changeCount).toBe(1);
        expect(updated).toEqual({
            nodes: [{ $ref: 'https://calm.corp/calm/namespaces/trading-prod/patterns/gateway/versions/4.1.0' }],
        });
    });

    it('preserves a fragment on the reference', () => {
        const { updated } = applyRefRules(
            { $ref: 'https://calm-dev.corp/calm/namespaces/trading/patterns/gateway/versions/1.3.0#/nodes/0' },
            rules
        );
        expect(updated).toEqual({
            $ref: 'https://calm.corp/calm/namespaces/trading-prod/patterns/gateway/versions/4.1.0#/nodes/0',
        });
    });

    it('rewrites a bare id reference', () => {
        const { updated, changeCount } = applyRefRules({ $ref: 'gateway' }, rules);
        expect(changeCount).toBe(1);
        expect(updated).toEqual({
            $ref: 'https://calm.corp/calm/namespaces/trading-prod/patterns/gateway/versions/4.1.0',
        });
    });

    it('rewrites the JSON Schema const form', () => {
        const { updated } = applyRefRules(
            { 'requirement-url': { const: 'https://calm-dev.corp/calm/namespaces/trading/patterns/gateway/versions/1.3.0' } },
            rules
        );
        expect(updated).toEqual({
            'requirement-url': { const: 'https://calm.corp/calm/namespaces/trading-prod/patterns/gateway/versions/4.1.0' },
        });
    });

    it('leaves untracked references untouched', () => {
        const doc = { $schema: 'https://calm.finos.org/release/1.0/meta/calm.json' };
        const { updated, changeCount } = applyRefRules(doc, rules);
        expect(changeCount).toBe(0);
        expect(updated).toEqual(doc);
    });

    it('is idempotent - a second pass changes nothing', () => {
        const first = applyRefRules({ $ref: 'gateway' }, rules);
        const second = applyRefRules(first.updated, rules);
        expect(second.changeCount).toBe(0);
        expect(second.updated).toEqual(first.updated);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && npx vitest run src/command-helpers/workspace/migrate-refs.spec.ts`
Expected: FAIL — `Failed to resolve import "./migrate-refs"`.

- [ ] **Step 3: Write the implementation**

Create `cli/src/command-helpers/workspace/migrate-refs.ts`:

```ts
import { RefRule, stripVersionSuffix, replaceRefsInObject } from './ref-rewrite';

/** One document's identity in both environments. */
export interface IdMapping {
    /** Manifest key, so bare-id references are caught too. */
    bareId: string;
    sourceDocumentId: string;
    targetDocumentId: string;
}

/**
 * Build rewrite rules that repoint references from source-environment ids to target-environment
 * ids.
 *
 * This cannot reuse `buildRefRulesFromDiskIds`: that derives rules from a bundle's own `$id`s, so
 * across environments it would map target ids to themselves and change nothing. Here `basePath`
 * comes from the *source* id (what references currently say) and `targetPath` from the *target* id
 * (what they should say), which is what makes `resolveNewRef` match both exact-version and
 * unversioned reference forms.
 */
export function buildCrossEnvironmentRefRules(mappings: IdMapping[]): RefRule[] {
    return mappings.map(m => ({
        bareId: m.bareId,
        targetPath: m.targetDocumentId,
        basePath: stripVersionSuffix(m.sourceDocumentId),
    }));
}

/** Apply rules to a parsed document, reporting how many references changed. */
export function applyRefRules(json: unknown, rules: RefRule[]): { updated: unknown; changeCount: number } {
    const replacements: Array<{ oldRef: string; newRef: string }> = [];
    const updated = replaceRefsInObject(json, rules, replacements);
    return { updated, changeCount: replacements.length };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd cli && npx vitest run src/command-helpers/workspace/migrate-refs.spec.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint --workspace cli
git add cli/src/command-helpers/workspace/migrate-refs.ts cli/src/command-helpers/workspace/migrate-refs.spec.ts
git commit -m "feat(cli): build cross-environment reference rewrite rules"
```

---

### Task 3: Uniform target-hub resource access

The three `$id` families use three different pairs of client methods. `migrate` treats them identically, so this collapses them behind one interface.

**Files:**
- Create: `cli/src/command-helpers/workspace/hub-resource.ts`
- Create: `cli/src/command-helpers/workspace/hub-resource.spec.ts`

**Interfaces:**
- Consumes: `CalmHubClient` from `@finos/calm-shared/src/hub/calm-hub-client`; `parseAnyDocumentId` from `@finos/calm-shared/src/hub/document-id-utils`.
- Produces:
  - `interface HubResourceAccessor { listVersions(): Promise<string[]>; getVersion(version: string): Promise<object> }`
  - `function getHubResourceAccessor(client: CalmHubClient, documentId: string): HubResourceAccessor | null` — null for a non-conformant id.

- [ ] **Step 1: Write the failing tests**

Create `cli/src/command-helpers/workspace/hub-resource.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { getHubResourceAccessor } from './hub-resource';
import type { CalmHubClient } from '@finos/calm-shared/src/hub/calm-hub-client';

function fakeClient() {
    return {
        getMappedResourceVersions: vi.fn(async () => ['1.0.0']),
        getMappedResourceByVersion: vi.fn(async () => ({ kind: 'namespace-doc' })),
        getControlRequirementVersions: vi.fn(async () => ['2.0.0']),
        getControlRequirementVersion: vi.fn(async () => ({ kind: 'requirement-doc' })),
        getControlConfigurationVersions: vi.fn(async () => ['3.0.0']),
        getControlConfigurationVersion: vi.fn(async () => ({ kind: 'configuration-doc' })),
    } as unknown as CalmHubClient & Record<string, ReturnType<typeof vi.fn>>;
}

describe('getHubResourceAccessor', () => {
    it('addresses a namespace resource by namespace, mapping and type', async () => {
        const client = fakeClient();
        const accessor = getHubResourceAccessor(client, 'https://calm.corp/calm/namespaces/trading/patterns/gateway/versions/1.0.0')!;

        expect(await accessor.listVersions()).toEqual(['1.0.0']);
        expect(client.getMappedResourceVersions).toHaveBeenCalledWith('trading', 'gateway', 'patterns');

        expect(await accessor.getVersion('1.0.0')).toEqual({ kind: 'namespace-doc' });
        expect(client.getMappedResourceByVersion).toHaveBeenCalledWith('trading', 'gateway', '1.0.0', 'patterns');
    });

    it('addresses a control requirement by domain and control name', async () => {
        const client = fakeClient();
        const accessor = getHubResourceAccessor(client, 'https://calm.corp/calm/domains/security/controls/encryption/requirement/versions/2.0.0')!;

        expect(await accessor.listVersions()).toEqual(['2.0.0']);
        expect(client.getControlRequirementVersions).toHaveBeenCalledWith('security', 'encryption');

        expect(await accessor.getVersion('2.0.0')).toEqual({ kind: 'requirement-doc' });
        expect(client.getControlRequirementVersion).toHaveBeenCalledWith('security', 'encryption', '2.0.0');
    });

    it('addresses a control configuration by domain, control name and config name', async () => {
        const client = fakeClient();
        const accessor = getHubResourceAccessor(client, 'https://calm.corp/calm/domains/security/controls/encryption/configurations/at-rest/versions/3.0.0')!;

        expect(await accessor.listVersions()).toEqual(['3.0.0']);
        expect(client.getControlConfigurationVersions).toHaveBeenCalledWith('security', 'encryption', 'at-rest');

        expect(await accessor.getVersion('3.0.0')).toEqual({ kind: 'configuration-doc' });
        expect(client.getControlConfigurationVersion).toHaveBeenCalledWith('security', 'encryption', 'at-rest', '3.0.0');
    });

    it('returns null for a non-conformant id', () => {
        expect(getHubResourceAccessor(fakeClient(), 'adr-0007')).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && npx vitest run src/command-helpers/workspace/hub-resource.spec.ts`
Expected: FAIL — `Failed to resolve import "./hub-resource"`.

- [ ] **Step 3: Write the implementation**

Create `cli/src/command-helpers/workspace/hub-resource.ts`:

```ts
import { CalmHubClient } from '@finos/calm-shared/src/hub/calm-hub-client';
import { parseAnyDocumentId } from '@finos/calm-shared/src/hub/document-id-utils';

/** Read-only access to one CalmHub resource's version history. */
export interface HubResourceAccessor {
    listVersions(): Promise<string[]>;
    getVersion(version: string): Promise<object>;
}

/**
 * Address the resource a `$id` names, whichever of the three `$id` families it belongs to.
 *
 * Deliberately read-only: `migrate` materialises to disk and never publishes, so no create method
 * is exposed here.
 *
 * @returns null when the id is not CalmHub-addressable.
 */
export function getHubResourceAccessor(client: CalmHubClient, documentId: string): HubResourceAccessor | null {
    const parsed = parseAnyDocumentId(documentId);
    if (!parsed) return null;

    if (parsed.kind === 'namespace') {
        return {
            listVersions: () => client.getMappedResourceVersions(parsed.namespace, parsed.mapping, parsed.type),
            getVersion: (version: string) =>
                client.getMappedResourceByVersion(parsed.namespace, parsed.mapping, version, parsed.type),
        };
    }

    if (parsed.kind === 'requirement') {
        return {
            listVersions: () => client.getControlRequirementVersions(parsed.domain, parsed.controlName),
            getVersion: (version: string) =>
                client.getControlRequirementVersion(parsed.domain, parsed.controlName, version),
        };
    }

    return {
        listVersions: () => client.getControlConfigurationVersions(parsed.domain, parsed.controlName, parsed.configName),
        getVersion: (version: string) =>
            client.getControlConfigurationVersion(parsed.domain, parsed.controlName, parsed.configName, version),
    };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd cli && npx vitest run src/command-helpers/workspace/hub-resource.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint --workspace cli
git add cli/src/command-helpers/workspace/hub-resource.ts cli/src/command-helpers/workspace/hub-resource.spec.ts
git commit -m "feat(cli): add uniform read access to CalmHub resource versions"
```

---

### Task 4: Manifest provenance and target bundle naming

Two small, independent pieces the resolve phase needs: the manifest fields that record what was promoted from where, and the default target bundle name.

**Files:**
- Modify: `cli/src/command-helpers/workspace/bundle.ts:68-73` (`WorkspaceManifestEntry`)
- Modify: `cli/src/command-helpers/workspace/bundle.spec.ts` (append)
- Create: `cli/src/command-helpers/workspace/migrate.ts` (first export only)
- Create: `cli/src/command-helpers/workspace/migrate.spec.ts` (first describe only)

**Interfaces:**
- Produces:
  - `WorkspaceManifestEntry` gains `promotedFrom?: { bundle: string; env: string; version: string }` and `promotedAs?: string`
  - `function deriveTargetBundleName(sourceBundleName: string, sourceEnvironment: string, targetEnvironment: string): string`

- [ ] **Step 1: Write the failing tests**

Append to `cli/src/command-helpers/workspace/bundle.spec.ts` (inside the existing top-level describe, or as a new one):

```ts
describe('manifest provenance', () => {
    const bundlePath = path.join(__dirname, 'test-manifest-provenance');

    beforeEach(async () => {
        await rm(bundlePath, { recursive: true, force: true });
        await mkdir(bundlePath, { recursive: true });
    });

    afterAll(async () => {
        await rm(bundlePath, { recursive: true, force: true });
    });

    it('preserves provenance fields through a save/load round trip', async () => {
        const entry = {
            path: 'files/gateway.json',
            type: 'architecture' as const,
            namespace: 'trading-prod',
            promotedFrom: { bundle: 'trading', env: 'dev', version: '1.3.0' },
            promotedAs: '4.1.0',
        };
        await saveManifest(bundlePath, { gateway: entry });
        expect(await loadManifest(bundlePath)).toEqual({ gateway: entry });
    });
});
```

This block needs `path`, `mkdir`, `rm`, `beforeEach` and `afterAll` imported in `bundle.spec.ts`; add whichever are not already there.

Create `cli/src/command-helpers/workspace/migrate.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveTargetBundleName } from './migrate';

describe('deriveTargetBundleName', () => {
    it('appends the target environment', () => {
        expect(deriveTargetBundleName('trading', 'dev', 'prod')).toBe('trading-prod');
    });

    it('strips a trailing source-environment suffix before appending', () => {
        expect(deriveTargetBundleName('trading-qa', 'qa', 'prod')).toBe('trading-prod');
    });

    it('leaves a name that merely contains the environment name alone', () => {
        expect(deriveTargetBundleName('qa-trading', 'qa', 'prod')).toBe('qa-trading-prod');
    });

    it('does not strip a suffix that is not the source environment', () => {
        expect(deriveTargetBundleName('trading-dev', 'qa', 'prod')).toBe('trading-dev-prod');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && npx vitest run src/command-helpers/workspace/migrate.spec.ts src/command-helpers/workspace/bundle.spec.ts`
Expected: FAIL — `Failed to resolve import "./migrate"`. The manifest test may already pass, because `loadManifest` preserves any object entry that has a string `path`; keep it as a regression guard either way.

- [ ] **Step 3: Add the provenance fields**

In `cli/src/command-helpers/workspace/bundle.ts`, extend `WorkspaceManifestEntry`:

```ts
export type WorkspaceManifestEntry = {
    path: string;
    type: WorkspaceDocumentType;
    namespace?: string;
    calmHubId?: string;
    /** Set by `workspace migrate`: where this document was promoted from. */
    promotedFrom?: { bundle: string; env: string; version: string };
    /** Set by `workspace migrate`: the version this document was promoted as. */
    promotedAs?: string;
};
```

- [ ] **Step 4: Add `deriveTargetBundleName`**

Create `cli/src/command-helpers/workspace/migrate.ts`:

```ts
/**
 * Default name for the bundle a promotion produces.
 *
 * A trailing `-<sourceEnvironment>` is stripped first so repeated promotions do not accumulate
 * suffixes: `trading` (dev) and `trading-qa` (qa) both promote to `trading-prod`.
 */
export function deriveTargetBundleName(
    sourceBundleName: string,
    sourceEnvironment: string,
    targetEnvironment: string
): string {
    const suffix = `-${sourceEnvironment}`;
    const stem = sourceBundleName.endsWith(suffix)
        ? sourceBundleName.slice(0, -suffix.length)
        : sourceBundleName;
    return `${stem}-${targetEnvironment}`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd cli && npx vitest run src/command-helpers/workspace/migrate.spec.ts src/command-helpers/workspace/bundle.spec.ts`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint --workspace cli
git add cli/src/command-helpers/workspace/bundle.ts cli/src/command-helpers/workspace/bundle.spec.ts cli/src/command-helpers/workspace/migrate.ts cli/src/command-helpers/workspace/migrate.spec.ts
git commit -m "feat(cli): add promotion provenance to the workspace manifest"
```

---

### Task 5: Target-state primitives — drift and the unchanged comparison

Three pure decisions, separated from the orchestration that uses them so each can be tested directly. The unchanged comparison is the subtle one: a promoted document's `$id` always differs from the target hub's latest by version, so comparing them raw would report a difference every time. Setting the candidate's `$id` to the target's before comparing is what makes re-running `migrate` idempotent.

**Files:**
- Modify: `cli/src/command-helpers/workspace/migrate.ts` (append)
- Modify: `cli/src/command-helpers/workspace/migrate.spec.ts` (append)

**Interfaces:**
- Consumes: `canonicalEqual` from `@finos/calm-shared/src/hub/canonical`; `sortSemVer` from `@finos/calm-shared/src/hub/semver`; `HubResourceAccessor` from `./hub-resource` (Task 3).
- Produces:
  - `interface TargetState { latestVersion?: string; latestDocument?: object }`
  - `function fetchTargetState(accessor: HubResourceAccessor): Promise<TargetState>`
  - `function matchesTargetLatest(candidate: object, target: TargetState, targetLatestId: string): boolean`
  - `interface Drift { recorded: string; actual: string }`
  - `function detectDrift(recordedPromotedAs: string | undefined, actualLatest: string | undefined): Drift | undefined`

- [ ] **Step 1: Write the failing tests**

Append to `cli/src/command-helpers/workspace/migrate.spec.ts`:

```ts
import { fetchTargetState, matchesTargetLatest, detectDrift } from './migrate';

describe('fetchTargetState', () => {
    it('reports no latest version when the resource is new in the target', async () => {
        const accessor = {
            listVersions: async () => [],
            getVersion: async () => { throw new Error('should not be called'); },
        };
        expect(await fetchTargetState(accessor)).toEqual({});
    });

    it('returns the highest semver version and its document', async () => {
        const accessor = {
            listVersions: async () => ['1.0.0', '10.0.0', '2.0.0'],
            getVersion: async (v: string) => ({ version: v }),
        };
        expect(await fetchTargetState(accessor)).toEqual({
            latestVersion: '10.0.0',
            latestDocument: { version: '10.0.0' },
        });
    });
});

describe('matchesTargetLatest', () => {
    const targetLatestId = 'https://calm.corp/calm/namespaces/trading-prod/patterns/gateway/versions/4.0.0';

    it('treats a version-only difference in $id as unchanged', () => {
        const candidate = { $id: 'https://calm.corp/calm/namespaces/trading-prod/patterns/gateway/versions/4.1.0', title: 'Gateway' };
        const target = { latestVersion: '4.0.0', latestDocument: { $id: targetLatestId, title: 'Gateway' } };
        expect(matchesTargetLatest(candidate, target, targetLatestId)).toBe(true);
    });

    it('reports a real content difference', () => {
        const candidate = { $id: targetLatestId, title: 'Gateway v2' };
        const target = { latestVersion: '4.0.0', latestDocument: { $id: targetLatestId, title: 'Gateway' } };
        expect(matchesTargetLatest(candidate, target, targetLatestId)).toBe(false);
    });

    it('is false when the target has no latest document', () => {
        expect(matchesTargetLatest({ $id: targetLatestId }, {}, targetLatestId)).toBe(false);
    });
});

describe('detectDrift', () => {
    it('reports nothing when there is no recorded promotion', () => {
        expect(detectDrift(undefined, '4.0.0')).toBeUndefined();
    });

    it('reports nothing when the hub latest matches what we recorded', () => {
        expect(detectDrift('4.0.0', '4.0.0')).toBeUndefined();
    });

    it('reports drift when the hub has moved past what we recorded', () => {
        expect(detectDrift('4.0.0', '4.2.0')).toEqual({ recorded: '4.0.0', actual: '4.2.0' });
    });

    it('reports drift when a recorded version has vanished from the hub', () => {
        expect(detectDrift('4.0.0', undefined)).toEqual({ recorded: '4.0.0', actual: 'none' });
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && npx vitest run src/command-helpers/workspace/migrate.spec.ts`
Expected: FAIL — `fetchTargetState is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `cli/src/command-helpers/workspace/migrate.ts`, with the imports at the top:

```ts
import { canonicalEqual } from '@finos/calm-shared/src/hub/canonical';
import { sortSemVer } from '@finos/calm-shared/src/hub/semver';
import { HubResourceAccessor } from './hub-resource';
```

```ts
/** What the target hub already holds for one resource. */
export interface TargetState {
    latestVersion?: string;
    latestDocument?: object;
}

/** Read the target hub's current state for one resource. Absent versions mean it is new there. */
export async function fetchTargetState(accessor: HubResourceAccessor): Promise<TargetState> {
    const versions = await accessor.listVersions();
    if (versions.length === 0) return {};
    const sorted = sortSemVer(versions);
    const latestVersion = sorted[sorted.length - 1];
    return { latestVersion, latestDocument: await accessor.getVersion(latestVersion) };
}

/**
 * Is the candidate document already published in the target environment?
 *
 * The candidate's `$id` carries the version we are proposing, so it necessarily differs from the
 * target's latest `$id`. Pinning the candidate to the target's `$id` before comparing isolates the
 * question to *content*, which is what makes a repeated `migrate` a no-op instead of an endless
 * version march.
 */
export function matchesTargetLatest(candidate: object, target: TargetState, targetLatestId: string): boolean {
    if (!target.latestDocument) return false;
    return canonicalEqual({ ...candidate, $id: targetLatestId }, target.latestDocument);
}

/** A target-hub version that no longer matches what a previous promotion recorded. */
export interface Drift {
    recorded: string;
    actual: string;
}

/**
 * Has something been published to the target that `migrate` did not publish?
 *
 * Checked before the unchanged comparison, which returns early: a target that drifted to content
 * identical to ours is still a target somebody else published to, and the user should hear about it.
 */
export function detectDrift(recordedPromotedAs: string | undefined, actualLatest: string | undefined): Drift | undefined {
    if (!recordedPromotedAs) return undefined;
    if (recordedPromotedAs === actualLatest) return undefined;
    return { recorded: recordedPromotedAs, actual: actualLatest ?? 'none' };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd cli && npx vitest run src/command-helpers/workspace/migrate.spec.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint --workspace cli
git add cli/src/command-helpers/workspace/migrate.ts cli/src/command-helpers/workspace/migrate.spec.ts
git commit -m "feat(cli): add target-state, drift and unchanged detection for promotion"
```

---

### Task 6: The resolve phase

The orchestration: topological order, reference rewriting, version resolution, and the direct-vs-cascade classification. Reads only — nothing is written to disk.

Classification uses two comparisons against the target hub's latest, as the spec requires: once with references pinned at the dependencies' *pre-existing* target versions, once at their *newly resolved* versions. Differing in the first means the document changed on its own merits; differing only in the second means a dependency moved underneath it.

**Files:**
- Modify: `cli/src/command-helpers/workspace/migrate.ts` (append)
- Modify: `cli/src/command-helpers/workspace/migrate.spec.ts` (append)

**Interfaces:**
- Consumes: `buildDependencyGraph`, `loadManifest`, `resolveFilePath` from `./bundle`; `buildCrossEnvironmentRefRules`, `applyRefRules` from `./migrate-refs` (Task 2); `getHubResourceAccessor` from `./hub-resource` (Task 3); `rewriteDocumentIdForEnvironment` from `./environment` (Task 1); `fetchTargetState`, `matchesTargetLatest`, `detectDrift` (Task 5); `computeSemVerBump` from `@finos/calm-shared/src/hub/semver`; `ResourceChangeType`, `CalmHubClient` from `@finos/calm-shared/src/hub/calm-hub-client`.
- Produces:
  - `type MigrateStatus = 'new' | 'unchanged' | 'changed' | 'cascade' | 'verbatim'`
  - `interface MigratePlanEntry { id: string; status: MigrateStatus; content: string; type: WorkspaceDocumentType; sourceDocumentId?: string; targetDocumentId?: string; sourceVersion?: string; targetVersion?: string; namespace?: string; triggeredBy?: string; increment?: ResourceChangeType; drift?: Drift }`
  - `interface MigratePlan { sourceBundleName: string; sourceEnvironmentLabel: string; targetEnvironmentLabel: string; entries: MigratePlanEntry[]; removed: string[]; cycle: boolean }`
  - `function topologicalOrder(graph: DependencyGraph): { order: string[]; cycle: boolean }`
  - `interface ResolveMigrationOptions { sourceBundlePath: string; targetBundlePath: string; sourceBundleName: string; sourceEnvironmentLabel: string; targetEnvironmentLabel: string; targetEnvironment: WorkspaceEnvironment; client: CalmHubClient; defaultIncrement: ResourceChangeType; fixedIncrement?: ResourceChangeType; getIncrement?: (id: string, currentVersion: string) => Promise<ResourceChangeType>; getCascadeIncrement?: (id: string, triggeredBy: string, defaultIncrement: ResourceChangeType) => Promise<ResourceChangeType>; failOnDrift?: boolean }`
  - `function resolveMigration(options: ResolveMigrationOptions): Promise<MigratePlan>`

- [ ] **Step 1: Write the failing tests**

Append to `cli/src/command-helpers/workspace/migrate.spec.ts`:

```ts
import { mkdir, writeFile, rm } from 'fs/promises';
import path from 'path';
import { saveManifest } from './bundle';
import { resolveMigration } from './migrate';
import type { CalmHubClient } from '@finos/calm-shared/src/hub/calm-hub-client';

describe('resolveMigration', () => {
    const root = path.join(__dirname, 'test-migrate-resolve');
    const sourceBundlePath = path.join(root, 'bundles', 'trading');
    const targetBundlePath = path.join(root, 'bundles', 'trading-prod');
    const targetEnvironment = { url: 'https://calm.corp', namespace: 'trading-prod' };

    const devId = (mapping: string, v: string) =>
        `https://calm-dev.corp/calm/namespaces/trading/patterns/${mapping}/versions/${v}`;
    const prodId = (mapping: string, v: string) =>
        `https://calm.corp/calm/namespaces/trading-prod/patterns/${mapping}/versions/${v}`;

    /** Hub state keyed by mapping id: an ordered version list plus the document at each version. */
    function fakeClient(state: Record<string, Record<string, object>>): CalmHubClient {
        return {
            getMappedResourceVersions: async (_ns: string, mapping: string) => Object.keys(state[mapping] ?? {}),
            getMappedResourceByVersion: async (_ns: string, mapping: string, version: string) => {
                const doc = state[mapping]?.[version];
                if (!doc) throw new Error(`no such version ${mapping}@${version}`);
                return doc;
            },
        } as unknown as CalmHubClient;
    }

    async function writeSource(files: Record<string, object>) {
        await mkdir(path.join(sourceBundlePath, 'files'), { recursive: true });
        const manifest: Record<string, { path: string; type: 'pattern' }> = {};
        for (const [id, content] of Object.entries(files)) {
            await writeFile(path.join(sourceBundlePath, 'files', `${id}.json`), JSON.stringify(content), 'utf8');
            manifest[id] = { path: `files/${id}.json`, type: 'pattern' };
        }
        await saveManifest(sourceBundlePath, manifest);
    }

    const baseOptions = {
        sourceBundlePath,
        targetBundlePath,
        sourceBundleName: 'trading',
        sourceEnvironmentLabel: 'dev',
        targetEnvironmentLabel: 'prod',
        targetEnvironment,
        defaultIncrement: 'MINOR' as const,
        fixedIncrement: 'MINOR' as const,
    };

    beforeEach(async () => {
        await rm(root, { recursive: true, force: true });
        await mkdir(targetBundlePath, { recursive: true });
    });

    afterAll(async () => {
        await rm(root, { recursive: true, force: true });
    });

    it('takes the source version for a document that is new in the target', async () => {
        await writeSource({ gateway: { $id: devId('gateway', '1.3.0'), title: 'Gateway' } });
        const plan = await resolveMigration({ ...baseOptions, client: fakeClient({}) });

        expect(plan.entries).toHaveLength(1);
        expect(plan.entries[0]).toMatchObject({
            id: 'gateway',
            status: 'new',
            targetVersion: '1.3.0',
            targetDocumentId: prodId('gateway', '1.3.0'),
        });
    });

    it('reuses the existing version when the content is already published in the target', async () => {
        await writeSource({ gateway: { $id: devId('gateway', '1.3.0'), title: 'Gateway' } });
        const plan = await resolveMigration({
            ...baseOptions,
            client: fakeClient({ gateway: { '4.0.0': { $id: prodId('gateway', '4.0.0'), title: 'Gateway' } } }),
        });

        expect(plan.entries[0]).toMatchObject({ status: 'unchanged', targetVersion: '4.0.0' });
    });

    it('bumps from the target latest when the content differs', async () => {
        await writeSource({ gateway: { $id: devId('gateway', '1.3.0'), title: 'Gateway v2' } });
        const plan = await resolveMigration({
            ...baseOptions,
            client: fakeClient({ gateway: { '4.0.0': { $id: prodId('gateway', '4.0.0'), title: 'Gateway' } } }),
        });

        expect(plan.entries[0]).toMatchObject({ status: 'changed', targetVersion: '4.1.0' });
    });

    it('rewrites a dependency reference to the dependency target version', async () => {
        await writeSource({
            gateway: { $id: devId('gateway', '1.3.0'), title: 'Gateway v2' },
            trading: { $id: devId('trading', '1.0.0'), title: 'Trading', $ref: devId('gateway', '1.3.0') },
        });
        const plan = await resolveMigration({
            ...baseOptions,
            client: fakeClient({
                gateway: { '4.0.0': { $id: prodId('gateway', '4.0.0'), title: 'Gateway' } },
                trading: { '2.1.0': { $id: prodId('trading', '2.1.0'), title: 'Trading', $ref: prodId('gateway', '4.0.0') } },
            }),
        });

        const trading = plan.entries.find(e => e.id === 'trading')!;
        expect(JSON.parse(trading.content).$ref).toBe(prodId('gateway', '4.1.0'));
    });

    it('classifies a dependent that only changed because its dependency moved as a cascade', async () => {
        await writeSource({
            gateway: { $id: devId('gateway', '1.3.0'), title: 'Gateway v2' },
            trading: { $id: devId('trading', '1.0.0'), title: 'Trading', $ref: devId('gateway', '1.3.0') },
        });
        const plan = await resolveMigration({
            ...baseOptions,
            client: fakeClient({
                gateway: { '4.0.0': { $id: prodId('gateway', '4.0.0'), title: 'Gateway' } },
                trading: { '2.1.0': { $id: prodId('trading', '2.1.0'), title: 'Trading', $ref: prodId('gateway', '4.0.0') } },
            }),
        });

        expect(plan.entries.find(e => e.id === 'trading')).toMatchObject({
            status: 'cascade',
            triggeredBy: 'gateway',
            targetVersion: '2.2.0',
        });
    });

    it('classifies a dependent that changed on its own merits as directly changed', async () => {
        await writeSource({
            gateway: { $id: devId('gateway', '1.3.0'), title: 'Gateway' },
            trading: { $id: devId('trading', '1.0.0'), title: 'Trading v2', $ref: devId('gateway', '1.3.0') },
        });
        const plan = await resolveMigration({
            ...baseOptions,
            client: fakeClient({
                gateway: { '4.0.0': { $id: prodId('gateway', '4.0.0'), title: 'Gateway' } },
                trading: { '2.1.0': { $id: prodId('trading', '2.1.0'), title: 'Trading', $ref: prodId('gateway', '4.0.0') } },
            }),
        });

        expect(plan.entries.find(e => e.id === 'trading')).toMatchObject({ status: 'changed' });
    });

    it('copies a non-conformant document verbatim', async () => {
        await writeSource({ 'adr-0007': { $id: 'adr-0007', title: 'Use CALM' } });
        const plan = await resolveMigration({ ...baseOptions, client: fakeClient({}) });

        expect(plan.entries[0]).toMatchObject({ id: 'adr-0007', status: 'verbatim' });
        expect(JSON.parse(plan.entries[0].content).$id).toBe('adr-0007');
    });

    it('reports drift when the target moved past the recorded promotion', async () => {
        await writeSource({ gateway: { $id: devId('gateway', '1.3.0'), title: 'Gateway v2' } });
        await saveManifest(targetBundlePath, {
            gateway: { path: 'files/gateway.json', type: 'pattern', promotedAs: '4.0.0' },
        });
        const plan = await resolveMigration({
            ...baseOptions,
            client: fakeClient({ gateway: { '4.2.0': { $id: prodId('gateway', '4.2.0'), title: 'Someone else' } } }),
        });

        expect(plan.entries[0].drift).toEqual({ recorded: '4.0.0', actual: '4.2.0' });
        // The new version is computed on the hub's actual latest, never the recorded one.
        expect(plan.entries[0].targetVersion).toBe('4.3.0');
    });

    it('throws on drift when failOnDrift is set', async () => {
        await writeSource({ gateway: { $id: devId('gateway', '1.3.0'), title: 'Gateway v2' } });
        await saveManifest(targetBundlePath, {
            gateway: { path: 'files/gateway.json', type: 'pattern', promotedAs: '4.0.0' },
        });
        await expect(resolveMigration({
            ...baseOptions,
            failOnDrift: true,
            client: fakeClient({ gateway: { '4.2.0': { $id: prodId('gateway', '4.2.0'), title: 'Someone else' } } }),
        })).rejects.toThrow(/drift/i);
    });

    it('reports documents dropped from the source as removed', async () => {
        await writeSource({ gateway: { $id: devId('gateway', '1.3.0'), title: 'Gateway' } });
        await saveManifest(targetBundlePath, {
            gateway: { path: 'files/gateway.json', type: 'pattern' },
            retired: { path: 'files/retired.json', type: 'pattern' },
        });
        const plan = await resolveMigration({ ...baseOptions, client: fakeClient({}) });

        expect(plan.removed).toEqual(['retired']);
    });

    it('aborts when the target hub errors, so nothing can be written', async () => {
        await writeSource({ gateway: { $id: devId('gateway', '1.3.0'), title: 'Gateway' } });
        const client = {
            getMappedResourceVersions: async () => { throw new Error('hub unreachable'); },
            getMappedResourceByVersion: async () => ({}),
        } as unknown as CalmHubClient;

        await expect(resolveMigration({ ...baseOptions, client })).rejects.toThrow(/hub unreachable/);
    });

    it('prompts per changed document when no fixed increment is given', async () => {
        await writeSource({ gateway: { $id: devId('gateway', '1.3.0'), title: 'Gateway v2' } });
        const getIncrement = vi.fn(async () => 'MAJOR' as const);
        const plan = await resolveMigration({
            ...baseOptions,
            fixedIncrement: undefined,
            getIncrement,
            client: fakeClient({ gateway: { '4.0.0': { $id: prodId('gateway', '4.0.0'), title: 'Gateway' } } }),
        });

        expect(getIncrement).toHaveBeenCalledWith('gateway', '4.0.0');
        expect(plan.entries[0].targetVersion).toBe('5.0.0');
    });
});
```

Add `beforeEach`, `afterAll` and `vi` to the vitest import at the top of the file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && npx vitest run src/command-helpers/workspace/migrate.spec.ts`
Expected: FAIL — `resolveMigration is not a function`.

- [ ] **Step 3: Add the topological ordering helper**

Append to `cli/src/command-helpers/workspace/migrate.ts`:

```ts
/**
 * Order document ids dependencies-first.
 *
 * A document's target version depends on its content, its content includes its references, and its
 * references point at its dependencies' target versions — so a dependency must be resolved before
 * anything that references it. On a cycle this falls back to manifest order and reports it; the
 * final reference pass in the write phase still produces correct references, only the cascade
 * labelling degrades.
 */
export function topologicalOrder(graph: DependencyGraph): { order: string[]; cycle: boolean } {
    const visited = new Set<string>();
    const inProgress = new Set<string>();
    const order: string[] = [];
    let cycle = false;

    const visit = (id: string): void => {
        if (visited.has(id)) return;
        if (inProgress.has(id)) {
            cycle = true;
            return;
        }
        inProgress.add(id);
        for (const dependency of graph.edges[id] ?? []) {
            visit(dependency);
        }
        inProgress.delete(id);
        visited.add(id);
        order.push(id);
    };

    for (const id of graph.nodes) visit(id);

    return cycle ? { order: graph.nodes, cycle: true } : { order, cycle: false };
}
```

Add `DependencyGraph` to the `./bundle` import.

- [ ] **Step 4: Write `resolveMigration`**

Append to `cli/src/command-helpers/workspace/migrate.ts`:

```ts
export type MigrateStatus = 'new' | 'unchanged' | 'changed' | 'cascade' | 'verbatim';

export interface MigratePlanEntry {
    id: string;
    status: MigrateStatus;
    /** Final JSON text to write into the target bundle. */
    content: string;
    type: WorkspaceDocumentType;
    sourceDocumentId?: string;
    targetDocumentId?: string;
    sourceVersion?: string;
    targetVersion?: string;
    namespace?: string;
    /** For a cascade, the dependency that moved. */
    triggeredBy?: string;
    /** The increment applied, so a dependent's cascade prompt can default to it. */
    increment?: ResourceChangeType;
    drift?: Drift;
}

export interface MigratePlan {
    sourceBundleName: string;
    sourceEnvironmentLabel: string;
    targetEnvironmentLabel: string;
    entries: MigratePlanEntry[];
    /** Ids present in the target manifest but no longer tracked in the source. */
    removed: string[];
    cycle: boolean;
}

export interface ResolveMigrationOptions {
    sourceBundlePath: string;
    targetBundlePath: string;
    sourceBundleName: string;
    sourceEnvironmentLabel: string;
    targetEnvironmentLabel: string;
    targetEnvironment: WorkspaceEnvironment;
    client: CalmHubClient;
    defaultIncrement: ResourceChangeType;
    /** From --major/--minor/--patch. When set, no prompt callbacks are used. */
    fixedIncrement?: ResourceChangeType;
    getIncrement?: (id: string, currentVersion: string) => Promise<ResourceChangeType>;
    getCascadeIncrement?: (id: string, triggeredBy: string, defaultIncrement: ResourceChangeType) => Promise<ResourceChangeType>;
    failOnDrift?: boolean;
}

/**
 * Resolve a promotion without writing anything.
 *
 * Every hub read and every decision happens here, so a hub failure or an unparseable document
 * aborts with the working tree untouched rather than half-promoted.
 */
export async function resolveMigration(options: ResolveMigrationOptions): Promise<MigratePlan> {
    const sourceManifest = await loadManifest(options.sourceBundlePath);
    const targetManifest = await loadManifest(options.targetBundlePath);
    const graph = await buildDependencyGraph(options.sourceBundlePath);
    const { order, cycle } = topologicalOrder(graph);

    // Two id maps: what references said before this promotion, and what they say after. The
    // difference between them is what separates a direct change from a cascade.
    const preExistingMappings: IdMapping[] = [];
    const resolvedMappings: IdMapping[] = [];
    const entries: MigratePlanEntry[] = [];

    for (const id of order) {
        const entry = sourceManifest[id];
        if (!entry) continue;

        const filePath = resolveFilePath(options.sourceBundlePath, entry.path);
        let json: Record<string, unknown>;
        try {
            json = JSON.parse(await readFile(filePath, 'utf8'));
        } catch (e) {
            throw new Error(`Cannot promote '${id}': ${e instanceof Error ? e.message : String(e)}`);
        }

        const sourceDocumentId = typeof json['$id'] === 'string' ? json['$id'] : undefined;
        const accessor = sourceDocumentId
            ? getHubResourceAccessor(options.client, rewriteDocumentIdForEnvironment(sourceDocumentId, options.targetEnvironment) ?? '')
            : null;

        // Non-CalmHub ids (flows, ADRs, timelines) are promoted verbatim: no id change, no version.
        if (!sourceDocumentId || !accessor) {
            entries.push({
                id,
                status: 'verbatim',
                content: JSON.stringify(applyRefRules(json, buildCrossEnvironmentRefRules(resolvedMappings)).updated, null, 2),
                type: entry.type,
                sourceDocumentId,
            });
            continue;
        }

        const targetState = await fetchTargetState(accessor);

        const drift = detectDrift(targetManifest[id]?.promotedAs, targetState.latestVersion);
        if (drift && options.failOnDrift) {
            throw new Error(
                `Target drift for '${id}': this workspace promoted ${drift.recorded}, but the target hub's latest is ` +
                `${drift.actual}. Something was published to ${options.targetEnvironmentLabel} that migrate did not publish.`
            );
        }

        const candidateAtResolved = applyRefRules(json, buildCrossEnvironmentRefRules(resolvedMappings)).updated as Record<string, unknown>;
        const candidateAtPreExisting = applyRefRules(json, buildCrossEnvironmentRefRules(preExistingMappings)).updated as Record<string, unknown>;

        let status: MigrateStatus;
        let targetVersion: string;
        let triggeredBy: string | undefined;
        let increment: ResourceChangeType | undefined;

        if (!targetState.latestVersion) {
            status = 'new';
            targetVersion = parseAnyDocumentId(sourceDocumentId)?.version ?? '1.0.0';
        } else {
            const targetLatestId = rewriteDocumentIdForEnvironment(
                sourceDocumentId, options.targetEnvironment, targetState.latestVersion
            )!;

            if (matchesTargetLatest(candidateAtResolved, targetState, targetLatestId)) {
                status = 'unchanged';
                targetVersion = targetState.latestVersion;
            } else {
                const changedOnItsOwnMerits = !matchesTargetLatest(candidateAtPreExisting, targetState, targetLatestId);
                triggeredBy = changedOnItsOwnMerits ? undefined : movedDependencies(id, graph, entries);
                status = changedOnItsOwnMerits || !triggeredBy ? 'changed' : 'cascade';

                increment = await chooseIncrement(options, status, id, targetState.latestVersion, triggeredBy, entries);
                targetVersion = computeSemVerBump(targetState.latestVersion, increment);
            }
        }

        const targetDocumentId = rewriteDocumentIdForEnvironment(sourceDocumentId, options.targetEnvironment, targetVersion)!;
        const finalContent = { ...candidateAtResolved, $id: targetDocumentId };

        entries.push({
            id,
            status,
            triggeredBy,
            increment,
            drift,
            content: JSON.stringify(finalContent, null, 2),
            type: entry.type,
            sourceDocumentId,
            targetDocumentId,
            sourceVersion: parseAnyDocumentId(sourceDocumentId)?.version,
            targetVersion,
            namespace: options.targetEnvironment.namespace ?? entry.namespace,
        });

        resolvedMappings.push({ bareId: id, sourceDocumentId, targetDocumentId });
        preExistingMappings.push({
            bareId: id,
            sourceDocumentId,
            // Before this promotion, references pointed at whatever the target already had. A
            // brand-new resource has no such version, so its own introduction counts as a change.
            targetDocumentId: targetState.latestVersion
                ? rewriteDocumentIdForEnvironment(sourceDocumentId, options.targetEnvironment, targetState.latestVersion)!
                : targetDocumentId,
        });
    }

    const removed = Object.keys(targetManifest).filter(id => !sourceManifest[id]);
    return {
        sourceBundleName: options.sourceBundleName,
        sourceEnvironmentLabel: options.sourceEnvironmentLabel,
        targetEnvironmentLabel: options.targetEnvironmentLabel,
        entries,
        removed,
        cycle,
    };
}

/** Name the already-resolved dependencies of `id` whose version moved, for a cascade label. */
function movedDependencies(id: string, graph: DependencyGraph, resolved: MigratePlanEntry[]): string | undefined {
    const moved = (graph.edges[id] ?? []).filter(dependency =>
        resolved.some(e => e.id === dependency && e.status !== 'unchanged' && e.status !== 'verbatim')
    );
    return moved.length > 0 ? moved.join(', ') : undefined;
}

/** Pick the increment for a changed document: fixed flag, prompt callback, or the config default. */
async function chooseIncrement(
    options: ResolveMigrationOptions,
    status: MigrateStatus,
    id: string,
    currentVersion: string,
    triggeredBy: string | undefined,
    resolved: MigratePlanEntry[]
): Promise<ResourceChangeType> {
    if (options.fixedIncrement) return options.fixedIncrement;

    if (status === 'cascade' && triggeredBy) {
        // A cascade defaults to the strongest increment already applied to whatever triggered it.
        const triggerIncrements = triggeredBy
            .split(', ')
            .map(triggerId => resolved.find(e => e.id === triggerId)?.increment)
            .filter((i): i is ResourceChangeType => i !== undefined);
        const cascadeDefault = maxIncrement(
            triggerIncrements.length > 0 ? triggerIncrements : [options.defaultIncrement]
        );
        return options.getCascadeIncrement
            ? await options.getCascadeIncrement(id, triggeredBy, cascadeDefault)
            : cascadeDefault;
    }

    return options.getIncrement ? await options.getIncrement(id, currentVersion) : options.defaultIncrement;
}
```

Add the remaining imports at the top of `migrate.ts`:

```ts
import { readFile } from 'fs/promises';
import { loadManifest, resolveFilePath, buildDependencyGraph, DependencyGraph, WorkspaceDocumentType } from './bundle';
import { buildCrossEnvironmentRefRules, applyRefRules, IdMapping } from './migrate-refs';
import { getHubResourceAccessor } from './hub-resource';
import { WorkspaceEnvironment, rewriteDocumentIdForEnvironment } from './environment';
import { maxIncrement } from './bump';
import { computeSemVerBump } from '@finos/calm-shared/src/hub/semver';
import { CalmHubClient, ResourceChangeType } from '@finos/calm-shared/src/hub/calm-hub-client';
import { parseAnyDocumentId } from '@finos/calm-shared/src/hub/document-id-utils';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd cli && npx vitest run src/command-helpers/workspace/migrate.spec.ts`
Expected: PASS. If the cascade test fails, check `movedDependencies` — it depends on `buildDependencyGraph` finding the `$ref` edge, which requires the reference to be one of `REFERENCE_PROPERTIES` and to resolve to a manifest key.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint --workspace cli
git add cli/src/command-helpers/workspace/migrate.ts cli/src/command-helpers/workspace/migrate.spec.ts
git commit -m "feat(cli): resolve a workspace promotion against the target hub"
```

---

### Task 7: The write phase

Materialise the resolved plan. Runs only after every document has resolved.

**Files:**
- Modify: `cli/src/command-helpers/workspace/migrate.ts` (append)
- Modify: `cli/src/command-helpers/workspace/migrate.spec.ts` (append)

**Interfaces:**
- Consumes: `MigratePlan` (Task 6); `saveManifest` from `./bundle`; `saveBundleMetadata` from `./bundle-metadata`; `buildCrossEnvironmentRefRules`, `applyRefRules` from `./migrate-refs`.
- Produces: `function writeMigration(plan: MigratePlan, targetBundlePath: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Append to `cli/src/command-helpers/workspace/migrate.spec.ts`:

```ts
describe('writeMigration', () => {
    const root = path.join(__dirname, 'test-migrate-write');
    const targetBundlePath = path.join(root, 'bundles', 'trading-prod');

    const plan = {
        sourceBundleName: 'trading',
        sourceEnvironmentLabel: 'dev',
        targetEnvironmentLabel: 'prod',
        cycle: false,
        removed: [],
        entries: [{
            id: 'gateway',
            status: 'changed' as const,
            content: JSON.stringify({ $id: 'https://calm.corp/calm/namespaces/trading-prod/patterns/gateway/versions/4.1.0', title: 'Gateway' }, null, 2),
            type: 'pattern' as const,
            sourceDocumentId: 'https://calm-dev.corp/calm/namespaces/trading/patterns/gateway/versions/1.3.0',
            targetDocumentId: 'https://calm.corp/calm/namespaces/trading-prod/patterns/gateway/versions/4.1.0',
            sourceVersion: '1.3.0',
            targetVersion: '4.1.0',
            namespace: 'trading-prod',
        }],
    };

    beforeEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    afterAll(async () => {
        await rm(root, { recursive: true, force: true });
    });

    it('writes bundle.json naming the target environment and the source bundle', async () => {
        await writeMigration(plan, targetBundlePath);
        const metadata = JSON.parse(await readFileText(path.join(targetBundlePath, 'bundle.json')));
        expect(metadata).toEqual({ environment: 'prod', promotedFrom: 'trading' });
    });

    it('writes every document as a copy under files/', async () => {
        await writeMigration(plan, targetBundlePath);
        const written = JSON.parse(await readFileText(path.join(targetBundlePath, 'files', 'gateway.json')));
        expect(written.$id).toBe('https://calm.corp/calm/namespaces/trading-prod/patterns/gateway/versions/4.1.0');
    });

    it('records provenance in the manifest', async () => {
        await writeMigration(plan, targetBundlePath);
        const manifest = JSON.parse(await readFileText(path.join(targetBundlePath, 'workspace-manifest.json')));
        expect(manifest.gateway).toEqual({
            path: 'files/gateway.json',
            type: 'pattern',
            namespace: 'trading-prod',
            promotedFrom: { bundle: 'trading', env: 'dev', version: '1.3.0' },
            promotedAs: '4.1.0',
        });
    });

    it('removes documents that are no longer tracked in the source', async () => {
        await mkdir(path.join(targetBundlePath, 'files'), { recursive: true });
        await writeFile(path.join(targetBundlePath, 'files', 'retired.json'), '{}', 'utf8');
        await saveManifest(targetBundlePath, { retired: { path: 'files/retired.json', type: 'pattern' } });

        await writeMigration({ ...plan, removed: ['retired'] }, targetBundlePath);

        const manifest = JSON.parse(await readFileText(path.join(targetBundlePath, 'workspace-manifest.json')));
        expect(manifest.retired).toBeUndefined();
        expect(existsSync(path.join(targetBundlePath, 'files', 'retired.json'))).toBe(false);
    });

    it('is idempotent - writing the same plan twice produces the same bundle', async () => {
        await writeMigration(plan, targetBundlePath);
        const first = await readFileText(path.join(targetBundlePath, 'workspace-manifest.json'));
        await writeMigration(plan, targetBundlePath);
        expect(await readFileText(path.join(targetBundlePath, 'workspace-manifest.json'))).toBe(first);
    });
});
```

Add to the imports at the top of the spec: `import { existsSync } from 'fs';`, `import { readFile as readFileText } from 'fs/promises';` (aliased so it does not clash), and `writeMigration` from `./migrate`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && npx vitest run src/command-helpers/workspace/migrate.spec.ts`
Expected: FAIL — `writeMigration is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `cli/src/command-helpers/workspace/migrate.ts`:

```ts
/** Filesystem-safe filename for a manifest key, which may be a free-text title. */
function fileNameForId(id: string): string {
    return `${id.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document'}.json`;
}

/**
 * Materialise a resolved plan into the target bundle.
 *
 * Promoted bundles always hold copies, never by-reference entries: their content differs from the
 * source files, so pointing back at those would defeat the promotion.
 */
export async function writeMigration(plan: MigratePlan, targetBundlePath: string): Promise<void> {
    const filesDir = path.join(targetBundlePath, 'files');
    await mkdir(filesDir, { recursive: true });

    await saveBundleMetadata(targetBundlePath, {
        environment: plan.targetEnvironmentLabel,
        promotedFrom: plan.sourceBundleName,
    });

    const manifest: WorkspaceManifest = {};
    for (const entry of plan.entries) {
        const fileName = fileNameForId(entry.id);
        await writeFile(path.join(filesDir, fileName), entry.content, 'utf8');
        manifest[entry.id] = {
            path: path.posix.join('files', fileName),
            type: entry.type,
            ...(entry.namespace ? { namespace: entry.namespace } : {}),
            ...(entry.sourceVersion && entry.targetVersion
                ? {
                    promotedFrom: {
                        bundle: plan.sourceBundleName,
                        env: plan.sourceEnvironmentLabel,
                        version: entry.sourceVersion,
                    },
                    promotedAs: entry.targetVersion,
                }
                : {}),
        };
    }

    // Final reference pass over the materialised bundle with the *complete* map. For a DAG this is
    // a no-op, but it is cheap and idempotent and covers cycles and ordering surprises. It must use
    // source->target rules: buildRefRulesFromDiskIds would derive rules from the target bundle's own
    // ids and change nothing.
    const rules = buildCrossEnvironmentRefRules(
        plan.entries
            .filter((e): e is MigratePlanEntry & { sourceDocumentId: string; targetDocumentId: string } =>
                Boolean(e.sourceDocumentId && e.targetDocumentId))
            .map(e => ({ bareId: e.id, sourceDocumentId: e.sourceDocumentId, targetDocumentId: e.targetDocumentId }))
    );
    for (const entry of plan.entries) {
        const filePath = path.join(filesDir, fileNameForId(entry.id));
        const { updated, changeCount } = applyRefRules(JSON.parse(await readFile(filePath, 'utf8')), rules);
        if (changeCount > 0) {
            await writeFile(filePath, JSON.stringify(updated, null, 2), 'utf8');
        }
    }

    // The target bundle is a projection of the source: anything dropped there is dropped here.
    // Versions already published to the target hub are untouched — promotion never deletes remotely.
    for (const id of plan.removed) {
        const stale = path.join(filesDir, fileNameForId(id));
        if (existsSync(stale)) await rm(stale, { force: true });
    }

    await saveManifest(targetBundlePath, manifest);
}
```

Add the remaining imports at the top of `migrate.ts`:

```ts
import path from 'path';
import { mkdir, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { saveManifest, WorkspaceManifest } from './bundle';
import { saveBundleMetadata } from './bundle-metadata';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd cli && npx vitest run src/command-helpers/workspace/migrate.spec.ts`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint --workspace cli
git add cli/src/command-helpers/workspace/migrate.ts cli/src/command-helpers/workspace/migrate.spec.ts
git commit -m "feat(cli): materialise a resolved promotion into the target bundle"
```

---

### Task 8: The `migrate` command

Wire it up: preconditions, flags, prompts, dry-run, and the summary that ends by reminding the user nothing was published.

**Files:**
- Modify: `cli/src/command-helpers/workspace/commands.ts` (register after `bump`)
- Modify: `cli/src/command-helpers/workspace/commands.spec.ts`

**Interfaces:**
- Consumes: `resolveMigration`, `writeMigration`, `deriveTargetBundleName` (Tasks 4, 6, 7); `resolveWorkspaceHub` from `./hub-resolution`; `loadBundleMetadata` from `./bundle-metadata`; `getWorkspaceBundlePath` from `./workspace`; `validateEnvironments`, `resolveEnvironment`, `describeEnvironment` from `./environment`.
- Produces: CLI surface `calm workspace migrate <environment> [--as <name>] [--major|--minor|--patch] [--inherit-change-type] [--fail-on-drift] [--dry-run]`.

- [ ] **Step 1: Add mocks and write the failing tests**

In `cli/src/command-helpers/workspace/commands.spec.ts` add to `vi.hoisted`:

```ts
        resolveMigration: vi.fn(async () => ({
            sourceBundleName: 'trading',
            sourceEnvironmentLabel: 'dev',
            targetEnvironmentLabel: 'prod',
            cycle: false,
            removed: [],
            entries: [{ id: 'gateway', status: 'changed', content: '{}', type: 'pattern', targetVersion: '4.1.0' }],
        })),
        writeMigration: vi.fn(async () => { }),
```

```ts
vi.mock('./migrate', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./migrate')>();
    return { ...actual, resolveMigration: mocks.resolveMigration, writeMigration: mocks.writeMigration };
});
```

and the tests:

```ts
    describe('workspace migrate', () => {
        beforeEach(() => {
            mocks.loadBundleMetadata.mockResolvedValue({ environment: 'dev' });
        });

        it('resolves and writes a promotion to the derived bundle name', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'migrate', 'prod', '--minor']);
            expect(mocks.resolveMigration).toHaveBeenCalledWith(expect.objectContaining({
                sourceBundleName: 'bundle',
                sourceEnvironmentLabel: 'dev',
                targetEnvironmentLabel: 'prod',
                fixedIncrement: 'MINOR',
            }));
            expect(mocks.writeMigration).toHaveBeenCalled();
        });

        it('honours --as for the target bundle name', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'migrate', 'prod', '--minor', '--as', 'release-candidate']);
            expect(mocks.resolveMigration).toHaveBeenCalledWith(expect.objectContaining({
                targetBundlePath: expect.stringContaining('release-candidate'),
            }));
        });

        it('writes nothing with --dry-run', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'migrate', 'prod', '--minor', '--dry-run']);
            expect(mocks.resolveMigration).toHaveBeenCalled();
            expect(mocks.writeMigration).not.toHaveBeenCalled();
        });

        it('passes --fail-on-drift through', async () => {
            await program.parseAsync(['node', 'test', 'workspace', 'migrate', 'prod', '--minor', '--fail-on-drift']);
            expect(mocks.resolveMigration).toHaveBeenCalledWith(expect.objectContaining({ failOnDrift: true }));
        });

        it('exits when the source bundle has no environment', async () => {
            mocks.loadBundleMetadata.mockResolvedValue(undefined);
            await expect(program.parseAsync(['node', 'test', 'workspace', 'migrate', 'prod', '--minor'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
            expect(mocks.resolveMigration).not.toHaveBeenCalled();
        });

        it('exits when promoting to the same environment', async () => {
            await expect(program.parseAsync(['node', 'test', 'workspace', 'migrate', 'dev', '--minor'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
            expect(mocks.resolveMigration).not.toHaveBeenCalled();
        });

        it('exits for an unknown target environment', async () => {
            await expect(program.parseAsync(['node', 'test', 'workspace', 'migrate', 'nope', '--minor'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('exits when more than one increment flag is given', async () => {
            await expect(program.parseAsync(['node', 'test', 'workspace', 'migrate', 'prod', '--minor', '--major'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
            expect(mocks.resolveMigration).not.toHaveBeenCalled();
        });

        it('writes nothing when resolution fails', async () => {
            mocks.resolveMigration.mockRejectedValueOnce(new Error('hub unreachable'));
            await expect(program.parseAsync(['node', 'test', 'workspace', 'migrate', 'prod', '--minor'])).rejects.toThrow();
            expect(exitSpy).toHaveBeenCalledWith(1);
            expect(mocks.writeMigration).not.toHaveBeenCalled();
        });

        it('exits with an actionable message in a non-TTY with no increment flag', async () => {
            const isTTY = process.stdout.isTTY;
            Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
            try {
                await expect(program.parseAsync(['node', 'test', 'workspace', 'migrate', 'prod'])).rejects.toThrow();
                expect(exitSpy).toHaveBeenCalledWith(1);
                expect(mocks.resolveMigration).not.toHaveBeenCalled();
            } finally {
                Object.defineProperty(process.stdout, 'isTTY', { value: isTTY, configurable: true });
            }
        });
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && npx vitest run src/command-helpers/workspace/commands.spec.ts`
Expected: FAIL — unknown command `migrate`.

- [ ] **Step 3: Register the command**

Add to `cli/src/command-helpers/workspace/commands.ts`, after the `bump` registration, with the imports:

```ts
import { resolveMigration, writeMigration, deriveTargetBundleName, MigratePlan } from './migrate';
```

```ts
    workspaceCmd
        .command('migrate')
        .description('Promote every tracked document to another environment. Writes a bundle to disk; publishes nothing.')
        .argument('<environment>', 'Target environment label from .calm-workspace/config.json')
        .option('--as <bundle-name>', 'Target bundle name (default: derived from the source bundle and environments)')
        .option('--major', 'Apply a major bump to every changed document (no prompts)')
        .option('--minor', 'Apply a minor bump to every changed document (no prompts)')
        .option('--patch', 'Apply a patch bump to every changed document (no prompts)')
        .option('--inherit-change-type', 'Cascade-bumped documents inherit their trigger\'s increment without prompting')
        .option('--fail-on-drift', 'Error instead of warning when the target hub has drifted')
        .option('--dry-run', 'Resolve and print the plan; write nothing')
        .action(async (targetLabel: string, options: {
            as?: string; major?: boolean; minor?: boolean; patch?: boolean;
            inheritChangeType?: boolean; failOnDrift?: boolean; dryRun?: boolean;
        }) => {
            try {
                if ([options.major, options.minor, options.patch].filter(Boolean).length > 1) {
                    throw new Error('Cannot use --major, --minor and --patch together.');
                }

                // Without a TTY there is nobody to answer the per-document prompts, and inquirer
                // would fail with something unhelpful. Say what to pass instead.
                if (!options.major && !options.minor && !options.patch && !process.stdout.isTTY) {
                    throw new Error(
                        'migrate needs an increment when not running interactively. ' +
                        'Pass --major, --minor or --patch.'
                    );
                }

                const sourceBundlePath = requireBundlePath();
                const gitRoot = requireGitRoot();

                const sourceLabel = (await loadBundleMetadata(sourceBundlePath))?.environment;
                if (!sourceLabel) {
                    throw new Error(
                        'The active workspace bundle has no environment, so there is nothing to promote from. ' +
                        'Set one with `calm workspace environment set <label>`.'
                    );
                }
                if (sourceLabel === targetLabel) {
                    throw new Error(`The active bundle already belongs to '${targetLabel}'.`);
                }

                const workspaceConfig = await loadWorkspaceConfig(gitRoot);
                const environments = validateEnvironments(workspaceConfig.environments);
                const targetEnvironment = resolveEnvironment(environments, targetLabel);

                const sourceBundleName = path.basename(sourceBundlePath);
                const targetBundleName = options.as ?? deriveTargetBundleName(sourceBundleName, sourceLabel, targetLabel);
                const targetBundlePath = getWorkspaceBundlePath(gitRoot, targetBundleName);

                // Resolve against the *target* hub. The source bundle's own environment is left
                // alone; migrate reads the target and writes only to disk.
                const { calmHubOptions } = await resolveWorkspaceHub({
                    bundlePath: sourceBundlePath,
                    gitRoot,
                    environmentOverride: targetLabel,
                });

                logger.info(
                    `Promoting bundle '${sourceBundleName}' (${sourceLabel}) -> '${targetBundleName}' ` +
                    `(${describeEnvironment(targetLabel, targetEnvironment)})`
                );

                const fixedIncrement: ResourceChangeType | undefined =
                    options.major ? 'MAJOR' : options.minor ? 'MINOR' : options.patch ? 'PATCH' : undefined;

                const plan = await resolveMigration({
                    sourceBundlePath,
                    targetBundlePath,
                    sourceBundleName,
                    sourceEnvironmentLabel: sourceLabel,
                    targetEnvironmentLabel: targetLabel,
                    targetEnvironment,
                    client: new CalmHubClient(calmHubOptions),
                    defaultIncrement: workspaceConfig.bump.defaultIncrement,
                    fixedIncrement,
                    failOnDrift: options.failOnDrift,
                    getIncrement: fixedIncrement ? undefined : async (id, currentVersion) =>
                        await select<ResourceChangeType>({
                            message: `Bump type for '${id}' (currently ${currentVersion}):`,
                            choices: (['MINOR', 'MAJOR', 'PATCH'] as ResourceChangeType[]).map(v => ({
                                name: v === workspaceConfig.bump.defaultIncrement ? `${v.toLowerCase()} (default)` : v.toLowerCase(),
                                value: v,
                            })),
                            default: workspaceConfig.bump.defaultIncrement,
                        }),
                    getCascadeIncrement: fixedIncrement || options.inheritChangeType ? undefined :
                        async (id, triggeredBy, cascadeDefault) =>
                            await select<ResourceChangeType>({
                                message: `Bump type for '${id}' (depends on ${triggeredBy}):`,
                                choices: (['MINOR', 'MAJOR', 'PATCH'] as ResourceChangeType[]).map(v => ({
                                    name: v === cascadeDefault ? `${v.toLowerCase()} (inherited)` : v.toLowerCase(),
                                    value: v,
                                })),
                                default: cascadeDefault,
                            }),
                });

                reportMigratePlan(plan);

                if (options.dryRun) {
                    logger.info('Dry run - nothing written.');
                    return;
                }

                await writeMigration(plan, targetBundlePath);
                logger.info(`Wrote ${targetBundlePath} (${plan.entries.length} document(s))`);
                logger.info('Nothing published. Review the bundle, then:');
                logger.info(`  calm workspace switch ${targetBundleName} && calm workspace push`);
            } catch (err) {
                logger.error('Failed to migrate workspace: ' + (err instanceof Error ? err.message : String(err)));
                process.exit(1);
            }
        });
```

- [ ] **Step 4: Add the summary printer**

Add next to the other helpers at the bottom of `cli/src/command-helpers/workspace/commands.ts`:

```ts
/** Print what a promotion resolved to, one line per document. */
function reportMigratePlan(plan: MigratePlan): void {
    if (plan.cycle) {
        logger.warn('The workspace dependency graph contains a cycle; falling back to manifest order.');
    }
    for (const entry of plan.entries) {
        if (entry.drift) {
            logger.warn(
                `'${entry.id}': target drifted - this workspace promoted ${entry.drift.recorded}, ` +
                `the hub's latest is ${entry.drift.actual}.`
            );
        }
        switch (entry.status) {
            case 'new':
                logger.info(`  ${entry.id} not in ${plan.targetEnvironmentLabel}, taking source version ${entry.targetVersion}`);
                break;
            case 'unchanged':
                logger.info(`  ${entry.id} unchanged in ${plan.targetEnvironmentLabel}, reusing ${entry.targetVersion}`);
                break;
            case 'cascade':
                logger.info(`  ${entry.id} -> ${entry.targetVersion} (depends on ${entry.triggeredBy})`);
                break;
            case 'verbatim':
                logger.warn(`  ${entry.id} has a non-CalmHub $id - copied verbatim, not versioned`);
                break;
            default:
                logger.info(`  ${entry.id} -> ${entry.targetVersion}`);
        }
    }
    for (const id of plan.removed) {
        logger.warn(`  ${id} is no longer tracked in the source bundle - removing it from the target bundle`);
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd cli && npx vitest run src/command-helpers/workspace/commands.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole CLI suite**

Run: `npm test --workspace cli`
Expected: PASS.

- [ ] **Step 7: Lint and commit**

```bash
npm run lint --workspace cli
git add cli/src/command-helpers/workspace/commands.ts cli/src/command-helpers/workspace/commands.spec.ts
git commit -m "feat(cli): add workspace migrate for promoting between environments"
```

---

### Task 9: Smoke test

An end-to-end promotion against a real CalmHub. The smoke harness runs a single hub, so the flow promotes between two namespaces on that one instance — which is exactly the topology the `{ url, namespace }` environment model was chosen to support.

**Files:**
- Create: `cli/smoke/migrate.smoke.spec.ts`

**Interfaces:**
- Consumes: `installPackedCli` from `../src/test_helpers/cli-runner`; `SMOKE_HUB_URL` from `./global-setup`; `hubApi` from `./harness/hub-api`; `hubDocId`, `readJson`, `writeJson` from `./harness/fixtures`.

- [ ] **Step 1: Write the smoke test**

Create `cli/smoke/migrate.smoke.spec.ts`:

```ts
import path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { installPackedCli, type CliInstall } from '../src/test_helpers/cli-runner';
import { SMOKE_HUB_URL } from './global-setup';
import { hubApi } from './harness/hub-api';
import { hubDocId, readJson, writeJson } from './harness/fixtures';

const CLI_ROOT = path.resolve(__dirname, '..');
const DEV_NS = 'smoke-migrate-dev';
const PROD_NS = 'smoke-migrate-prod';
const MAPPING = 'gateway';
const api = hubApi();

const devId = (v: string) => hubDocId(DEV_NS, 'architectures', MAPPING, v);
const prodId = (v: string) => hubDocId(PROD_NS, 'architectures', MAPPING, v);

describe('Flow 4: workspace migrate dev -> prod', () => {
    let cli: CliInstall;
    let wsDir: string;
    let gatewayFile: string;

    async function run(args: string[]) {
        return cli.run(args, { cwd: wsDir });
    }

    beforeAll(async () => {
        cli = installPackedCli(CLI_ROOT, 'calm-smoke-migrate');
        wsDir = path.join(cli.tempDir, 'repo');
        fs.mkdirSync(path.join(wsDir, '.calm-workspace'), { recursive: true });
        execSync('git init', { cwd: wsDir, stdio: 'inherit' });

        // Both environments live on the one smoke hub, separated by namespace.
        writeJson(path.join(wsDir, '.calm-workspace', 'config.json'), {
            push: { failIfModified: false },
            bump: { defaultIncrement: 'MINOR' },
            environments: {
                dev: { url: SMOKE_HUB_URL, namespace: DEV_NS },
                prod: { url: SMOKE_HUB_URL, namespace: PROD_NS },
            },
        });

        gatewayFile = path.join(wsDir, 'gateway.architecture.json');
        writeJson(gatewayFile, {
            $schema: 'https://calm.finos.org/release/1.0/meta/calm.json',
            $id: devId('1.0.0'),
            title: MAPPING,
            nodes: [{ 'unique-id': 'gw', 'node-type': 'service', name: 'Gateway', description: 'initial' }],
            relationships: [],
        });

        await cli.run(['hub', 'create', 'namespace', '--name', DEV_NS, '--description', 'smoke migrate dev', '-c', SMOKE_HUB_URL]);
        await cli.run(['hub', 'create', 'namespace', '--name', PROD_NS, '--description', 'smoke migrate prod', '-c', SMOKE_HUB_URL]);
    }, 120_000);

    afterAll(() => cli?.cleanup());

    test('the dev bundle publishes to the dev namespace with no --calm-hub-url', async () => {
        await run(['workspace', 'init', 'trading', '--environment', 'dev']);
        await run(['workspace', 'add', gatewayFile, '--id', MAPPING, '--type', 'architecture']);
        await run(['workspace', 'push']);
        expect(await api.listVersions(DEV_NS, 'architectures', MAPPING)).toContain('1.0.0');
    });

    test('push to a hub that disagrees with the bundle environment is rejected', async () => {
        await expect(
            run(['workspace', 'push', '--calm-hub-url', 'https://not-this-hub.example.com'])
        ).rejects.toHaveProperty('exitCode', 1);
    });

    test('migrate --dry-run writes nothing', async () => {
        await run(['workspace', 'migrate', 'prod', '--minor', '--dry-run']);
        expect(fs.existsSync(path.join(wsDir, '.calm-workspace', 'bundles', 'trading-prod'))).toBe(false);
    });

    test('migrate produces a prod bundle with rewritten ids and the source version', async () => {
        await run(['workspace', 'migrate', 'prod', '--minor']);
        const promoted = readJson(path.join(wsDir, '.calm-workspace', 'bundles', 'trading-prod', 'files', 'gateway.json'));
        // New in prod, so the source version carries over.
        expect(promoted.$id).toBe(prodId('1.0.0'));
        // Materialise only - nothing published.
        expect(await api.listVersions(PROD_NS, 'architectures', MAPPING)).toEqual([]);
    });

    test('the promoted bundle publishes to prod after switching to it', async () => {
        await run(['workspace', 'switch', 'trading-prod']);
        await run(['workspace', 'push', '--expect-environment', 'prod']);
        expect(await api.listVersions(PROD_NS, 'architectures', MAPPING)).toContain('1.0.0');
    });

    test('re-running migrate after no change is idempotent', async () => {
        await run(['workspace', 'switch', 'trading']);
        await run(['workspace', 'migrate', 'prod', '--minor']);
        const promoted = readJson(path.join(wsDir, '.calm-workspace', 'bundles', 'trading-prod', 'files', 'gateway.json'));
        expect(promoted.$id).toBe(prodId('1.0.0'));
    });

    test('an edit in dev promotes as a bump off the prod latest', async () => {
        const doc = readJson(gatewayFile);
        (doc.nodes as { description: string }[])[0].description = 'edited in dev';
        writeJson(gatewayFile, doc);

        await run(['workspace', 'bump', '--minor']);
        await run(['workspace', 'push']);
        await run(['workspace', 'migrate', 'prod', '--minor']);

        const promoted = readJson(path.join(wsDir, '.calm-workspace', 'bundles', 'trading-prod', 'files', 'gateway.json'));
        // prod latest was 1.0.0, so a minor promotion lands at 1.1.0 regardless of the dev version.
        expect(promoted.$id).toBe(prodId('1.1.0'));
    });

    test('push --expect-environment fails when the bundle belongs elsewhere', async () => {
        await expect(
            run(['workspace', 'push', '--expect-environment', 'prod'])
        ).rejects.toHaveProperty('exitCode', 1);
    });
});
```

- [ ] **Step 2: Build the hub image and the CLI**

```bash
bash scripts/build-hub-smoke-image.sh
npm run build:cli
```

- [ ] **Step 3: Run the smoke suite**

Run: `npm run test:smoke --workspace cli`
Expected: PASS, including the pre-existing flows. Requires Docker.

- [ ] **Step 4: Commit**

```bash
git add cli/smoke/migrate.smoke.spec.ts
git commit -m "test(cli): add a smoke test for workspace environment promotion"
```

---

### Task 10: Documentation

**Files:**
- Modify: `cli/AGENTS.md`
- Modify: `cli/README.md`

- [ ] **Step 1: Update `cli/AGENTS.md`**

Add `migrate` to the `workspace` subcommand list, and append this bullet after the `workspace environment` bullet added by the previous plan:

```markdown
    - `workspace migrate <environment>` — promote every tracked document to another environment. Rewrites `$id`s and inter-document references to the target, re-derives each version against the *target* hub (new there → keep the source version; content already published → reuse that version; otherwise bump off the target's latest), and writes the result to a new bundle. **Publishes nothing** — `workspace push` still does that. `--as <name>` overrides the derived bundle name (`trading` in dev → `trading-prod`); `--major`/`--minor`/`--patch` skip prompts; `--inherit-change-type` silences cascade prompts; `--fail-on-drift` errors when the target hub has moved past what this workspace last promoted; `--dry-run` prints the plan and writes nothing. Documents with a non-CalmHub `$id` (flow, adr, timeline) are copied verbatim and not versioned.
```

- [ ] **Step 2: Update `cli/README.md`**

Extend the `### Environments` section added by the previous plan with a `#### Promoting between environments` subsection containing the `migrate` command reference and the full "Setup 1" walkthrough from the spec's End-to-end walkthroughs section, including the CI steps that were omitted before.

- [ ] **Step 3: Verify the docs match the implementation**

Run: `npm run link:cli` from the repository root, then `calm workspace migrate --help`
Expected: the flags and descriptions match what the docs claim. Fix whichever is wrong.

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
git commit -m "docs(cli): document workspace migrate"
git push -u origin feat/workspace-migrate
```

Then open a PR using the repository template at `.github/pull_request_template.md`, populating every section accurately.
