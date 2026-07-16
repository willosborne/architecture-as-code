package org.finos.calm.model;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class CalmArchitectureParseTest {

    static String loadFixture(String path) throws Exception {
        try (InputStream is = CalmArchitectureParseTest.class.getResourceAsStream(path)) {
            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @Test
    void parse_loadsSchemaId() throws Exception {
        CalmArchitecture arch = CalmArchitecture.parse(loadFixture("/test-architecture.json"));
        assertThat(arch.getSchemaId()).isPresent();
        CalmDocumentId schemaId = arch.getSchemaId().get();
        assertThat(schemaId.rawValue()).isEqualTo("https://calm.finos.org/calm/namespaces/finos/patterns/test-pattern/versions/1.0.0");
        assertThat(schemaId.structured()).isPresent();
        CalmNamespaceResourceId structured = (CalmNamespaceResourceId) schemaId.structured().get();
        assertThat(structured.baseUrl()).isEqualTo("https://calm.finos.org");
        assertThat(structured.namespace()).isEqualTo("finos");
        assertThat(structured.type()).isEqualTo("patterns");
        assertThat(structured.mapping()).isEqualTo("test-pattern");
        assertThat(structured.version()).isEqualTo("1.0.0");
    }

    @Test
    void parse_schemaIdEmptyWhenMissing() throws Exception {
        CalmArchitecture arch = CalmArchitecture.parse(loadFixture("/test-architecture-missing-metadata.json"));
        assertThat(arch.getSchemaId()).isEmpty();
    }

    @Test
    void parse_nonstandardId_retainsRawValueOnly() throws Exception {
        CalmArchitecture arch = CalmArchitecture.parse(loadFixture("/test-architecture-nonstandard-ids.json"));
        assertThat(arch.getId()).isPresent();
        CalmDocumentId id = arch.getId().get();
        assertThat(id.rawValue()).isEqualTo("not-a-calm-document-id");
        assertThat(id.structured()).isEmpty();
    }

    @Test
    void parse_nonstandardSchemaId_retainsRawValueOnly() throws Exception {
        CalmArchitecture arch = CalmArchitecture.parse(loadFixture("/test-architecture-nonstandard-ids.json"));
        assertThat(arch.getSchemaId()).isPresent();
        CalmDocumentId schemaId = arch.getSchemaId().get();
        assertThat(schemaId.rawValue()).isEqualTo("not-a-calm-schema-id");
        assertThat(schemaId.structured()).isEmpty();
    }

    @Test
    void parse_loadsId() throws Exception {
        CalmArchitecture arch = CalmArchitecture.parse(loadFixture("/test-architecture.json"));
        assertThat(arch.getId()).isPresent();
        CalmDocumentId id = arch.getId().get();
        assertThat(id.rawValue()).isEqualTo("https://calm.finos.org/calm/namespaces/finos/architectures/test/versions/1.0.0");
        assertThat(id.structured()).isPresent();
        CalmNamespaceResourceId structured = (CalmNamespaceResourceId) id.structured().get();
        assertThat(structured.baseUrl()).isEqualTo("https://calm.finos.org");
        assertThat(structured.namespace()).isEqualTo("finos");
        assertThat(structured.type()).isEqualTo("architectures");
        assertThat(structured.mapping()).isEqualTo("test");
        assertThat(structured.version()).isEqualTo("1.0.0");
    }

    @Test
    void parse_idEmptyWhenMissing() throws Exception {
        CalmArchitecture arch = CalmArchitecture.parse(loadFixture("/test-architecture-missing-metadata.json"));
        assertThat(arch.getId()).isEmpty();
    }

    @Test
    void parse_loadsExpectedCounts() throws Exception {
        CalmArchitecture arch = CalmArchitecture.parse(loadFixture("/test-architecture.json"));
        assertThat(arch.getNodes()).hasSize(4);
        assertThat(arch.getRelationships()).hasSize(3);
        assertThat(arch.getFlows()).hasSize(1);
    }

    @Test
    void parse_withCustomMapper_usesProvidedMapper() throws Exception {
        ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule());
        CalmArchitecture arch = CalmArchitecture.parse(loadFixture("/test-architecture.json"), mapper);
        assertThat(arch.getNodes()).hasSize(4);
    }

    @Test
    void getMetadata_returnsTopLevelValue() throws Exception {
        CalmArchitecture arch = CalmArchitecture.parse(loadFixture("/test-architecture.json"));
        assertThat(arch.getMetadata("domain")).contains("payments");
        assertThat(arch.getMetadata("owner")).contains("payments-team");
    }

    @Test
    void getMetadata_returnsEmptyForMissingKey() throws Exception {
        CalmArchitecture arch = CalmArchitecture.parse(loadFixture("/test-architecture.json"));
        assertThat(arch.getMetadata("no-such-key")).isEmpty();
    }

    @Test
    void parse_fromMap_loadsExpectedCounts() throws Exception {
        ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule());
        Map<String, Object> map = mapper.readValue(loadFixture("/test-architecture.json"), new TypeReference<>() {});
        CalmArchitecture arch = CalmArchitecture.parse(map);
        assertThat(arch.getNodes()).hasSize(4);
        assertThat(arch.getRelationships()).hasSize(3);
    }

    @Test
    void parse_fromJsonNode_loadsExpectedCounts() throws Exception {
        ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule());
        JsonNode node = mapper.readTree(loadFixture("/test-architecture.json"));
        CalmArchitecture arch = CalmArchitecture.parse(node);
        assertThat(arch.getNodes()).hasSize(4);
        assertThat(arch.getRelationships()).hasSize(3);
    }
}
