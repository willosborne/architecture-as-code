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
