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
