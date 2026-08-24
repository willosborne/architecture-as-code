import path from 'path';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { initLogger, Logger } from '@finos/calm-shared/src/logger';

const logger: Logger = initLogger(false, 'workspace');

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
 *
 * The absent-file case is silent: that is the normal, supported state for every bundle that
 * predates this feature. A file that exists but is corrupt, or that parses but carries a malformed
 * `environment`, is a different problem — one that would otherwise silently disable the
 * environment guard — so those cases log a warning even though they still return undefined /
 * a metadata object with `environment` stripped.
 */
export async function loadBundleMetadata(bundlePath: string): Promise<BundleMetadata | undefined> {
    const filePath = metadataPath(bundlePath);
    if (!existsSync(filePath)) return undefined;

    let parsed: unknown;
    try {
        parsed = JSON.parse(await readFile(filePath, 'utf8'));
    } catch {
        logger.warn(`${filePath} is not valid JSON and will be ignored. This bundle's environment cannot be read.`);
        return undefined;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        logger.warn(`${filePath} does not contain a JSON object and will be ignored. This bundle's environment cannot be read.`);
        return undefined;
    }

    const metadata = parsed as BundleMetadata;
    if (metadata.environment !== undefined && typeof metadata.environment !== 'string') {
        logger.warn(`${filePath} has a non-string 'environment' and will be treated as having none.`);
        return { ...metadata, environment: undefined };
    }

    return metadata;
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
