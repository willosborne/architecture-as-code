package org.finos.calm.model;

/**
 * The structured fields extracted from a conformant CALM document {@code $id}.
 * Absent entirely (via {@link CalmDocumentId#structured()}) when the raw id
 * doesn't match a recognised CALM document id shape.
 */
public sealed interface CalmDocumentIdStructured
        permits CalmNamespaceResourceId, CalmControlDocumentId {
}
