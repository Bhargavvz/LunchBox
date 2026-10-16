package com.lunchbox.common.integration;

import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

/** Builds RestClients for third parties with tight timeouts and errors classified for retry. */
public final class HttpClients {

    private HttpClients() {
    }

    public static RestClient build(RestClient.Builder builder, String baseUrl, Duration connect, Duration read) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(connect);
        factory.setReadTimeout(read);
        return builder.clone()
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .defaultStatusHandler(HttpStatusCode::isError, (request, response) -> {
                    int status = response.getStatusCode().value();
                    String body = new String(response.getBody().readNBytes(2048), StandardCharsets.UTF_8);
                    String message = request.getMethod() + " " + request.getURI().getPath() + " -> " + status + ": " + body;
                    if (status == 429 || status >= 500) {
                        throw new RetryableIntegrationException(message);
                    }
                    throw new NonRetryableIntegrationException(message);
                })
                .build();
    }

    public static RestClient build(RestClient.Builder builder, String baseUrl) {
        return build(builder, baseUrl, Duration.ofSeconds(3), Duration.ofSeconds(10));
    }
}
