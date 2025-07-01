package org.finos.calm.mcp.api;

import io.quarkiverse.mcp.server.Prompt;
import io.quarkiverse.mcp.server.Tool;
import io.quarkiverse.mcp.server.ToolArg;
import org.eclipse.microprofile.rest.client.inject.RestClient;
import org.finos.calm.mcp.api.model.AdrResponse;
import org.finos.calm.mcp.api.model.adr.Adr;
import org.jboss.resteasy.reactive.RestResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

public class AdrTool {
    @RestClient
    private AdrClient adrClient;

    Logger log = LoggerFactory.getLogger(AdrTool.class);

    @Tool(name = "getNamespaceAdrs",
            description = "Returns details of all the ADRs defined for a given namespace as a JSON object. Each JSON object contains details of a given ADR.")
    public List<Adr> getNamespaceAdrs(@ToolArg String namespaceId) {
        return adrClient.getAdrIds(namespaceId).getValues().stream()
                .map(adrId -> adrClient.getAdrDetail(namespaceId, adrId))
                .map(AdrResponse::getAdr)
                .toList();
    }

    @Tool(name = "getNamespaceAdrById",
            description = "Returns detail of a given ADR by ID. An ADR is defined for a given namespace as a JSON object.")
    public AdrResponse getAdrById(String namespaceId, String adrId) {
        return adrClient.getAdrDetail(namespaceId, adrId);
    }

    @Tool(name = "createAdr",
            description = "Creates a new ADR in the specified namespace. The ADR is provided as a JSON object in the request body.")
    public String createAdr(@ToolArg(description = "Specifies the namespace to create the ADR on. This value MUST be provided. If it is not provided, prompt the user for which they want to use. Retrieve the list of namespaces to choose from with the getNamespaces tool") String namespaceId,
                            @ToolArg Adr adr) {
        log.info("Creating ADR in namespace: {}. ADR: {}", namespaceId, adr);
        RestResponse<Void> response = adrClient.createAdr(namespaceId, adr);

        String location = response.getHeaders().getFirst("Location").toString();
        String id = location.substring(location.lastIndexOf("/") + 1);
        log.info("ADR created successfully in namespace: {} with ID {}", namespaceId, id);
        return "ADR created successfully in namespace: " + namespaceId + " with ID: " + id;
    }

    @Tool(name = "updateAdr",
            description = "Updates an existing ADR in the specified namespace. The ADR is provided as a JSON object in the request body. The entire ADR object is updated, not just specific fields. As such, if you want to update a specific field, you should retrieve the existing ADR, modify the field you want to change, and then send the entire updated ADR object in the request body.")
    public String updateAdr(@ToolArg(description = "Specifies the namespace to create the ADR on. This value MUST be provided. If it is not provided, prompt the user for which they want to use. Retrieve the list of namespaces to choose from with the getNamespaces tool") String namespaceId,
                            @ToolArg(description = "Specifies the ID of the ADR to update. This value MUST be provided. If it is not provided, prompt the user for which they want to use.") String adrId,
                            @ToolArg Adr adr) {
        log.info("Creating ADR in namespace: {}. ADR: {}", namespaceId, adr);
        adrClient.updateAdr(namespaceId, adrId, adr);

        return "ADR with ID " + adrId + "updated successfully in namespace: " + namespaceId;
    }
}
