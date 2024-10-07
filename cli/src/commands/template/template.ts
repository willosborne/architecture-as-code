import Handlebars from "handlebars";
import { promises as fs } from 'node:fs';
import { getCalmNodeById, getCalmRelationshipById, parseTemplatePropertiesFromCalmObject } from "./parse-calm.js";
import path, { relative } from "node:path";
import { ConstantProperties, ExtractedProperties, NodeConfig, parsePatternConfig, TemplateConfig } from "./model/pattern-config.js";
import { combinePropertes } from "./utils.js";


async function loadCalm(filename: string, debug: boolean) {
    if (debug)
        console.log("loading calm file from " + filename)
    
    const data = await fs.readFile(filename, { encoding: 'utf-8' });
    return JSON.parse(data);
}

async function loadTemplatesInDirectory(directory: string): Promise<Map<string, HandlebarsTemplateDelegate>> {
    const files = await fs.readdir(directory);
    const output = new Map<string, HandlebarsTemplateDelegate>()

    for (const file of files) {
        const filePath = path.join(directory, file);
        const fileContent = await fs.readFile(filePath, { encoding: 'utf-8' });
        output.set(file, Handlebars.compile(fileContent))
    }

    return output;
}

function initHandlebars() {
    Handlebars.registerHelper('helperMissing', (...args) => {
        var options = args[args.length-1];
        var sliced = Array.prototype.slice.call(args, 0, args.length-1)
        throw new Error("Missing element " + options.name)
    })
}

export default async function(filename: string, templatesPath: string, configFilename: string, debug: boolean, output: string) {
    if (debug)
        console.log("generating from " + filename);

    initHandlebars();

    const calm = await loadCalm(filename, debug);
    if (debug) {
        console.log("Loaded CALM: ", calm);
    }

    const templates = await loadTemplatesInDirectory(templatesPath);

    const patternConfig = await parsePatternConfig(configFilename);
    const globalProperties = !!patternConfig?.globals?.properties 
        ? parseTemplatePropertiesFromCalmObject(patternConfig.globals.properties, calm) 
        : {};

    const constants = !!patternConfig?.globals?.constants 
        ? patternConfig.globals.constants
        : {}; 

    if (debug) console.log(templates);

    const outputValues = new Map<string, string>();

    for (const nodeConfig of patternConfig.nodes) {
        const nodeValues = await generateNode(nodeConfig, globalProperties, constants, templates, calm);
        for (const [id, value] of nodeValues) {
            if (outputValues.has(id)) {
                console.error(`Duplicate output filename ${id}! You are using the same template multiple times.`)
                console.error('Please use the `output-filename` property on your template config to disambiguate.')
                process.exit(1);
            }
            outputValues.set(id, value);
        }
    }

    for (const relationshipConfig of patternConfig.relationships) {
        const relationshipValues = await generateRelationship(relationshipConfig, globalProperties, constants, templates, calm);
        for (const [id, value] of relationshipValues) {
            if (outputValues.has(id)) {
                console.error(`Duplicate output filename ${id}! You are using the same template multiple times.`)
                console.error('Please use the `output-filename` property on your template config to disambiguate.')
                process.exit(1);
            }
            outputValues.set(id, value);
        }
    }

    if (!output) {
        const outputString = zipYamlDocs(Array.from(outputValues.values()));
        console.log(outputString);
    }
    else {
        await writeFiles(output, outputValues);
    }
}

async function generateNode(
        config: NodeConfig, 
        globalProperties: ExtractedProperties, 
        constants: ConstantProperties, 
        compiledTemplates: Map<string, HandlebarsTemplateDelegate>, 
        calmDocument: object
    ): Promise<[string, string][]> {

    const calmObject = getCalmNodeById(config['unique-id'], calmDocument);
    console.log("calm object parsed: " + JSON.stringify(calmObject))
    const output = [];

    for (const templateConfig of config.templates) {
        const template = compiledTemplates.get(templateConfig.filename);
        const properties: ExtractedProperties = parseTemplatePropertiesFromCalmObject(
            templateConfig.properties, calmObject
        );

        const merged = combinePropertes(properties, globalProperties, constants)
        const id = getOutputFilename(templateConfig, config['unique-id']);
        output.push([id, template(merged)]);
    }

    return output;
}

async function generateRelationship(
        config: NodeConfig, 
        globalProperties: ExtractedProperties, 
        constants: ConstantProperties, 
        compiledTemplates: Map<string, HandlebarsTemplateDelegate>, 
        calmDocument: object
    ): Promise<[string, string][]> {

    const calmObject = getCalmRelationshipById(config['unique-id'], calmDocument);
    console.log("calm object parsed: " + JSON.stringify(calmObject))
    const output = [];

    console.log(JSON.stringify(config))
    for (const templateConfig of config.templates) {
        const template = compiledTemplates.get(templateConfig.filename);
        const properties: ExtractedProperties = parseTemplatePropertiesFromCalmObject(
            templateConfig.properties, calmObject
        );

        const merged = combinePropertes(properties, globalProperties, constants)
        const id = getOutputFilename(templateConfig, config['unique-id']);
        output.push([id, template(merged)]);
    }

    return output;
}

function getOutputFilename(templateConfig: TemplateConfig, uniqueId: string) {
    return templateConfig['output-filename'] ?? templateConfig.filename;
}

async function writeFiles(outputDirectory: string, outputFiles: Map<string, string>) {
    console.log(`Writing files to directory '${outputDirectory}'`)
    await fs.mkdir(outputDirectory, { recursive: true });
    for (const [template, output] of outputFiles) {
        const outputPath = path.join(outputDirectory, template)
        await fs.writeFile(outputPath, output, { encoding: 'utf-8' });
        if (template.endsWith('.sh')) {
            await fs.chmod(outputPath, '755')
        }
    }
}

function zipYamlDocs(docs: string[]): string {
    return "---\n" + docs.join("\n---\n");
}