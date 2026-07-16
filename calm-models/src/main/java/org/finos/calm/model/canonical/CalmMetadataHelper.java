package org.finos.calm.model.canonical;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.Map;

public class CalmMetadataHelper {
    public static Map<String, Object> flatten(JsonNode raw, ObjectMapper mapper) {
        if (raw == null || raw.isNull() || raw.isMissingNode()) return Map.of();
        if (raw.isArray()) {
            Map<String, Object> result = new LinkedHashMap<>();
            raw.forEach(item -> item.fields().forEachRemaining(e -> {
                Object value = mapper.convertValue(e.getValue(), Object.class);
                if (value != null) result.put(e.getKey(), value);
            }));
            return Map.copyOf(result);
        }
        Map<String, Object> result = mapper.convertValue(raw, new TypeReference<>() {});
        result.entrySet().removeIf(e -> e.getValue() == null);
        return Map.copyOf(result);
    }
}
