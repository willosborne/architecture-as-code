import jp from 'jsonpath';
import { ConstantProperties, ExtractedProperties } from './model/pattern-config.js';
import _ from 'lodash';

export function assertUnique(data: object, jsonPath: string, message: string): void {
    const matches = jp.query(data, jsonPath).length;
    if (matches != 1) {
        console.log(message);
        throw new Error(message);
    }
}

export function combinePropertes(templateProperties: ExtractedProperties, globalProperties: ExtractedProperties, constants: ConstantProperties) {
    return _.merge({}, constants, globalProperties, templateProperties);
}