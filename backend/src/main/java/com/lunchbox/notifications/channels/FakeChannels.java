package com.lunchbox.notifications.channels;

import com.lunchbox.common.web.Validation;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;
import java.util.Map;
import java.util.Set;

/** Sandbox push/SMS that only log (masked) — local development and tests. */
@Slf4j
@Configuration
public class FakeChannels {

    @Bean
    @ConditionalOnProperty(name = "lunchbox.integrations.fcm.mode", havingValue = "fake", matchIfMissing = true)
    public PushSender fakePushSender() {
        return (List<String> tokens, String title, String body, Map<String, String> data, boolean highPriority) -> {
            log.info("[fake fcm] {} device(s): {} — {}", tokens.size(), title, body);
            return new PushSender.Result(tokens.size(), Set.of());
        };
    }

    @Bean
    @ConditionalOnProperty(name = "lunchbox.integrations.msg91.mode", havingValue = "fake", matchIfMissing = true)
    public SmsSender fakeSmsSender() {
        return (phone, template, variables) -> {
            log.info("[fake msg91] {} -> {} {}", template, Validation.maskPhone(phone), variables.keySet());
            return true;
        };
    }
}
