package org.finos.calm.domain;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class UpdateNamespaceRequest {
    @NotNull(message = "Description must not be null")
    @NotBlank(message = "Description must not be blank")
    private String description;

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }
}
