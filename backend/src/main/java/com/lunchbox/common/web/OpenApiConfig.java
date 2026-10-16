package com.lunchbox.common.web;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.ArrayList;
import java.util.Map;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI lunchBoxOpenApi() {
        return new OpenAPI()
                .info(new Info().title("LunchBox API").version("v1")
                        .description("From Home to School, Fresh Meals, Brighter Futures. All money values are in paise; "
                                + "all timestamps are ISO-8601 UTC."))
                .components(new Components().addSecuritySchemes("firebase", new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")
                        .description("Firebase ID token")))
                .addSecurityItem(new SecurityRequirement().addList("firebase"));
    }

    /**
     * Response DTOs always serialise every property (nulls included), so mark them all required. This lets the
     * generated TypeScript client use non-optional fields; nullable ones are typed as {@code T | null}.
     */
    @Bean
    @SuppressWarnings({"rawtypes", "unchecked"})
    public OpenApiCustomizer responsePropertiesRequired() {
        return openApi -> {
            if (openApi.getComponents() == null || openApi.getComponents().getSchemas() == null) {
                return;
            }
            for (Map.Entry<String, Schema> entry : openApi.getComponents().getSchemas().entrySet()) {
                String name = entry.getKey();
                Schema schema = entry.getValue();
                boolean isResponse = name.endsWith("Response") || name.endsWith("View") || name.startsWith("PageResponse");
                if (isResponse && schema.getProperties() != null) {
                    schema.setRequired(new ArrayList<>(schema.getProperties().keySet()));
                }
            }
        };
    }
}
