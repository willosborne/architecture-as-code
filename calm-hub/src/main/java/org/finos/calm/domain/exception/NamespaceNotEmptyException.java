package org.finos.calm.domain.exception;

/**
 * Thrown when a namespace cannot be deleted because it still has content or child
 * namespaces. Carries the raw namespace name and (if applicable) a child-namespace
 * count as separate fields rather than a formatted message — the resource layer
 * (see {@code CalmResourceErrorResponses.namespaceNotEmptyResponse}) is solely
 * responsible for composing and sanitizing the user-facing message, so it isn't
 * duplicated here. Only a count is carried for children — not their names — since a
 * namespace can have arbitrarily many children and enumerating them all would make
 * the error response unbounded in size.
 */
public class NamespaceNotEmptyException extends Exception {
    private final String namespace;
    private final int childNamespaceCount;

    /**
     * @param namespace the namespace that could not be deleted because it has child namespaces
     * @param childNamespaceCount the number of child namespaces blocking deletion (greater than 0)
     */
    public NamespaceNotEmptyException(String namespace, int childNamespaceCount) {
        super("Namespace not empty: " + namespace);
        this.namespace = namespace;
        this.childNamespaceCount = childNamespaceCount;
    }

    /**
     * @param namespace the namespace that could not be deleted because it still has content
     */
    public NamespaceNotEmptyException(String namespace) {
        this(namespace, 0);
    }

    public String getNamespace() {
        return namespace;
    }

    /** Zero when the namespace was rejected for having content rather than children. */
    public int getChildNamespaceCount() {
        return childNamespaceCount;
    }
}
