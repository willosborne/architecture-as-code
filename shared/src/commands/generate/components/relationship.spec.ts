/* eslint-disable  @typescript-eslint/no-explicit-any */

import { SchemaDirectory } from '../../../schema-directory';
import { instantiateRelationships } from './relationship';

jest.mock('../../../logger', () => {
    return {
        initLogger: () => {
            return {
                info: () => {},
                debug: () => {}
            };
        }
    };
});

jest.mock('../../../schema-directory');

let mockSchemaDir;

beforeEach(() => {
    mockSchemaDir = new SchemaDirectory(null);
});

function getSamplePatternRelationship(properties: any, required: string[] = []): any {
    return {
        properties: {
            relationships: {
                type: 'array',
                prefixItems: [
                    {
                        properties: properties,
                        required: required
                    }
                ]
            }
        }
    };
}

describe('instantiateRelationships', () => {

    it('return instantiated relationship with array property', async () => {
        const pattern = getSamplePatternRelationship({
            'property-name': {
                type: 'array'
            }
        });

        expect(await instantiateRelationships(pattern, mockSchemaDir, false, true))
            .toEqual(
                [{
                    'property-name': [
                        '{{ PROPERTY_NAME }}'
                    ]
                }]
            );
    });

    it('return instantiated relationship with string property', async () => {
        const pattern = getSamplePatternRelationship({
            'property-name': {
                type: 'string'
            }
        });

        expect(await instantiateRelationships(pattern, mockSchemaDir, false, true))
            .toEqual([
                {
                    'property-name': '{{ PROPERTY_NAME }}'
                }
            ]);
    });

    it('return instantiated relationship with number property', async () => {
        const pattern = getSamplePatternRelationship({
            'property-name': {
                type: 'number'
            }
        });

        expect(await instantiateRelationships(pattern, mockSchemaDir, false, true))
            .toEqual([
                {
                    'property-name': -1
                }
            ]);
    });

    it('return instantiated relationship with boolean property', async () => {
        const pattern = getSamplePatternRelationship({
            'property-name': {
                type: 'boolean'
            }
        });

        expect(await instantiateRelationships(pattern, mockSchemaDir, false, true))
            .toEqual([
                {
                    'property-name': '{{ BOOLEAN_PROPERTY_NAME }}'
                }
            ]);
    });

    it('return instantiated relationship with const property', async () => {
        const pattern = getSamplePatternRelationship({
            'property-name': {
                const: 'value here'
            }
        });

        expect(await instantiateRelationships(pattern, mockSchemaDir, false, true))
            .toEqual([
                {
                    'property-name': 'value here'
                }
            ]);
    });

    it('only instantiate required properties when instantiateAll set to false', async () => {
        const pattern = getSamplePatternRelationship({
            'property-name': {
                const: 'value here'
            },
            'ignored-prop': {
                const: 'value'
            }
        }, ['property-name']);

        expect(await instantiateRelationships(pattern, mockSchemaDir, false, false))
            .toEqual([
                {
                    'property-name': 'value here'
                }
            ]);
    });

    it('call schema directory to resolve $ref relationships', async () => {
        const reference = 'https://calm.com/core.json#/relationship';
        const pattern = {
            properties: {
                relationships: {
                    type: 'array',
                    prefixItems: [
                        {
                            '$ref': reference
                        }
                    ]
                }
            }
        };

        const spy = jest.spyOn(mockSchemaDir, 'getDefinition');
        spy.mockReturnValue({
            properties: {
                'property-name': {
                    const: 'value here'
                }
            }
        });

        expect(await instantiateRelationships(pattern, mockSchemaDir, false, true))
            .toEqual([
                {
                    'property-name': 'value here'
                }
            ]);
    });
});