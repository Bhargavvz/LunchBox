package com.lunchbox.notifications.channels;

import java.util.Map;

/** Transactional SMS (MSG91 Flow API with DLT-registered templates in production). */
public interface SmsSender {

    /** @param template logical template key, mapped to a DLT template id in configuration */
    boolean send(String phoneE164, String template, Map<String, String> variables);
}
