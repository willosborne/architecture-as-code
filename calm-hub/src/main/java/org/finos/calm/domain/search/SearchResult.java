package org.finos.calm.domain.search;

import io.quarkus.runtime.annotations.RegisterForReflection;

import java.util.Objects;

// Returned via an opaque Response, so without this the native image strips its
// reflection metadata and Jackson serializes it as {}.
@RegisterForReflection
public class SearchResult {
    private final String namespace;
    private final int id;
    private final String name;
    private final String description;

    public SearchResult(String namespace, int id, String name, String description) {
        this.namespace = namespace;
        this.id = id;
        this.name = name;
        this.description = description;
    }

    public String getNamespace() {
        return namespace;
    }

    public int getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    @Override
    public boolean equals(Object o) {
        if (o == null || getClass() != o.getClass()) return false;
        SearchResult that = (SearchResult) o;
        return id == that.id
                && Objects.equals(namespace, that.namespace)
                && Objects.equals(name, that.name)
                && Objects.equals(description, that.description);
    }

    @Override
    public int hashCode() {
        return Objects.hash(namespace, id, name, description);
    }
}
