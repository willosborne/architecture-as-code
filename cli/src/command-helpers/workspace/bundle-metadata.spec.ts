import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdir, writeFile, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const mocks = vi.hoisted(() => ({
    loggerWarn: vi.fn(),
}));

vi.mock('@finos/calm-shared/src/logger', () => ({
    initLogger: () => ({
        info: vi.fn(),
        warn: mocks.loggerWarn,
        error: vi.fn(),
        debug: vi.fn(),
    }),
}));

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
        mocks.loggerWarn.mockClear();
    });

    afterAll(async () => {
        await rm(gitRoot, { recursive: true, force: true });
    });

    it('returns undefined when bundle.json is absent, and stays completely silent', async () => {
        expect(await loadBundleMetadata(bundlePath)).toBeUndefined();
        expect(mocks.loggerWarn).not.toHaveBeenCalled();
    });

    it('returns undefined and warns when bundle.json is invalid JSON', async () => {
        await writeFile(path.join(bundlePath, BUNDLE_METADATA_FILENAME), 'not json {{{', 'utf8');
        expect(await loadBundleMetadata(bundlePath)).toBeUndefined();
        expect(mocks.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('not valid JSON'));
    });

    it('returns undefined and warns when bundle.json parses to a non-object', async () => {
        await writeFile(path.join(bundlePath, BUNDLE_METADATA_FILENAME), '[1, 2, 3]', 'utf8');
        expect(await loadBundleMetadata(bundlePath)).toBeUndefined();
        expect(mocks.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('does not contain a JSON object'));
    });

    it('treats a misspelled environment as absent but preserves other fields, and warns', async () => {
        await writeFile(path.join(bundlePath, BUNDLE_METADATA_FILENAME), JSON.stringify({ enviroment: 'dev' }), 'utf8');
        const metadata = await loadBundleMetadata(bundlePath);
        expect(metadata?.environment).toBeUndefined();
        expect(mocks.loggerWarn).not.toHaveBeenCalled();
    });

    it('warns and treats environment as absent when it is not a string', async () => {
        await writeFile(path.join(bundlePath, BUNDLE_METADATA_FILENAME), JSON.stringify({ environment: 123, promotedFrom: 'trading' }), 'utf8');
        const metadata = await loadBundleMetadata(bundlePath);
        expect(metadata).toEqual({ promotedFrom: 'trading', environment: undefined });
        expect(mocks.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('non-string \'environment\''));
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
