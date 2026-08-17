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
