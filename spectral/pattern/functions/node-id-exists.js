import { JSONPath } from 'jsonpath-plus'
/**
 * Checks that the input value exists as a node with a matching unique ID.
 */
export default (input, _, context) => {
    if (!input) {
        return [];
    }

    const names = JSONPath({path: '$.properties.nodes.prefixItems[*].properties.unique-id.const', json: context.document.data});

    // get uniqueIds of all nodes
    // let names = context.document.data.properties?.nodes?.prefixItems?.map(node => node.properties?.["unique-id"]?.const);
    console.log("Input: ", input)
    console.log("Names: ", names)
    let results = [];

    if (!names.includes(input)) {
        results.push({
            message: `'${input}' does not refer to the unique-id of an existing node.`,
            path: [...context.path]
        });
    }
    return results;
}