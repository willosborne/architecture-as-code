import jp from 'jsonpath';
import { Parameters } from './types.js';
import { Exception } from 'handlebars';
import { ExtractedProperties, PropertyJsonPaths } from './model/pattern-config.js';
import { assertUnique } from './utils.js';

function extractPropertiesByJsonPath(calmDocument: object, jsonPaths: Map<string, string>): Map<string, string> {
    const out = new Map<string, string>();
    for (const [key, path] of jsonPaths) {
        const value: string = jp.value(calmDocument, path)

        if (!value) {
            console.error("Couldn't find a key for the given json path in the CALM document. Key: ", key, ", JSONPath: ", path);
            throw Error("bad jsonpath")
        }

        out.set(key, value);
    }

    return out;
}

function getProp(props: Map<string, string>, prop: string): string {
    const val = props.get(prop);
    if (!val) {
        const msg = `Could not find property ${prop}. Could there be a missing JSONPath?` 
        throw Error(msg);
    }
    return val;
}

export function parseTemplatePropertiesFromCalmObject(requestedProperties: PropertyJsonPaths, 
    calmObject: object): ExtractedProperties {

    const out: ExtractedProperties = {}
    Object.keys(requestedProperties).forEach((key) => {
        console.log("Calm object: " + JSON.stringify(calmObject))
        const value = requestedProperties[key]
        if (isJsonPath(value)) {
            console.log("jsonpath: " + value)

            assertUnique(calmObject, value, "Could not find a match for for the requested JSONPath " + value)
            const resolvedValue: string = jp.value(calmObject, value)

            if (!resolvedValue) {
                console.error("Coudn't find a key for the given json path in the CALM document. " +
                    "Key: ", key, ", JSONPath: ", value);
                throw Error("bad jsonpath")
            }

            out[key] = resolvedValue;
        }
        else {
            out[key] = value
        }
    })

    return out;
}

function isJsonPath(val: string) {
    return /\$/.test(val)
}

export function getCalmNodeById(uniqueId: string, calmDocument: object): object {
    const jsonPath = `$.nodes[?(@["unique-id"]=='${uniqueId}')]`;

    assertUnique(calmDocument, jsonPath, "No node, or multiple, found with unique-id " + uniqueId)
    const node = jp.value(calmDocument, jsonPath)
    return node
}

export function getCalmRelationshipById(uniqueId: string, calmDocument: object): object {
    const jsonPath = `$.relationships[?(@["unique-id"]=='${uniqueId}')]`;

    assertUnique(calmDocument, jsonPath, "No relationship, or multiple, found with unique-id " + uniqueId)
    const node = jp.value(calmDocument, jsonPath)
    return node
}