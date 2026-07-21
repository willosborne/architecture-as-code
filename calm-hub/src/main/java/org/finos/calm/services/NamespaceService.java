package org.finos.calm.services;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.finos.calm.domain.UserAccess;
import org.finos.calm.domain.exception.NamespaceAlreadyExistsException;
import org.finos.calm.domain.exception.NamespaceNotEmptyException;
import org.finos.calm.domain.exception.NamespaceNotFoundException;
import org.finos.calm.domain.exception.NamespaceParentNotFoundException;
import org.finos.calm.domain.namespaces.NamespaceInfo;
import org.finos.calm.store.NamespaceStore;
import org.finos.calm.store.UserAccessStore;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@ApplicationScoped
public class NamespaceService {

    private static final Logger LOG = LoggerFactory.getLogger(NamespaceService.class);

    private final NamespaceStore namespaceStore;
    private final UserAccessStore userAccessStore;
    private final NamespaceContentService namespaceContentService;

    @Inject
    public NamespaceService(NamespaceStore namespaceStore, UserAccessStore userAccessStore,
                            NamespaceContentService namespaceContentService) {
        this.namespaceStore = namespaceStore;
        this.userAccessStore = userAccessStore;
        this.namespaceContentService = namespaceContentService;
    }

    public List<NamespaceInfo> getNamespaces() {
        return namespaceStore.getNamespaces();
    }

    public void updateNamespaceDescription(String name, String description) throws NamespaceNotFoundException {
        namespaceStore.updateNamespaceDescription(name, description);
    }

    public void createNamespace(String name, String description) throws NamespaceAlreadyExistsException {
        if (name.contains(".")) {
            String parent = name.substring(0, name.lastIndexOf('.'));
            boolean parentExists = namespaceStore.getNamespaces().stream()
                    .anyMatch(ns -> parent.equals(ns.getName()));
            if (!parentExists) {
                throw new NamespaceParentNotFoundException(parent);
            }
        }
        namespaceStore.createNamespace(name, description);
        insertPublicReadGrant(name);
    }

    public void deleteNamespace(String name) throws NamespaceNotFoundException, NamespaceNotEmptyException {
        if (!namespaceStore.namespaceExists(name)) {
            throw new NamespaceNotFoundException();
        }

        if (namespaceContentService.hasContent(name)) {
            throw new NamespaceNotEmptyException(name);
        }

        // Checked last, immediately before the delete, rather than first — this shrinks the
        // window in which a concurrent createNamespace(name + ".child", ...) could slip in
        // between this check and the delete below, from "the whole content scan above" down
        // to "the gap between these two store calls". It does not close that window entirely:
        // neither store backend holds a lock/transaction spanning both calls (Nitrite's
        // ReentrantLock only guards each individual store operation, and Mongo has no
        // equivalent at all), so a namespace could in principle still gain a child in that
        // narrow gap and be deleted anyway, orphaning it. Fully eliminating the race would
        // require the store layer itself to check-and-delete atomically.
        int childNamespaceCount = (int) namespaceStore.getNamespaces().stream()
                .map(NamespaceInfo::getName)
                .filter(ns -> ns.startsWith(name + "."))
                .count();
        if (childNamespaceCount > 0) {
            throw new NamespaceNotEmptyException(name, childNamespaceCount);
        }

        namespaceStore.deleteNamespace(name);
        userAccessStore.deleteAllUserAccessForNamespace(name);
        LOG.info("Deleted namespace [{}] and its user-access grants", name);
    }

    private void insertPublicReadGrant(String namespace) {
        try {
            userAccessStore.createUserAccessForNamespace(
                    new UserAccess("*", UserAccess.Permission.read, namespace));
            LOG.info("Inserted default * read grant for namespace [{}]", namespace);
        } catch (NamespaceNotFoundException e) {
            LOG.warn("Could not insert default * read grant for namespace [{}] — namespace not found immediately after creation", namespace);
        }
    }
}
