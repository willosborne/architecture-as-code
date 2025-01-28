import { SchemaDirectory } from '@finos/calm-shared/schema-directory';
import * as fs from 'fs/promises';
import { BundleIndex } from './bundle-index';

export async function writeBundle(outputDir: string, indexDef: BundleIndex, schemaDirectory: SchemaDirectory): Promise<void> {
    try {
        await fs.rmdir(outputDir);
    }
    catch (err) {
        console.error(`Directory ${outputDir} is not empty!`)
        console.error(err);

        throw err;
    }

    await fs.mkdir(outputDir);
    await fs.mkdir(outputDir + '/schemas')
    await fs.mkdir(outputDir + '/patterns')
    // await fs.mkdir(outputDir + '/patterns')
    await indexDef.schemaPaths.forEach(async (val, key) => {
        const schema = await schemaDirectory.getSchema(key)
        await fs.writeFile(outputDir +  val, JSON.stringify(schema))
    });
    await indexDef.patternPaths.forEach(async (val, key) => {
        const schema = await schemaDirectory.getSchema(key)
        await fs.writeFile(outputDir +  val, JSON.stringify(schema))
    });

    const indexJson = JSON.stringify(indexDef);
    await fs.writeFile(outputDir + '.calm-bundle.json', indexJson);
    // await fs.writeFile(indexDef.architecturePath)
}