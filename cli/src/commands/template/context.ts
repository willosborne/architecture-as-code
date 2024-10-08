
// interface Context {}

import { getCalmNodeById, getCalmRelationshipById } from "./parse-calm.js"

function buildContext(calmDocument: object) {
    const nodes = {}
    for (const node of calmDocument['nodes']) {
        const uniqueId = node['unique-id']
        nodes[uniqueId] = node
    }
    return {
        nodes: nodes
    }
}

export function enrichWithRelationshipContext(uniqueId: string, calmDocument: object, relationshipObject: object) {
    const context = buildContext(calmDocument) 
    const relationship = getCalmRelationshipById(uniqueId, calmDocument);
    const sourceId = relationship['relationship-type']?.connects?.source?.node
    const destinationId = relationship['relationship-type']?.connects?.destination?.node
    if (sourceId) {
        const sourceNode = getCalmNodeById(sourceId, calmDocument);
        context['source'] = sourceNode
    }
    if (destinationId) {
        const destinationNode = getCalmNodeById(sourceId, calmDocument);
        context['destination'] = destinationNode
    }
    relationshipObject['@context'] = context;
}