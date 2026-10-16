package com.lunchbox.dispatch.calls;

import com.lunchbox.common.web.Validation;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Slf4j
@Component
@ConditionalOnProperty(name = "lunchbox.integrations.exotel.mode", havingValue = "fake", matchIfMissing = true)
public class FakeCallMasking implements CallMasking {

    @Override
    public String connect(String fromPhone, String toPhone, String reference) {
        String id = "call_fake_" + UUID.randomUUID();
        log.info("[fake exotel] bridging {} -> {} ({}) as {}", Validation.maskPhone(fromPhone), Validation.maskPhone(toPhone),
                reference, id);
        return id;
    }
}
