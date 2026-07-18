package org.finos.calm.domain.audit;

/**
 * The result of an audited mutating request.
 *
 * <p>Only these two outcomes are recorded to the audit trail. Other failures
 * (400 validation errors, 404s, 409 conflicts, 500s) are routine/operational
 * and are left to ordinary application logging rather than the audit trail.</p>
 */
public enum AuditOutcome {
    SUCCESS,
    DENIED
}
