package com.lunchbox.payments;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.common.config.LunchBoxProperties;
import com.lunchbox.common.crypto.Hmac;
import com.lunchbox.common.error.ApiException;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.mockito.Answers;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.RestClient;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RazorpayWebhookServiceTest {

    private static final String BODY =
            "{\"event\":\"subscription.charged\",\"payload\":{\"subscription\":{\"entity\":{\"id\":\"sub_1\"}}}}";

    private final PaymentGateway gateway = mock(PaymentGateway.class);
    private final WebhookInbox inbox = mock(WebhookInbox.class);
    private final RazorpayWebhookHandler handler = mock(RazorpayWebhookHandler.class);
    private final PaymentRecorder recorder = mock(PaymentRecorder.class);
    private final RazorpayWebhookService service = new RazorpayWebhookService(gateway, inbox, List.of(handler), recorder,
            new ObjectMapper(), new SimpleMeterRegistry());

    @Test
    void rejectsMissingOrInvalidSignaturesBeforeParsing() {
        when(gateway.verifyWebhookSignature(BODY, "bad")).thenReturn(false);

        assertThatThrownBy(() -> service.receive(BODY, "bad", "evt_1"))
                .isInstanceOf(ApiException.class).extracting("status").isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThatThrownBy(() -> service.receive(BODY, null, "evt_1")).isInstanceOf(ApiException.class);
        verify(inbox, never()).accept(anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void dispatchesAVerifiedEventToSupportingHandlersOnce() {
        when(gateway.verifyWebhookSignature(BODY, "sig")).thenReturn(true);
        when(inbox.accept("razorpay", "evt_1", "subscription.charged", BODY)).thenReturn(true);
        when(handler.supports("subscription.charged")).thenReturn(true);

        service.receive(BODY, "sig", "evt_1");

        verify(handler).handle(eq("subscription.charged"), any(JsonNode.class));
        verify(inbox).markProcessed("razorpay", "evt_1");
    }

    @Test
    void acknowledgesDuplicatesWithoutReprocessing() {
        when(gateway.verifyWebhookSignature(BODY, "sig")).thenReturn(true);
        when(inbox.accept(anyString(), anyString(), anyString(), anyString())).thenReturn(false);

        service.receive(BODY, "sig", "evt_1");

        verify(handler, never()).handle(anyString(), any());
        verify(inbox, never()).markProcessed(anyString(), anyString());
    }

    @Test
    void fallsBackToABodyDigestWhenTheEventIdHeaderIsMissing() {
        when(gateway.verifyWebhookSignature(BODY, "sig")).thenReturn(true);

        service.receive(BODY, "sig", " ");

        verify(inbox).accept("razorpay", Hmac.sha256Digest(BODY), "subscription.charged", BODY);
    }

    @Test
    void rejectsMalformedJsonEvenWhenSigned() {
        when(gateway.verifyWebhookSignature("not json", "sig")).thenReturn(true);

        assertThatThrownBy(() -> service.receive("not json", "sig", "evt_1"))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("invalid_payload");
    }

    @Test
    void recordsFailedPayments() {
        String body = "{\"event\":\"payment.failed\",\"payload\":{\"payment\":{\"entity\":"
                + "{\"id\":\"pay_9\",\"error_description\":\"Card declined\"}}}}";
        when(gateway.verifyWebhookSignature(body, "sig")).thenReturn(true);
        when(inbox.accept(anyString(), anyString(), anyString(), anyString())).thenReturn(true);

        service.receive(body, "sig", "evt_2");

        verify(recorder).recordFailed("pay_9", "Card declined");
    }

    @Test
    void razorpayGatewayVerifiesTheHexHmacOfTheRawBody() {
        LunchBoxProperties properties = mock(LunchBoxProperties.class, Answers.RETURNS_DEEP_STUBS);
        when(properties.integrations().razorpay()).thenReturn(new LunchBoxProperties.Razorpay(
                LunchBoxProperties.Mode.LIVE, "https://api.razorpay.com/v1", "key", "secret", "whsec"));
        RazorpayGateway real = new RazorpayGateway(properties, RestClient.builder());

        String signature = Hmac.sha256Hex("whsec", BODY);

        assertThat(real.verifyWebhookSignature(BODY, signature)).isTrue();
        assertThat(real.verifyWebhookSignature(BODY + " ", signature)).isFalse();
        assertThat(real.verifyWebhookSignature(BODY, "0".repeat(64))).isFalse();
    }
}
