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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

/**
 * Checks whether a namespace holds any content, across every namespace-scoped resource
 * type. Used to guard namespace deletion — a namespace may only be deleted once it is
 * confirmed empty. Unlike {@link CountsService}, this short-circuits on the first
 * non-empty store instead of exhaustively counting every type.
 */
@ApplicationScoped
public class NamespaceContentService {

    private static final Logger logger = LoggerFactory.getLogger(NamespaceContentService.class);

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
     * Sizes a store list, treating a missing namespace as empty (mirrors
     * {@code CountsService.sizeOrZero}) so one store's not-found never fails the whole check.
     */
    private boolean isNotEmpty(NamespaceListSupplier supplier) {
        try {
            return !supplier.get().isEmpty();
        } catch (NamespaceNotFoundException e) {
            return false;
        } catch (RuntimeException e) {
            logger.warn("Failed to check a resource list while checking namespace content; treating as empty", e);
            return false;
        }
    }

    @FunctionalInterface
    private interface NamespaceListSupplier {
        List<?> get() throws NamespaceNotFoundException;
    }
}
