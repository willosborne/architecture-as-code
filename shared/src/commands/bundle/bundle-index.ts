import { SchemaDirectory } from "@finos/calm-shared/schema-directory";
import { randomUUID } from "crypto";
import { JSONPath } from "jsonpath-plus";

export interface BundleIndex {
    schemaPaths: Map<string, string>;
    patternPaths: Map<string, string>;
    // architecturePath: string;
}


/**
 * Collect all the refs for schemas referenced by this pattern.
 * @param pattern The pattern to traverse
 */
function collectSchemaRefs(pattern: object): Set<string> {
    const jsonSchemaRefs = JSONPath({path: "$..['$ref']", json: pattern});
    // const controlRefs = JSONPath({ path: "$.."})
    const schemaRefs = new Set<string>();
    for (const rawRef of jsonSchemaRefs) {
        const schemaName = SchemaDirectory.getSchemaName(rawRef);
        schemaRefs.add(schemaName);
    }
    return schemaRefs;
}

function getSchemaFilename(schema: object, counter): string {
    const title: string = schema['title'];
    return counter + title.replaceAll(/[^a-zA-Z-]/, '') + '.json';
}

export async function buildBundleIndex(architecture: object, pattern: object, schemaDirectory: SchemaDirectory): Promise<BundleIndex> {
    // const schemaRefs = collectRefs(pattern);
    let counter = 0;
    const schemaRefs = collectSchemaRefs(pattern);

    const bundleIndex: BundleIndex = {
        schemaPaths: new Map<string, string>(),
        patternPaths: new Map<string, string>,
        // architecturePath: ''
    };
    
    await schemaRefs.forEach(async (schemaId) => {
        const schema = await schemaDirectory.getSchema(schemaId);
        const schemaFilename = getSchemaFilename(schema, counter);
        counter++;
        bundleIndex.schemaPaths.set(schemaId, schemaFilename)
    })

    bundleIndex.patternPaths.set(pattern['$id'], getSchemaFilename(pattern, counter));
    // bundleIndex.architecturePath = getSchemaFilename(pattern['title'], counter);

    return bundleIndex;
}