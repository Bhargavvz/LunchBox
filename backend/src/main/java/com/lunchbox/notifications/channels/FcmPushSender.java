package com.lunchbox.notifications.channels;

import com.google.firebase.messaging.AndroidConfig;
import com.google.firebase.messaging.ApnsConfig;
import com.google.firebase.messaging.Aps;
import com.google.firebase.messaging.BatchResponse;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.MessagingErrorCode;
import com.google.firebase.messaging.MulticastMessage;
import com.google.firebase.messaging.SendResponse;
import com.lunchbox.common.integration.RetryableIntegrationException;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Component
@ConditionalOnProperty(name = "lunchbox.integrations.fcm.mode", havingValue = "live")
public class FcmPushSender implements PushSender {

    private final FirebaseMessaging messaging;

    public FcmPushSender(FirebaseMessaging messaging) {
        this.messaging = messaging;
    }

    @Override
    @Retry(name = "fcm")
    @CircuitBreaker(name = "fcm")
    public Result send(List<String> tokens, String title, String body, Map<String, String> data, boolean highPriority) {
        if (tokens.isEmpty()) {
            return new Result(0, Set.of());
        }
        MulticastMessage message = MulticastMessage.builder()
                .addAllTokens(tokens)
                .setNotification(com.google.firebase.messaging.Notification.builder().setTitle(title).setBody(body).build())
                .putAllData(data)
                .setAndroidConfig(AndroidConfig.builder()
                        .setPriority(highPriority ? AndroidConfig.Priority.HIGH : AndroidConfig.Priority.NORMAL)
                        .build())
                .setApnsConfig(ApnsConfig.builder().setAps(Aps.builder().setSound("default").build()).build())
                .build();
        try {
            BatchResponse response = messaging.sendEachForMulticast(message);
            Set<String> invalid = new HashSet<>();
            List<SendResponse> results = response.getResponses();
            for (int i = 0; i < results.size(); i++) {
                SendResponse r = results.get(i);
                if (!r.isSuccessful() && r.getException() != null) {
                    MessagingErrorCode code = r.getException().getMessagingErrorCode();
                    if (code == MessagingErrorCode.UNREGISTERED || code == MessagingErrorCode.INVALID_ARGUMENT) {
                        invalid.add(tokens.get(i));
                    }
                }
            }
            return new Result(response.getSuccessCount(), invalid);
        } catch (FirebaseMessagingException e) {
            throw new RetryableIntegrationException("FCM send failed: " + e.getMessagingErrorCode(), e);
        }
    }
}
