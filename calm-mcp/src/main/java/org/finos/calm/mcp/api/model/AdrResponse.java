package org.finos.calm.mcp.api.model;

import org.finos.calm.mcp.api.model.adr.Adr;

public class AdrResponse {
    private Adr adr;
    private String id;
    private String namespace;
    private String revision;

    public Adr getAdr() {
        return adr;
    }

    public void setAdr(Adr adr) {
        this.adr = adr;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getNamespace() {
        return namespace;
    }

    public void setNamespace(String namespace) {
        this.namespace = namespace;
    }

    public String getRevision() {
        return revision;
    }

    public void setRevision(String revision) {
        this.revision = revision;
    }

    @Override
    public String toString() {
        return "AdrResponse{" +
                "adr=" + adr +
                ", id='" + id + '\'' +
                ", namespace='" + namespace + '\'' +
                ", revision='" + revision + '\'' +
                '}';
    }
}
