package org.finos.calm.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CalmInterfaceTest {

    record PortInterface(@JsonProperty("port") int port, @JsonProperty("transport") String transport) {}

    static CalmArchitecture arch;

    @BeforeAll
    static void loadFixture() throws Exception {
        ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule());
        try (InputStream is = CalmInterfaceTest.class.getResourceAsStream("/test-architecture.json")) {
            arch = CalmArchitecture.parse(new String(is.readAllBytes(), StandardCharsets.UTF_8), mapper);
        }
    }

    @Test
    void interface_hasUniqueId() {
        CalmNode node = arch.findNodeById("payment-service").orElseThrow();
        CalmInterface iface = node.findInterface("rest-api").orElseThrow();
        assertThat(iface.uniqueId()).isEqualTo("rest-api");
    }

    @Test
    void parseAs_deserializesCustomProperties() {
        CalmNode node = arch.findNodeById("payment-service").orElseThrow();
        CalmInterface iface = node.findInterface("rest-api").orElseThrow();
        PortInterface port = iface.parseAs(PortInterface.class);
        assertThat(port.port()).isEqualTo(8443);
        assertThat(port.transport()).isEqualTo("HTTPS");
    }

    @Test
    void parseAs_throwsCalmExtensionParseException_whenMalformed() {
        CalmNode node = arch.findNodeById("payment-service").orElseThrow();
        CalmInterface iface = node.findInterface("rest-api").orElseThrow();
        assertThatThrownBy(() -> iface.parseAs(MalformedType.class))
            .isInstanceOf(CalmExtensionParseException.class);
    }

    static class MalformedType {
        @JsonProperty("port")
        public java.time.LocalDate port; // wrong type — int in JSON, LocalDate here
    }

    @Test
    void from_throwsWhenJsonIsNotObject() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        JsonNode array = mapper.readTree("[1, 2, 3]");
        assertThatThrownBy(() -> CalmInterface.from(array, mapper))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void from_throwsWhenUniqueIdIsBlank() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        JsonNode noId = mapper.readTree("{\"port\": 8080}");
        assertThatThrownBy(() -> CalmInterface.from(noId, mapper))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
