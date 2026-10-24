package com.lunchbox.dispatch.routing;

import com.google.auth.oauth2.GoogleCredentials;
import com.lunchbox.common.config.LunchBoxProperties;
import com.lunchbox.common.config.LunchBoxProperties.Routing;
import com.lunchbox.common.integration.HttpClients;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/** Chooses the primary {@link RouteOptimizer}: in-process OR-Tools (default) or Google Route Optimization API. */
@Configuration
public class RoutingConfig {

    public static final String PRIMARY = "primaryRouteOptimizer";

    @Bean(name = PRIMARY)
    public RouteOptimizer primaryRouteOptimizer(LunchBoxProperties properties, OrToolsRouteOptimizer orTools,
                                                RestClient.Builder restClients, MeterRegistry meters) throws IOException {
        Routing routing = properties.routing();
        if (routing == null || routing.provider() != Routing.Provider.GOOGLE) {
            return orTools;
        }
        Routing.Google google = routing.google();
        if (google == null || google.projectId() == null || google.projectId().isBlank()) {
            throw new IllegalStateException("lunchbox.routing.google.project-id is required when provider=google");
        }
        GoogleCredentials credentials = google.credentialsJson() == null || google.credentialsJson().isBlank()
                ? GoogleCredentials.getApplicationDefault()
                : GoogleCredentials.fromStream(new ByteArrayInputStream(google.credentialsJson().getBytes(StandardCharsets.UTF_8)));
        Duration timeout = google.timeout() == null ? Duration.ofSeconds(15) : google.timeout();
        // The HTTP read timeout leaves headroom over the solver's own time budget.
        RestClient http = HttpClients.build(restClients, google.baseUrl(), Duration.ofSeconds(3), timeout.plusSeconds(10));
        return new FailoverRouteOptimizer(new GoogleRouteOptimizer(http, credentials, google.projectId(), timeout),
                orTools, meters);
    }
}
