package org.finos.calm.services;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.finos.calm.domain.exception.NamespaceNotFoundException;
import org.finos.calm.store.AdrStore;
import org.finos.calm.store.ArchitectureStore;
import org.finos.calm.store.DecoratorStore;
import org.finos.calm.store.FlowStore;
import org.finos.calm.store.InterfaceStore;
import org.finos.calm.store.PatternStore;
import org.finos.calm.store.StandardStore;
import org.finos.calm.store.TimelineStore;

import java.util.List;

/**
 * Checks whether a namespace holds any content, across every namespace-scoped resource
 * type. Used to guard namespace deletion — a namespace may only be deleted once it is
 * confirmed empty. Unlike {@link CountsService}, this short-circuits on the first
 * non-empty store instead of exhaustively counting every type.
 */
@ApplicationScoped
public class NamespaceContentService {

    private final ArchitectureStore architectureStore;
    private final PatternStore patternStore;
    private final FlowStore flowStore;
    private final StandardStore standardStore;
    private final AdrStore adrStore;
    private final InterfaceStore interfaceStore;
    private final TimelineStore timelineStore;
    private final DecoratorStore decoratorStore;

    @Inject
    @SuppressWarnings("java:S107") // emptiness check legitimately needs every namespace-scoped store
    public NamespaceContentService(ArchitectureStore architectureStore,
                                   PatternStore patternStore,
                                   FlowStore flowStore,
                                   StandardStore standardStore,
                                   AdrStore adrStore,
                                   InterfaceStore interfaceStore,
                                   TimelineStore timelineStore,
                                   DecoratorStore decoratorStore) {
        this.architectureStore = architectureStore;
        this.patternStore = patternStore;
        this.flowStore = flowStore;
        this.standardStore = standardStore;
        this.adrStore = adrStore;
        this.interfaceStore = interfaceStore;
        this.timelineStore = timelineStore;
        this.decoratorStore = decoratorStore;
    }

    /**
     * @param namespace the namespace to check
     * @return true if the namespace holds any architecture, pattern, flow, standard, adr,
     *         interface, timeline, or decorator
     */
    public boolean hasContent(String namespace) {
        return isNotEmpty(() -> architectureStore.getArchitecturesForNamespace(namespace))
                || isNotEmpty(() -> patternStore.getPatternsForNamespace(namespace))
                || isNotEmpty(() -> flowStore.getFlowsForNamespace(namespace))
                || isNotEmpty(() -> standardStore.getStandardsForNamespace(namespace))
                || isNotEmpty(() -> adrStore.getAdrsForNamespace(namespace))
                || isNotEmpty(() -> interfaceStore.getInterfacesForNamespace(namespace))
                || isNotEmpty(() -> timelineStore.getTimelinesForNamespace(namespace))
                || isNotEmpty(() -> decoratorStore.getDecoratorsForNamespace(namespace, null, null));
    }

    /**
     * Sizes a store list, treating a missing namespace as empty so one store's not-found
     * never fails the whole check. Unlike {@code CountsService.sizeOrZero} — which backs a
     * read-only display count, where treating a store failure as zero is a harmless
     * undercount — this method gates an irreversible namespace deletion, so any other
     * failure (a store timeout, a locked file, etc.) is deliberately NOT swallowed here:
     * it propagates so the delete fails loudly instead of silently proceeding against
     * content that was never actually confirmed absent.
     */
    private boolean isNotEmpty(NamespaceListSupplier supplier) {
        try {
            return !supplier.get().isEmpty();
        } catch (NamespaceNotFoundException e) {
            return false;
        }
    }

    @FunctionalInterface
    private interface NamespaceListSupplier {
        List<?> get() throws NamespaceNotFoundException;
    }
}
