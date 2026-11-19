package com.lunchbox.dispatch.allocation;

import com.lunchbox.common.config.LunchBoxProperties;
import com.lunchbox.common.integration.HttpClients;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/** Road distances when a Routes API key is configured, straight-line estimates otherwise. */
@Configuration
public class AllocationConfig {

    @Bean
    public TravelTimeProvider travelTimeProvider(LunchBoxProperties properties, RestClient.Builder restClients,
                                                 StringRedisTemplate redis, MeterRegistry meters) {
        LunchBoxProperties.Routing routing = properties.routing();
        LunchBoxProperties.Routing.Matrix matrix = routing == null ? null : routing.matrix();
        if (matrix == null || matrix.googleApiKey() == null || matrix.googleApiKey().isBlank()) {
            return new EstimatedTravelTimes();
        }
        Duration timeout = matrix.timeout() == null ? Duration.ofSeconds(10) : matrix.timeout();
        String baseUrl = matrix.baseUrl() == null || matrix.baseUrl().isBlank() ? "https://routes.googleapis.com" : matrix.baseUrl();
        RestClient http = HttpClients.build(restClients, baseUrl, Duration.ofSeconds(3), timeout);
        return new GoogleRouteMatrixTravelTimes(http, matrix.googleApiKey(), redis, meters);
    }
}
