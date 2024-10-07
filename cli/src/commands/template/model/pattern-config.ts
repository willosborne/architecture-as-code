import { readFile } from "fs/promises";
import { parse } from "yaml";

export interface PatternConfig {
    pattern: string;
    globals: Globals;
    nodes: Array<NodeConfig>;
    relationships: Array<NodeConfig>; // TODO
}

export interface NodeConfig { 
    'unique-id': string;
    templates: Array<TemplateConfig>;
}

export type RelationshipConfig = NodeConfig;

export type PropertyJsonPaths = { [key: string]: string }

export type ExtractedProperties = { [key: string]: string }

export type ConstantProperties = { [key: string]: string }

export interface Globals {
    properties: PropertyJsonPaths;
    constants: ConstantProperties;
}

export interface TemplateConfig {
    filename: string;
    'output-filename': string;
    properties: PropertyJsonPaths;
}

export async function parsePatternConfig(filename: string): Promise<PatternConfig> {
    const contents = await readFile(filename, 'utf-8');
    return parse(contents) as  PatternConfig;
}