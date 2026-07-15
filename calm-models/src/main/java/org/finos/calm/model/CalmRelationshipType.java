package org.finos.calm.model;

import org.finos.calm.model.canonical.CalmRelationshipTypeSchema;

import java.util.Objects;
import java.util.stream.Stream;

public sealed interface CalmRelationshipType
    permits CalmConnectsType, CalmInteractsType,
            CalmDeployedInType, CalmComposedOfType, CalmOptionsType {

    static CalmRelationshipType from(CalmRelationshipTypeSchema schema) {
        long count = Stream.<Object>of(
                schema.getConnects(),
                schema.getInteracts(),
                schema.getDeployedIn(),
                schema.getComposedOf(),
                schema.getOptions()
        ).filter(Objects::nonNull).count();
        if (count == 0) {
            throw new IllegalArgumentException("No recognised relationship type in schema");
        }
        if (count > 1) {
            throw new IllegalArgumentException(
                    "Exactly one relationship type must be set, but found " + count);
        }
        if (schema.getConnects() != null) return CalmConnectsType.from(schema.getConnects());
        if (schema.getInteracts() != null) return CalmInteractsType.from(schema.getInteracts());
        if (schema.getDeployedIn() != null) return CalmDeployedInType.from(schema.getDeployedIn());
        if (schema.getComposedOf() != null) return CalmComposedOfType.from(schema.getComposedOf());
        return CalmOptionsType.from(schema.getOptions());
    }
}
