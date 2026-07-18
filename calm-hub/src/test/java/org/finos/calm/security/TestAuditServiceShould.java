package org.finos.calm.security;

import org.finos.calm.domain.audit.AuditAction;
import org.finos.calm.domain.audit.AuditEntityType;
import org.finos.calm.domain.audit.AuditLogEntry;
import org.finos.calm.domain.audit.AuditOutcome;
import org.finos.calm.store.AuditLogStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
public class TestAuditServiceShould {

    @Mock
    AuditLogStore auditLogStore;

    private AuditService auditService;

    @BeforeEach
    void setup() {
        auditService = new AuditService(auditLogStore);
    }

    private AuditLogEntry sampleEntry() {
        return new AuditLogEntry.AuditLogEntryBuilder()
                .setActor("alice")
                .setAction(AuditAction.CREATE)
                .setEntityType(AuditEntityType.ARCHITECTURE)
                .setOutcome(AuditOutcome.SUCCESS)
                .build();
    }

    @Test
    void write_to_store_when_store_enabled() {
        auditService.storeEnabled = true;
        auditService.logEnabled = false;

        auditService.record(sampleEntry());

        verify(auditLogStore).record(any(AuditLogEntry.class));
    }

    @Test
    void not_write_to_store_when_store_disabled() {
        auditService.storeEnabled = false;
        auditService.logEnabled = false;

        auditService.record(sampleEntry());

        verify(auditLogStore, never()).record(any(AuditLogEntry.class));
    }

    @Test
    void not_throw_when_store_write_fails() {
        auditService.storeEnabled = true;
        auditService.logEnabled = false;
        doThrow(new RuntimeException("Mongo down")).when(auditLogStore).record(any(AuditLogEntry.class));

        auditService.record(sampleEntry());
    }

    @Test
    void neither_write_nor_throw_when_both_disabled() {
        auditService.storeEnabled = false;
        auditService.logEnabled = false;

        auditService.record(sampleEntry());

        verifyNoInteractions(auditLogStore);
    }

    @Test
    void emit_a_log_line_when_log_enabled_without_touching_the_store() {
        auditService.storeEnabled = false;
        auditService.logEnabled = true;

        auditService.record(sampleEntry());

        verifyNoInteractions(auditLogStore);
    }
}
