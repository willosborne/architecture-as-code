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
 * Compare a single document's `$id` against an environment.
 *
 * Returns the human-readable reason it does not belong, or `null` when it is consistent or its
 * `$id` is not CalmHub-conformant (flows, ADRs, timelines have no environment to be wrong about).
 * This is the one place the comparison itself lives — `checkEnvironmentConsistency` below and the
 * `add` command's post-hoc warning both call through here so there is exactly one copy of it.
 */
export function describeInconsistency(documentId: string, environment: WorkspaceEnvironment): string | null {
    const parsed = parseAnyDocumentId(documentId);
    if (!parsed) return null;

    if (normaliseUrl(parsed.baseUrl) !== normaliseUrl(environment.url)) {
        return `base URL is ${parsed.baseUrl}, expected ${environment.url}`;
    }

    if (parsed.kind === 'namespace') {
        if (environment.namespace && parsed.namespace !== environment.namespace) {
            return `namespace is '${parsed.namespace}', expected '${environment.namespace}'`;
        }
        return null;
    }

    if (environment.domain && parsed.domain !== environment.domain) {
        return `domain is '${parsed.domain}', expected '${environment.domain}'`;
    }

    return null;
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

        const reason = describeInconsistency(documentId, environment);
        if (reason) {
            findings.push({ id, documentId, reason });
        }
    }

    return findings;
}
