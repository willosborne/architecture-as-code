package org.finos.calm.model;

import java.util.Optional;

/**
 * Structured form of a domain-scoped control document id, e.g.
 * {@code $BASE_URL/calm/domains/$DOMAIN/controls/$CONTROL/requirement/versions/$VERSION} or
 * {@code $BASE_URL/calm/domains/$DOMAIN/controls/$CONTROL/configurations/$CONFIG/versions/$VERSION}.
 * {@code configName} is present only when {@code kind} is {@link CalmControlDocumentKind#CONFIGURATION}.
 */
public record CalmControlDocumentId(
        String baseUrl,
        String domain,
        String controlName,
        Optional<String> configName,
        CalmControlDocumentKind kind,
        String version
) implements CalmDocumentIdStructured {
}
