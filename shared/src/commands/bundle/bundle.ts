import { SchemaDirectory } from "@finos/calm-shared/schema-directory";
import { buildBundleIndex } from "./bundle-index";
import { readFile } from "fs/promises";
import { writeBundle } from "./bundle-writer";

export async function bundlePatternArchitecture(architectureFilename: string, patternFilename: string, schemaDirectoryPath: string, outputDir: string) {
    const schemaDirectory = new SchemaDirectory();
    await schemaDirectory.loadSchemas(schemaDirectoryPath);

    const architectureJson = await readFile(architectureFilename, 'utf-8');
    const architecture = JSON.parse(architectureJson);
    const patternJson = await readFile(patternFilename, 'utf-8');
    const pattern = JSON.parse(patternJson);

    const bundleIndex = await buildBundleIndex(architecture, pattern, schemaDirectory);
    console.log(bundleIndex);
    await writeBundle(outputDir, bundleIndex, schemaDirectory);
}