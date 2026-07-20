package org.finos.calm.domain.audit;

import java.time.LocalDateTime;

/**
 * Filter criteria for {@link org.finos.calm.store.AuditLogStore#query(AuditLogQuery)}.
 *
 * <p>All fields are optional — unset (null) fields are not applied as filters. Not
 * exposed via any REST endpoint in this iteration; it exists so the store contract
 * has a read path for future/internal use (ops tooling, a future admin endpoint)
 * without requiring an interface change later.</p>
 */
public class AuditLogQuery {

    private String namespace;
    private String domain;
    private AuditEntityType entityType;
    private String entityId;
    private String actor;
    private LocalDateTime from;
    private LocalDateTime to;
    private Integer limit;
    private Integer offset;

    public String getNamespace() {
        return namespace;
    }

    public void setNamespace(String namespace) {
        this.namespace = namespace;
    }

    public String getDomain() {
        return domain;
    }

    public void setDomain(String domain) {
        this.domain = domain;
    }

    public AuditEntityType getEntityType() {
        return entityType;
    }

    public void setEntityType(AuditEntityType entityType) {
        this.entityType = entityType;
    }

    public String getEntityId() {
        return entityId;
    }

    public void setEntityId(String entityId) {
        this.entityId = entityId;
    }

    public String getActor() {
        return actor;
    }

    public void setActor(String actor) {
        this.actor = actor;
    }

    public LocalDateTime getFrom() {
        return from;
    }

    public void setFrom(LocalDateTime from) {
        this.from = from;
    }

    public LocalDateTime getTo() {
        return to;
    }

    public void setTo(LocalDateTime to) {
        this.to = to;
    }

    public Integer getLimit() {
        return limit;
    }

    public void setLimit(Integer limit) {
        this.limit = limit;
    }

    public Integer getOffset() {
        return offset;
    }

    public void setOffset(Integer offset) {
        this.offset = offset;
    }
}
