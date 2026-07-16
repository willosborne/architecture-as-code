package org.finos.calm.model;

import java.util.Objects;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A CALM document {@code $id}. Always retains the original raw value; {@link #structured()}
 * is populated only when the raw value matches one of the conformant CalmHub id shapes
 * (namespace-scoped resource, or domain-scoped control requirement/configuration). A
 * nonstandard id simply results in an empty {@link #structured()}.
 */
public final class CalmDocumentId {

    private static final Pattern NAMESPACE_RESOURCE_ID_PATTERN =
            Pattern.compile("^(.*)/calm/namespaces/([^/]+)/([^/]+)/([^/]+)/versions/([^/]+)$");
    private static final Pattern CONTROL_CONFIGURATION_ID_PATTERN =
            Pattern.compile("^(.*)/calm/domains/([^/]+)/controls/([^/]+)/configurations/([^/]+)/versions/([^/]+)$");
    private static final Pattern CONTROL_REQUIREMENT_ID_PATTERN =
            Pattern.compile("^(.*)/calm/domains/([^/]+)/controls/([^/]+)/requirement/versions/([^/]+)$");

    private final String rawValue;
    private final Optional<CalmDocumentIdStructured> structured;

    private CalmDocumentId(String rawValue, Optional<CalmDocumentIdStructured> structured) {
        this.rawValue = rawValue;
        this.structured = structured;
    }

    public static CalmDocumentId parse(String rawValue) {
        Objects.requireNonNull(rawValue, "rawValue must not be null");

        Matcher namespaceMatcher = NAMESPACE_RESOURCE_ID_PATTERN.matcher(rawValue);
        if (namespaceMatcher.matches()) {
            return new CalmDocumentId(rawValue, Optional.of(new CalmNamespaceResourceId(
                    namespaceMatcher.group(1),
                    namespaceMatcher.group(2),
                    namespaceMatcher.group(3),
                    namespaceMatcher.group(4),
                    namespaceMatcher.group(5)
            )));
        }

        Matcher configMatcher = CONTROL_CONFIGURATION_ID_PATTERN.matcher(rawValue);
        if (configMatcher.matches()) {
            return new CalmDocumentId(rawValue, Optional.of(new CalmControlDocumentId(
                    configMatcher.group(1),
                    configMatcher.group(2),
                    configMatcher.group(3),
                    Optional.of(configMatcher.group(4)),
                    CalmControlDocumentKind.CONFIGURATION,
                    configMatcher.group(5)
            )));
        }

        Matcher requirementMatcher = CONTROL_REQUIREMENT_ID_PATTERN.matcher(rawValue);
        if (requirementMatcher.matches()) {
            return new CalmDocumentId(rawValue, Optional.of(new CalmControlDocumentId(
                    requirementMatcher.group(1),
                    requirementMatcher.group(2),
                    requirementMatcher.group(3),
                    Optional.empty(),
                    CalmControlDocumentKind.REQUIREMENT,
                    requirementMatcher.group(4)
            )));
        }

        return new CalmDocumentId(rawValue, Optional.empty());
    }

    public String rawValue() {
        return rawValue;
    }

    public Optional<CalmDocumentIdStructured> structured() {
        return structured;
    }
}
