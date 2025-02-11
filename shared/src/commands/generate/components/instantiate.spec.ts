 

import { SchemaDirectory } from '../../../schema-directory';
import { instantiateGenericObject } from './instantiate';

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



describe('instantiateGenericObject', () => {
    it('instantiate object with simple properties', async () => {
        const objectDef = {
            'type': 'object',
            'properties': {
                'string-prop': {
                    'type': 'string'
                },
                'integer-prop': {
                    'type': 'integer'
                },
                'boolean-prop': {
                    'type': 'boolean'
                },
                'const-prop': {
                    'const': 'constant'
                }
            }
        };
        const result = await instantiateGenericObject(objectDef, mockSchemaDir, 'generic', [], false, true);
        expect(result)
            .toEqual(
                {
                    'string-prop': '{{ STRING_PROP }}',
                    'integer-prop': -1,
                    'boolean-prop': '{{ BOOLEAN_BOOLEAN_PROP }}',
                    'const-prop': 'constant'
                },
            );
    });
    
    it('instantiate object with nested object properties', async () => {
        const objectDef = {
            'type': 'object',
            'properties': {
                'property-name': {
                    'type': 'object',
                    'properties': {
                        'example': {
                            'type': 'string'
                        }
                    }
                }
            }
        };
        const result = await instantiateGenericObject(objectDef, mockSchemaDir, 'generic', [], false, true);
        expect(result)
            .toEqual(
                {
                    'property-name': {
                        'example': '{{ EXAMPLE }}'
                    }
                },
            );
    });

    it('instantiate object with $ref', async () => {
        const reference =  'http://calm.com/example-ref';
        const objectDef = {
            '$ref': reference
        };

        const returnedDef = {
            'type': 'object',
            'properties': {
                'property-name': {
                    'type': 'object',
                    'properties': {
                        'example': {
                            'type': 'string'
                        }
                    }
                }
            }
        };

        const spy = jest.spyOn(mockSchemaDir, 'getDefinition');
        spy.mockReturnValue(returnedDef);


        const result = await instantiateGenericObject(objectDef, mockSchemaDir, 'generic', [], false, true);
        expect(result)
            .toEqual(
                {
                    'property-name': {
                        'example': '{{ EXAMPLE }}'
                    }
                },
            );
        expect(spy).toHaveBeenCalledWith(reference);
    });

    it('instantiate object with simple array property to placeholder', async () => {
        const objectDef = {
            'type': 'object',
            'properties': {
                'property-name': {
                    'type': 'array',
                    'items': 'string'
                }
            }
        };
        const result = await instantiateGenericObject(objectDef, mockSchemaDir, 'generic', [], false, true);
        expect(result)
            .toEqual(
                {
                    'property-name': [ 
                        '{{ PROPERTY_NAME }}' 
                    ]
                },
            );
    });
    
    it('instantiate object with complex/prefixItems array property', async () => {
        const objectDef = {
            'type': 'object',
            'properties': {
                'property-name': {
                    'type': 'array',
                    'prefixItems': [
                        {
                            'type': 'object',
                            'properties': {
                                'property': {
                                    'const': 'value'
                                }
                            }
                        }
                    ]
                }
            }
        };
        const result = await instantiateGenericObject(objectDef, mockSchemaDir, 'generic', [], false, true)
        expect(result)
            .toEqual(
                {
                    'property-name': [ 
                        {
                            'property': 'value'
                        }
                    ]
                },
            );
    });
});