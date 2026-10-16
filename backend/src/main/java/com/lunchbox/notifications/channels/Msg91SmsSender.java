package com.lunchbox.notifications.channels;

import com.lunchbox.common.config.LunchBoxProperties;
import com.lunchbox.common.integration.HttpClients;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** MSG91 Flow API. Templates must be DLT-registered (TRAI); the template id per logical key comes from config. */
@Slf4j
@Component
@ConditionalOnProperty(name = "lunchbox.integrations.msg91.mode", havingValue = "live")
public class Msg91SmsSender implements SmsSender {

    private final LunchBoxProperties.Msg91 config;
    private final RestClient http;

    public Msg91SmsSender(LunchBoxProperties properties, RestClient.Builder builder) {
        this.config = properties.integrations().msg91();
        this.http = HttpClients.build(builder.defaultHeader("authkey", config.authKey()), config.baseUrl());
    }

    @Override
    @Retry(name = "msg91")
    @CircuitBreaker(name = "msg91")
    public boolean send(String phoneE164, String template, Map<String, String> variables) {
        String templateId = config.templateIds() == null ? null : config.templateIds().get(template);
        if (templateId == null || templateId.isBlank()) {
            log.warn("No MSG91 template configured for {}", template);
            return false;
        }
        Map<String, Object> recipient = new HashMap<>(variables);
        recipient.put("mobiles", phoneE164.replace("+", ""));
        Map<String, Object> body = Map.of("template_id", templateId, "short_url", "0", "recipients", List.of(recipient));
        http.post().uri("/flow").contentType(MediaType.APPLICATION_JSON).body(body).retrieve().toBodilessEntity();
        return true;
    }
}
