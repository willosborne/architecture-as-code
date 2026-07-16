package org.finos.calm.model;

/**
 * Structured form of a namespace-scoped CALM document id, e.g.
 * {@code $BASE_URL/calm/namespaces/$NAMESPACE/$TYPE/$MAPPING/versions/$VERSION}.
 */
public record CalmNamespaceResourceId(
        String baseUrl,
        String namespace,
        String type,
        String mapping,
        String version
) implements CalmDocumentIdStructured {
}
