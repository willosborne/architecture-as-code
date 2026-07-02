import { CalmCore } from '@finos/calm-models/model';
import { CalmCoreSchema } from '@finos/calm-models/types';
import { SchemaDirectory } from '../../schema-directory.js';
import { ValidationOutput, ValidationOutcome } from './validation.output.js';
import { initLogger, Logger } from '../../logger.js';

type CalmNode = CalmCore['nodes'][number];

type NodeDetailResult = {
    jsonSchemaOutputs: ValidationOutput[],
    spectralOutputs: ValidationOutput[],
    hasErrors: boolean,
    hasWarnings: boolean
};

/**
 * Injectable recursive validator — allows validate-node-details to call back into
 * the main validation pipeline without creating a circular module dependency.
 */
export type ArchitectureValidator = (
    architecture: object,
    pattern: object | undefined,
    schemaDirectory: SchemaDirectory,
    debug: boolean,
    visitedUrls: Set<string>
) => Promise<ValidationOutcome>;

/**
 * Validate all node details in an architecture by recursively loading and validating
 * any referenced detailed-architecture sub-architectures.
 *
 * Pattern resolution priority per node:
 *  1. `details.required-pattern` URL → loaded via schemaDirectory.getSchema()
 *  2. `$schema` field of the detailed-architecture document → loaded via schemaDirectory.getSchema()
 *  3. Neither found → recursiveValidator is called with undefined pattern
 *
 * A fresh SchemaDirectory (same DocumentLoader, empty cache) is used per sub-architecture
 * to prevent schema-ID collisions between parent and child AJV compilations.
 *
 * @param architecture       Raw architecture object
 * @param schemaDirectory    For loading sub-architectures and discovering patterns
 * @param debug              Enable debug logging
 * @param recursiveValidator Injected validator function — avoids circular import with validate.ts
 * @param visitedUrls        Tracks visited architecture URLs for cycle detection
 */
export async function validateNodeDetails(
    architecture: object,
    schemaDirectory: SchemaDirectory,
    debug: boolean,
    recursiveValidator: ArchitectureValidator,
    visitedUrls: Set<string>
): Promise<NodeDetailResult> {
    const logger = initLogger(debug, 'validate-node-details');
    const jsonSchemaOutputs: ValidationOutput[] = [];
    const spectralOutputs: ValidationOutput[] = [];
    let hasErrors = false;
    let hasWarnings = false;

    let calmCore: CalmCore;
    try {
        calmCore = CalmCore.fromSchema(architecture as CalmCoreSchema);
    } catch (err) {
        logger.debug(`Could not parse architecture with CalmCore.fromSchema: ${err}`);
        return { jsonSchemaOutputs, spectralOutputs, hasErrors, hasWarnings };
    }

    for (const [nodeIdx, node] of calmCore.nodes.entries()) {
        const result = await validateNodeDetail(node, nodeIdx, schemaDirectory, debug, recursiveValidator, visitedUrls);
        jsonSchemaOutputs.push(...result.jsonSchemaOutputs);
        spectralOutputs.push(...result.spectralOutputs);
        if (result.hasErrors) hasErrors = true;
        if (result.hasWarnings) hasWarnings = true;
    }

    return { jsonSchemaOutputs, spectralOutputs, hasErrors, hasWarnings };
}

async function validateNodeDetail(
    node: CalmNode,
    nodeIdx: number,
    schemaDirectory: SchemaDirectory,
    debug: boolean,
    recursiveValidator: ArchitectureValidator,
    visitedUrls: Set<string>
): Promise<NodeDetailResult> {
    const logger = initLogger(debug, 'validate-node-details');
    const archUrl = node.details?.detailedArchitecture?.reference;

    if (!archUrl) return emptyNodeResult();

    if (visitedUrls.has(archUrl)) {
        logger.debug(`Cycle detected: skipping already-visited architecture '${archUrl}'`);
        return emptyNodeResult();
    }
    visitedUrls.add(archUrl);

    const detailsPrefix = `/nodes/${nodeIdx}/details/detailed-architecture`;

    const { subArch, error: loadError } = await loadSubArchitecture(archUrl, detailsPrefix, schemaDirectory);
    if (loadError) return nodeError(loadError);

    const pattern = await resolvePattern(node, subArch!, schemaDirectory, logger);

    const freshDir = schemaDirectory.fork();
    await freshDir.loadSchemas();

    const { outcome, error: validationError } = await runRecursiveValidator(
        subArch!, pattern, freshDir, debug, visitedUrls, recursiveValidator, archUrl, detailsPrefix
    );
    if (validationError) return nodeError(validationError);

    return prefixedNodeResult(outcome!, detailsPrefix);
}

async function loadSubArchitecture(
    archUrl: string,
    detailsPrefix: string,
    schemaDirectory: SchemaDirectory
): Promise<{ subArch?: object, error?: ValidationOutput }> {
    try {
        return { subArch: await schemaDirectory.loadDocument(archUrl, 'architecture') };
    } catch (err) {
        return { error: nodeDetailsError(detailsPrefix, `Could not load detailed-architecture '${archUrl}': ${toErrorMessage(err)}`) };
    }
}

async function resolvePattern(
    node: CalmNode,
    subArch: object,
    schemaDirectory: SchemaDirectory,
    logger: Logger
): Promise<object | undefined> {
    if (node.details?.requiredPattern?.reference) {
        const pattern = await tryLoadSchema(node.details.requiredPattern.reference, schemaDirectory, logger, 'required-pattern');
        if (pattern) return pattern;
    }

    const schemaRef = (subArch as Record<string, unknown>)['$schema'] as string | undefined;
    if (schemaRef) {
        return tryLoadSchema(schemaRef, schemaDirectory, logger, '$schema');
    }

    return undefined;
}

async function tryLoadSchema(
    url: string,
    schemaDirectory: SchemaDirectory,
    logger: Logger,
    label: string
): Promise<object | undefined> {
    try {
        const schema = await schemaDirectory.getSchema(url);
        if (!schema) logger.debug(`Pattern from ${label} '${url}' not found in schema directory`);
        return schema;
    } catch (err) {
        logger.debug(`Could not load pattern from ${label} '${url}': ${toErrorMessage(err)}`);
        return undefined;
    }
}

async function runRecursiveValidator(
    subArch: object,
    pattern: object | undefined,
    freshDir: SchemaDirectory,
    debug: boolean,
    visitedUrls: Set<string>,
    recursiveValidator: ArchitectureValidator,
    archUrl: string,
    detailsPrefix: string
): Promise<{ outcome?: ValidationOutcome, error?: ValidationOutput }> {
    try {
        return { outcome: await recursiveValidator(subArch, pattern, freshDir, debug, visitedUrls) };
    } catch (err) {
        return { error: nodeDetailsError(detailsPrefix, `Validation of detailed-architecture '${archUrl}' failed: ${toErrorMessage(err)}`) };
    }
}

function prefixedNodeResult(outcome: ValidationOutcome, prefix: string): NodeDetailResult {
    return {
        jsonSchemaOutputs: prefixOutputs(outcome.jsonSchemaValidationOutputs, prefix),
        spectralOutputs: prefixOutputs(outcome.spectralSchemaValidationOutputs, prefix),
        hasErrors: outcome.hasErrors,
        hasWarnings: outcome.hasWarnings
    };
}

function prefixOutputs(outputs: ValidationOutput[], prefix: string): ValidationOutput[] {
    return outputs.map(output => {
        const newPath = output.path === '/' ? prefix : prefix + output.path;
        return new ValidationOutput(
            output.code,
            output.severity,
            output.message,
            newPath,
            output.schemaPath,
            output.line_start,
            output.line_end,
            output.character_start,
            output.character_end,
            output.source
        );
    });
}

function emptyNodeResult(): NodeDetailResult {
    return { jsonSchemaOutputs: [], spectralOutputs: [], hasErrors: false, hasWarnings: false };
}

function nodeError(output: ValidationOutput): NodeDetailResult {
    return { jsonSchemaOutputs: [output], spectralOutputs: [], hasErrors: true, hasWarnings: false };
}

function nodeDetailsError(path: string, message: string): ValidationOutput {
    return new ValidationOutput(
        'node-details-validation',
        'error',
        message,
        path,
        undefined, undefined, undefined, undefined, undefined,
        'architecture'
    );
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try { return JSON.stringify(error); } catch { return 'Unknown error'; }
}
