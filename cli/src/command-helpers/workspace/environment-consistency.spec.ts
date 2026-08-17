import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import path from 'path';
import { checkEnvironmentConsistency, describeInconsistency } from './environment-consistency';
import { saveManifest } from './bundle';

describe('describeInconsistency', () => {
    it('returns null when the id matches the environment', () => {
        expect(describeInconsistency(
            'https://calm.corp/calm/namespaces/trading-prod/patterns/gateway/versions/1.0.0',
            { url: 'https://calm.corp', namespace: 'trading-prod' }
        )).toBeNull();
    });

    it('reports a base URL mismatch', () => {
        const reason = describeInconsistency(
            'https://calm-dev.corp/calm/namespaces/trading-prod/patterns/gateway/versions/1.0.0',
            { url: 'https://calm.corp' }
        );
        expect(reason).toMatch(/base URL is https:\/\/calm-dev\.corp, expected https:\/\/calm\.corp/);
    });

    it('reports a namespace mismatch', () => {
        const reason = describeInconsistency(
            'https://calm.corp/calm/namespaces/trading-dev/patterns/gateway/versions/1.0.0',
            { url: 'https://calm.corp', namespace: 'trading-prod' }
        );
        expect(reason).toMatch(/namespace is 'trading-dev', expected 'trading-prod'/);
    });

    it('reports a domain mismatch for control documents', () => {
        const reason = describeInconsistency(
            'https://calm.corp/calm/domains/security-dev/controls/encryption/requirement/versions/1.0.0',
            { url: 'https://calm.corp', domain: 'security-prod' }
        );
        expect(reason).toMatch(/domain is 'security-dev', expected 'security-prod'/);
    });

    it('returns null for a non-conformant id', () => {
        expect(describeInconsistency('adr-0007', { url: 'https://calm.corp' })).toBeNull();
    });

    it('ignores the namespace when the environment declares no override', () => {
        expect(describeInconsistency(
            'https://calm.corp/calm/namespaces/anything/patterns/gateway/versions/1.0.0',
            { url: 'https://calm.corp' }
        )).toBeNull();
    });
});

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
