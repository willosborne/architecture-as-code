package org.finos.calm.mcp.api.model.adr;

import java.util.Objects;

public final class Link {
    private String rel;
    private String href;

    public Link() {

    }

    public Link(String rel, String href) {
        setRel(rel);
        setHref(href);
    }

    public String getRel() {
        return rel;
    }

    public String getHref() {
        return href;
    }

    public void setRel(String rel) {
        this.rel = rel;
    }

    public void setHref(String href) {
        this.href = href;
    }

    @Override
    public boolean equals(Object obj) {
        if(obj == this) return true;
        if(obj == null || obj.getClass() != this.getClass()) return false;
        var that = (Link) obj;
        return Objects.equals(this.rel, that.rel) &&
                Objects.equals(this.href, that.href);
    }

    @Override
    public int hashCode() {
        return Objects.hash(rel, href);
    }

    @Override
    public String toString() {
        return "Link{" +
                "rel='" + rel + '\'' +
                ", href='" + href + '\'' +
                '}';
    }
}
