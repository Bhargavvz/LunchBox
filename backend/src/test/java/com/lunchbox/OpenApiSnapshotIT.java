package com.lunchbox;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.lunchbox.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Writes the OpenAPI contract to build/openapi/openapi.json (deterministic: keys sorted). CI diffs it against the
 * committed docs/api/openapi.json, which is what the TypeScript client is generated from. Run with
 * {@code -DupdateSnapshot=true} to refresh the committed copy after an intentional API change.
 */
class OpenApiSnapshotIT extends IntegrationTest {

    @Test
    void exportContract() throws Exception {
        String body = mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString();
        JsonNode spec = json.readTree(body);
        assertThat(spec.path("openapi").asText()).startsWith("3.");
        // The server URL depends on the test host; strip it so the snapshot is stable.
        ((com.fasterxml.jackson.databind.node.ObjectNode) spec).remove("servers");
        String pretty = json.copy().enable(SerializationFeature.INDENT_OUTPUT)
                .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS)
                .writeValueAsString(json.treeToValue(spec, Object.class)) + "\n";
        Path out = Path.of("build", "openapi", "openapi.json");
        Files.createDirectories(out.getParent());
        Files.writeString(out, pretty);
        if (Boolean.getBoolean("updateSnapshot")) {
            Path committed = Path.of("..", "docs", "api", "openapi.json");
            Files.createDirectories(committed.getParent());
            Files.writeString(committed, pretty);
        }
    }
}
