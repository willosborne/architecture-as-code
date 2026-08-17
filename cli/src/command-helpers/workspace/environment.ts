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
