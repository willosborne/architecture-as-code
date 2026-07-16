package org.finos.calm.model;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CalmDocumentIdTest {

    @Test
    void parse_namespaceResourceId_isStructured() {
        String raw = "https://calm.finos.org/calm/namespaces/finos/architectures/test/versions/1.0.0";
        CalmDocumentId id = CalmDocumentId.parse(raw);

        assertThat(id.rawValue()).isEqualTo(raw);
        assertThat(id.structured()).isPresent();
        CalmNamespaceResourceId structured = (CalmNamespaceResourceId) id.structured().get();
        assertThat(structured.baseUrl()).isEqualTo("https://calm.finos.org");
        assertThat(structured.namespace()).isEqualTo("finos");
        assertThat(structured.type()).isEqualTo("architectures");
        assertThat(structured.mapping()).isEqualTo("test");
        assertThat(structured.version()).isEqualTo("1.0.0");
    }

    @Test
    void parse_controlRequirementId_isStructured() {
        String raw = "https://calm.finos.org/calm/domains/payments/controls/encryption/requirement/versions/2.0.0";
        CalmDocumentId id = CalmDocumentId.parse(raw);

        assertThat(id.rawValue()).isEqualTo(raw);
        assertThat(id.structured()).isPresent();
        CalmControlDocumentId structured = (CalmControlDocumentId) id.structured().get();
        assertThat(structured.baseUrl()).isEqualTo("https://calm.finos.org");
        assertThat(structured.domain()).isEqualTo("payments");
        assertThat(structured.controlName()).isEqualTo("encryption");
        assertThat(structured.configName()).isEmpty();
        assertThat(structured.kind()).isEqualTo(CalmControlDocumentKind.REQUIREMENT);
        assertThat(structured.version()).isEqualTo("2.0.0");
    }

    @Test
    void parse_controlConfigurationId_isStructured() {
        String raw = "https://calm.finos.org/calm/domains/payments/controls/encryption/configurations/tls/versions/3.0.0";
        CalmDocumentId id = CalmDocumentId.parse(raw);

        assertThat(id.rawValue()).isEqualTo(raw);
        assertThat(id.structured()).isPresent();
        CalmControlDocumentId structured = (CalmControlDocumentId) id.structured().get();
        assertThat(structured.baseUrl()).isEqualTo("https://calm.finos.org");
        assertThat(structured.domain()).isEqualTo("payments");
        assertThat(structured.controlName()).isEqualTo("encryption");
        assertThat(structured.configName()).contains("tls");
        assertThat(structured.kind()).isEqualTo(CalmControlDocumentKind.CONFIGURATION);
        assertThat(structured.version()).isEqualTo("3.0.0");
    }

    @Test
    void parse_nonstandardId_retainsRawValueOnly() {
        String raw = "not-a-calm-document-id";
        CalmDocumentId id = CalmDocumentId.parse(raw);

        assertThat(id.rawValue()).isEqualTo(raw);
        assertThat(id.structured()).isEmpty();
    }
}
