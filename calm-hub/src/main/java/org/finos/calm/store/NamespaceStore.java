package org.finos.calm.store;

import org.finos.calm.domain.exception.NamespaceAlreadyExistsException;
import org.finos.calm.domain.exception.NamespaceNotFoundException;
import org.finos.calm.domain.namespaces.NamespaceInfo;

import java.util.List;

public interface NamespaceStore {
    List<NamespaceInfo> getNamespaces();
    boolean namespaceExists(String namespaceName);
    void createNamespace(String name, String description) throws NamespaceAlreadyExistsException;

    /**
     * Updates the description of an existing namespace. The namespace name itself is
     * immutable — only the description can be changed.
     *
     * @param name        the name of the namespace to update
     * @param description the new description
     * @throws NamespaceNotFoundException if no namespace with the given name exists
     */
    void updateNamespaceDescription(String name, String description) throws NamespaceNotFoundException;

    /**
     * Deletes a namespace. Callers are responsible for verifying the namespace is empty
     * (no content, no child namespaces) before calling this — this method performs no such
     * checks itself.
     *
     * @param name the name of the namespace to delete
     * @throws NamespaceNotFoundException if no namespace with the given name exists
     */
    void deleteNamespace(String name) throws NamespaceNotFoundException;
}
