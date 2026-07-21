package org.finos.calm.domain.audit;

/**
 * The kind of mutation an audited request performed.
 */
public enum AuditAction {
    CREATE,
    UPDATE,
    DELETE,
    GRANT,
    REVOKE
}
