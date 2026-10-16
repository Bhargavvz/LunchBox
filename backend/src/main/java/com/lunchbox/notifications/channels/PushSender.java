package com.lunchbox.notifications.channels;

import java.util.List;
import java.util.Map;
import java.util.Set;

/** Mobile push (Firebase Cloud Messaging in production). */
public interface PushSender {

    Result send(List<String> tokens, String title, String body, Map<String, String> data, boolean highPriority);

    /** @param invalidTokens tokens FCM reported as unregistered; they are deleted */
    record Result(int successCount, Set<String> invalidTokens) {
    }
}
