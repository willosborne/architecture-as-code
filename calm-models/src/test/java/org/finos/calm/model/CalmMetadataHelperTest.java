package org.finos.calm.model;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.finos.calm.model.canonical.CalmMetadataHelper;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CalmMetadataHelperTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void flatten_filtersNullValues() throws Exception {
        var raw = mapper.readTree("{\"valid\": \"value\", \"nullKey\": null}");
        Map<String, Object> result = CalmMetadataHelper.flatten(raw, mapper);
        assertThat(result).containsEntry("valid", "value").doesNotContainKey("nullKey");
    }

    @Test
    void flatten_filtersNullValuesInArray() throws Exception {
        var raw = mapper.readTree("[{\"k\": \"v\"}, {\"nullKey\": null}]");
        Map<String, Object> result = CalmMetadataHelper.flatten(raw, mapper);
        assertThat(result).containsEntry("k", "v").doesNotContainKey("nullKey");
    }

    @Test
    void flatten_returnsEmptyForNullInput() {
        assertThat(CalmMetadataHelper.flatten(null, mapper)).isEmpty();
    }

    @Test
    void flatten_returnsImmutableMap() throws Exception {
        var raw = mapper.readTree("{\"key\": \"value\"}");
        Map<String, Object> result = CalmMetadataHelper.flatten(raw, mapper);
        assertThatThrownBy(() -> result.put("extra", "value"))
            .isInstanceOf(UnsupportedOperationException.class);
    }
}
