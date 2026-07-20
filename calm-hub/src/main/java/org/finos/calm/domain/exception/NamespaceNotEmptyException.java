package org.finos.calm.domain.exception;

/**
 * Thrown when a namespace cannot be deleted because it still has content or child
 * namespaces. Carries the raw namespace name and (if applicable) a child-namespace
 * count as separate fields rather than a single pre-formatted message, so the resource
 * layer can sanitize the user-derived namespace name and compose the response body
 * around it. Only a count is carried for children — not their names — since a
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
        super("Namespace " + namespace + " has " + childNamespaceCount
                + " child namespace(s) and cannot be deleted");
        this.namespace = namespace;
        this.childNamespaceCount = childNamespaceCount;
    }

    /**
     * @param namespace the namespace that could not be deleted because it still has content
     */
    public NamespaceNotEmptyException(String namespace) {
        super("Namespace " + namespace + " contains resources and cannot be deleted");
        this.namespace = namespace;
        this.childNamespaceCount = 0;
    }

    public String getNamespace() {
        return namespace;
    }

    /** Zero when the namespace was rejected for having content rather than children. */
    public int getChildNamespaceCount() {
        return childNamespaceCount;
    }
}
