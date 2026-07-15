import { readFile } from 'fs/promises';
import { validate, CALM_META_SCHEMA_DIRECTORY, buildDocumentLoader, SchemaDirectory } from '@finos/calm-shared';
import { resolveFilePath } from './bundle';

export interface PostBumpValidationResult {
    id: string;
    filePath: string;
    type: 'architecture' | 'pattern';
    passed: boolean;
    /** Number of validation errors, or -1 if the file could not be read/parsed. */
    errorCount: number;
}

/**
 * Silently validate every architecture and pattern tracked in the workspace manifest and
 * return a pass/fail summary. Errors from individual documents are captured rather than thrown
 * so that a single bad file does not abort the rest.
 */
export async function runPostBumpValidation(
    bundlePath: string,
    manifest: Record<string, { path: string; type: string }>
): Promise<PostBumpValidationResult[]> {
    const docLoader = buildDocumentLoader({
        schemaDirectoryPath: CALM_META_SCHEMA_DIRECTORY,
        workspaceBundlePath: bundlePath,
        basePath: bundlePath,
        debug: false,
    });
    const schemaDir = new SchemaDirectory(docLoader, false);
    await schemaDir.loadSchemas();

    const results: PostBumpValidationResult[] = [];

    for (const [id, entry] of Object.entries(manifest)) {
        if (entry.type !== 'architecture' && entry.type !== 'pattern') continue;
        const type = entry.type as 'architecture' | 'pattern';
        const filePath = resolveFilePath(bundlePath, entry.path);

        let content: object;
        try {
            content = JSON.parse(await readFile(filePath, 'utf8'));
        } catch {
            results.push({ id, filePath, type, passed: false, errorCount: -1 });
            continue;
        }

        try {
            const outcome = type === 'architecture'
                ? await validate(content, undefined, undefined, schemaDir, false)
                : await validate(undefined, content, undefined, schemaDir, false);

            const errorCount = outcome.allValidationOutputs().filter(o => o.severity === 'error').length;
            results.push({ id, filePath, type, passed: !outcome.hasErrors, errorCount });
        } catch {
            results.push({ id, filePath, type, passed: false, errorCount: -1 });
        }
    }

    return results;
}
