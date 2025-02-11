/* eslint-disable  @typescript-eslint/no-explicit-any */

import { SchemaDirectory } from '../../../schema-directory';
import { instantiateNodes } from './node';

jest.mock('../../../logger', () => {
    return {
        initLogger: () => {
            return {
                info: () => { },
                debug: () => { }
            };
        }
    };
});

jest.mock('../../../schema-directory');

let mockSchemaDir;

beforeEach(() => {
    mockSchemaDir = new SchemaDirectory(null);
});

function getSamplePatternNode(properties: any, required: any = []): any {
    return {
        properties: {
            nodes: {
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


describe('instantiateNodes', () => {
    it('return instantiated required node with array property', async () => {
        const pattern = getSamplePatternNode({
            'property-name': {
                type: 'array'
            }
        });
        const result = await instantiateNodes(pattern, mockSchemaDir, false, true)
        expect(result)
            .toEqual(
                [{
                    'property-name': [
                        '{{ PROPERTY_NAME }}'
                    ]
                }]
            );
    });

    it('return instantiated node with string property', async () => {
        const pattern = getSamplePatternNode({
            'property-name': {
                type: 'string'
            }
        });
        const result = await instantiateNodes(pattern, mockSchemaDir, false, true);
        expect(result)
            .toEqual([
                {
                    'property-name': '{{ PROPERTY_NAME }}'
                }
            ]);
    });

    it('return instantiated node with const property', async () => {
        const pattern = getSamplePatternNode({
            'property-name': {
                const: 'value here'
            }
        });

        const result = await instantiateNodes(pattern, mockSchemaDir, false, true);
        expect(result)
            .toEqual([
                {
                    'property-name': 'value here'
                }
            ]);
    });
    
    it('return instantiated node with boolean property', async () => {
        const pattern = getSamplePatternNode({
            'property-name': {
                'type': 'boolean'
            }
        });

        const result = await instantiateNodes(pattern, mockSchemaDir, false, true)
        expect(result)
            .toEqual([
                {
                    'property-name': '{{ BOOLEAN_PROPERTY_NAME }}'
                }
            ]);
    });
    
    it('only instantiate required properties when instantiateAll set to false', async () => {
        const pattern = getSamplePatternNode({
            'property-name': {
                const: 'value here'
            },
            'other-property': {
                const: 'should-be-ignored'
            }
        }, ['property-name']);

        const result = await instantiateNodes(pattern, mockSchemaDir, false, false)
        expect(result)
            .toEqual([
                {
                    'property-name': 'value here'
                }
            ]);
    });

    it('call schema directory to resolve $ref nodes`', async () => {
        const reference = 'https://calm.com/core.json#/node';
        const pattern = {
            properties: {
                nodes: {
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

        const result = await instantiateNodes(pattern, mockSchemaDir, false, true)
        expect(result)
            .toEqual([
                {
                    'property-name': 'value here'
                }
            ]);
        expect(spy).toHaveBeenCalledWith(reference);
    });

    it('return instantiated node with interfaces, even when not marked as required', async () => {
        const pattern = {
            properties: {
                nodes: {
                    type: 'array',
                    prefixItems: [
                        {
                            properties: {
                                'unique-id': {
                                    'const': 'unique-id'
                                },
                                // interfaces should be inserted
                                'interfaces': {
                                    'type': 'array',
                                    'prefixItems': [
                                        {
                                            properties: {
                                                // should insert placeholder {{ INTERFACE_PROPERTY }}
                                                'interface-property': {
                                                    'type': 'string'
                                                }
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    ]
                }

            }

        };

        const expected = [
            {
                'unique-id': 'unique-id',
                'interfaces': [
                    {
                        'interface-property': '{{ INTERFACE_PROPERTY }}'
                    }
                ]
            }
        ];

        const result = await instantiateNodes(pattern, mockSchemaDir, false, false);
        expect(result)
            .toEqual(expected);

    });
});