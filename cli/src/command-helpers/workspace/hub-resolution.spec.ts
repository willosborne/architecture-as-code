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

    it('uses the bundle environment\'s url', async () => {
        mocks.loadBundleMetadata.mockResolvedValue({ environment: 'prod' });
        const result = await resolveWorkspaceHub(base);
        expect(result.calmHubOptions.calmHubUrl).toBe('https://calm.corp');
        expect(result.environmentLabel).toBe('prod');
        expect(result.environment).toEqual({ url: 'https://calm.corp', namespace: 'trading-prod' });
        // With no override, the bundle's own environment is the same as the resolved one.
        expect(result.bundleEnvironmentLabel).toBe('prod');
        expect(result.bundleEnvironment).toEqual({ url: 'https://calm.corp', namespace: 'trading-prod' });
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

    it('carries both the override\'s environment and the bundle\'s own', async () => {
        mocks.loadBundleMetadata.mockResolvedValue({ environment: 'dev' });
        const result = await resolveWorkspaceHub({ ...base, environmentOverride: 'prod' });
        expect(result.environmentLabel).toBe('prod');
        expect(result.environment).toEqual({ url: 'https://calm.corp', namespace: 'trading-prod' });
        expect(result.bundleEnvironmentLabel).toBe('dev');
        expect(result.bundleEnvironment).toEqual({ url: 'https://calm-dev.corp' });
    });

    it('leaves bundleEnvironment undefined when the override is given but the bundle itself has no environment', async () => {
        mocks.loadBundleMetadata.mockResolvedValue(undefined);
        const result = await resolveWorkspaceHub({ ...base, environmentOverride: 'prod' });
        expect(result.environmentLabel).toBe('prod');
        expect(result.bundleEnvironmentLabel).toBeUndefined();
        expect(result.bundleEnvironment).toBeUndefined();
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
