package org.finos.calm.store;

import org.finos.calm.domain.audit.AuditLogEntry;
import org.finos.calm.domain.audit.AuditLogQuery;

import java.util.List;

/**
 * Append-only store for {@link AuditLogEntry} records.
 *
 * <p>Deliberately exposes no {@code update}/{@code delete} method anywhere on this
 * interface or its implementations — tamper resistance for the audit trail is
 * enforced at the application layer by never providing a code path that could
 * modify or remove a written entry.</p>
 *
 * <p>{@link #query(AuditLogQuery)} exists for internal/future use only; no REST
 * resource is built around it in this iteration.</p>
 */
public interface AuditLogStore {
    void record(AuditLogEntry entry);
    List<AuditLogEntry> query(AuditLogQuery query);
}
