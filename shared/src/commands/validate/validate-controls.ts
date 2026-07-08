import pointer from 'json-pointer';
import { CalmCore, CalmControlDetail } from '@finos/calm-models/model';
import { CalmCoreSchema } from '@finos/calm-models/types';
import { ErrorObject } from 'ajv/dist/2020.js';
import { SchemaDirectory } from '../../schema-directory.js';
import { JsonSchemaValidator } from './json-schema-validator.js';
import { ValidationOutput } from './validation.output.js';
import { initLogger, Logger } from '../../logger.js';
import { getErrorMessage } from '../../error-utils.js';

type ControlDetailResult = { outputs: ValidationOutput[], hasErrors: boolean };

/**
 * Validate all control requirements in the architecture against their requirement schemas.
 *
 * Controls are collected from all levels: top-level, nodes, relationships, and flows.
 * For each control detail with a config, the requirement schema is loaded and used to
 * validate the config via AJV.
 *
 * If a requirement-url starts with '#', it is treated as a JSON pointer into the pattern
 * document. This allows control requirement schemas to be embedded in the pattern itself.
 *
 * @param architecture  Raw architecture object
 * @param pattern       Pattern document (needed for '#'-prefixed requirement-url resolution)
 * @param schemaDirectory  For loading requirement schemas and configs by URL
 * @param debug         Enable debug logging
 */
export async function validateAllControls(
    architecture: object,
    pattern: object | undefined,
    schemaDirectory: SchemaDirectory,
    debug: boolean
): Promise<{ jsonSchemaOutputs: ValidationOutput[], hasErrors: boolean, hasWarnings: boolean }> {
    const logger = initLogger(debug, 'validate-controls');
    const outputs: ValidationOutput[] = [];
    let hasErrors = false;
    let hasWarnings = false;

    if (JSON.stringify(architecture).includes('"control-requirement-url"')) {
        outputs.push(legacyNamingWarning());
        hasWarnings = true;
    }

    let calmCore: CalmCore;
    try {
        calmCore = CalmCore.fromSchema(architecture as CalmCoreSchema);
    } catch (err) {
        logger.debug(`Could not parse architecture with CalmCore.fromSchema: ${err}`);
        return { jsonSchemaOutputs: outputs, hasErrors, hasWarnings };
    }

    for (const context of collectControlContexts(calmCore)) {
        for (const [reqIdx, detail] of context.requirements.entries()) {
            const controlPath = `${context.pathPrefix}/${context.controlId}/requirements/${reqIdx}`;
            const result = await validateControlDetail(detail, controlPath, pattern, schemaDirectory, debug);
            outputs.push(...result.outputs);
            if (result.hasErrors) hasErrors = true;
        }
    }

    return { jsonSchemaOutputs: outputs, hasErrors, hasWarnings };
}

async function validateControlDetail(
    detail: CalmControlDetail,
    controlPath: string,
    pattern: object | undefined,
    schemaDirectory: SchemaDirectory,
    debug: boolean
): Promise<ControlDetailResult> {
    const logger = initLogger(debug, 'validate-controls');
    const requirementUrl = detail.requirement.reference;

    if (!requirementUrl) {
        logger.debug(`Skipping control at ${controlPath}: requirement-url is missing (possible legacy naming)`);
        return nothing();
    }

    const { schema: requirementSchema, error: schemaError } = await resolveRequirementSchema(requirementUrl, controlPath, pattern, schemaDirectory);
    if (schemaError) return fail(schemaError);
    if (!requirementSchema) return nothing();

    const { config, error: configError } = await resolveConfig(detail, controlPath, schemaDirectory, logger);
    if (configError) return fail(configError);
    if (!config) return nothing();

    return runSchemaValidation(config, requirementSchema, requirementUrl, controlPath, schemaDirectory, debug);
}

async function resolveRequirementSchema(
    requirementUrl: string,
    controlPath: string,
    pattern: object | undefined,
    schemaDirectory: SchemaDirectory
): Promise<{ schema?: object, error?: ValidationOutput }> {
    if (requirementUrl.startsWith('#')) {
        // resolve an in-pattern ref (i.e. inline control requirement schema)
        return resolvePointerInPattern(requirementUrl, controlPath, pattern);
    }
    return loadSchemaFromDirectory(requirementUrl, controlPath, schemaDirectory);
}

/**
 * Resolve an in-pattern requirement schema reference (JSON pointer) to the actual schema definition.
 * This is how inline control requirement schemas are supported in patterns.
 * @param requirementUrl JSON Pointer style ref to a schema within the pattern
 * @param controlPath Path to the control definition in the architecture
 * @param pattern Pattern as parsed JSON object
 * @returns Schema definition
 */
function resolvePointerInPattern(
    requirementUrl: string,
    controlPath: string,
    pattern: object | undefined
): { schema?: object, error?: ValidationOutput } {
    if (!pattern) {
        return { error: controlError(controlPath, `requirement-url '${requirementUrl}' is a JSON pointer but no pattern document is available`) };
    }
    try {
        return { schema: pointer.get(pattern, requirementUrl.slice(1)) as object };
    } catch {
        return { error: controlError(controlPath, `Could not resolve requirement-url '${requirementUrl}' as a JSON pointer in the pattern document`) };
    }
}

/**
 * Load a schema from the directory, wrapping errors correctly if things don't work.
 * @param requirementUrl URL of requirement doc
 * @param controlPath Path of control in the architecture
 * @param schemaDirectory Directory to use when loading document
 * @returns Resolved schema and any errors.
 */
async function loadSchemaFromDirectory(
    requirementUrl: string,
    controlPath: string,
    schemaDirectory: SchemaDirectory
): Promise<{ schema?: object, error?: ValidationOutput }> {
    let schema: object | undefined;
    try {
        schema = await schemaDirectory.getSchema(requirementUrl);
    } catch (err) {
        return { error: controlError(controlPath, `Could not load requirement schema from '${requirementUrl}': ${getErrorMessage(err)}`) };
    }
    if (!schema) {
        return { error: controlError(controlPath, `Requirement schema not found: '${requirementUrl}'`) };
    }
    return { schema };
}

/**
 * Load control config, either from inline definition or from SchemaDirectory if a URL is provided. If neither is present, returns an empty result.
 * @param detail Definition of the control detail
 * @param controlPath Path of the control in the architecture
 * @param schemaDirectory Directory to resolve document with
 * @param logger Logger
 * @returns The control config; either directly from doc if inline, or loaded via schema directory if a URL.
 */
async function resolveConfig(
    detail: CalmControlDetail,
    controlPath: string,
    schemaDirectory: SchemaDirectory,
    logger: Logger
): Promise<{ config?: Record<string, unknown>, error?: ValidationOutput }> {
    if (detail.config) {
        return { config: detail.config };
    }
    if (detail.configUrl) {
        return loadConfigFromUrl(detail.configUrl.reference, controlPath, schemaDirectory, logger);
    }
    logger.debug(`No config for control requirement at ${controlPath}, skipping`);
    return {};
}

async function loadConfigFromUrl(
    configUrl: string,
    controlPath: string,
    schemaDirectory: SchemaDirectory,
    logger: Logger
): Promise<{ config?: Record<string, unknown>, error?: ValidationOutput }> {
    let loaded: object | undefined;
    try {
        loaded = await schemaDirectory.getSchema(configUrl);
    } catch (err) {
        return { error: controlError(controlPath, `Could not load config from '${configUrl}': ${getErrorMessage(err)}`) };
    }
    if (!loaded) {
        logger.debug(`Config document not found at '${configUrl}', skipping validation`);
        return {};
    }
    return { config: loaded as Record<string, unknown> };
}

async function runSchemaValidation(
    config: Record<string, unknown>,
    requirementSchema: object,
    requirementUrl: string,
    controlPath: string,
    schemaDirectory: SchemaDirectory,
    debug: boolean
): Promise<ControlDetailResult> {
    let validator: JsonSchemaValidator;
    try {
        validator = new JsonSchemaValidator(schemaDirectory, requirementSchema, debug);
        await validator.initialize();
    } catch (err) {
        return fail(controlError(controlPath, `Could not compile requirement schema from '${requirementUrl}': ${getErrorMessage(err)}`));
    }
    const errors = validator.validate(config);
    return { outputs: controlErrorsToValidationOutputs(errors, controlPath), hasErrors: errors.length > 0 };
}

/**
 * Represents a flattened context for a control within the architecture, including its path prefix, control ID, and associated requirements.
 * Standardises representation of controls regardless of whether they are top-level, node-level, relationship-level, or flow-level.
 */
interface FlatControlContext {
    pathPrefix: string;
    controlId: string;
    requirements: CalmControlDetail[];
}

/**
 * Load all the controls from an architecture and parse to a uniform definition.
 * @param calmCore Parsed CALM architecture
 * @returns List of control contexts in standard form.
 */
function collectControlContexts(calmCore: CalmCore): FlatControlContext[] {
    const contexts: FlatControlContext[] = [];

    if (calmCore.controls) {
        for (const [controlId, control] of Object.entries(calmCore.controls.data)) {
            contexts.push({ pathPrefix: '/controls', controlId, requirements: control.requirements });
        }
    }

    calmCore.nodes.forEach((node, nodeIdx) => {
        if (node.controls) {
            for (const [controlId, control] of Object.entries(node.controls.data)) {
                contexts.push({ pathPrefix: `/nodes/${nodeIdx}/controls`, controlId, requirements: control.requirements });
            }
        }
    });

    calmCore.relationships.forEach((rel, relIdx) => {
        if (rel.controls) {
            for (const [controlId, control] of Object.entries(rel.controls.data)) {
                contexts.push({ pathPrefix: `/relationships/${relIdx}/controls`, controlId, requirements: control.requirements });
            }
        }
    });

    (calmCore.flows ?? []).forEach((flow, flowIdx) => {
        if (flow.controls) {
            for (const [controlId, control] of Object.entries(flow.controls.data)) {
                contexts.push({ pathPrefix: `/flows/${flowIdx}/controls`, controlId, requirements: control.requirements });
            }
        }
    });

    return contexts;
}

function controlErrorsToValidationOutputs(errors: ErrorObject[], controlPath: string): ValidationOutput[] {
    return errors.map(error => {
        const rawPath = error.instancePath ?? '';
        const path = rawPath === '' ? controlPath : controlPath + rawPath;
        return new ValidationOutput(
            'control-requirement-validation',
            'error',
            error.message ?? '',
            path,
            error.schemaPath,
            undefined, undefined, undefined, undefined,
            'architecture'
        );
    });
}

function legacyNamingWarning(): ValidationOutput {
    return new ValidationOutput(
        'control-legacy-naming',
        'warning',
        'Architecture contains legacy control naming (control-requirement-url). Migrate to requirement-url. Controls with legacy naming were not validated.',
        '/',
        undefined, undefined, undefined, undefined, undefined,
        'architecture'
    );
}

function controlError(path: string, message: string): ValidationOutput {
    return new ValidationOutput(
        'control-requirement-validation',
        'error',
        message,
        path,
        undefined, undefined, undefined, undefined, undefined,
        'architecture'
    );
}

function nothing(): ControlDetailResult {
    return { outputs: [], hasErrors: false };
}

function fail(output: ValidationOutput): ControlDetailResult {
    return { outputs: [output], hasErrors: true };
}
