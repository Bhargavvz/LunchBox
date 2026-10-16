package com.lunchbox.tracking;

import com.lunchbox.common.config.LunchBoxProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompReactorNettyCodec;
import org.springframework.messaging.tcp.reactor.ReactorNettyTcpClient;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;

import java.util.List;

/**
 * STOMP over WebSocket at {@code /ws}, relayed to RabbitMQ (Amazon MQ in AWS) so any backend instance can publish to
 * any subscriber. Destinations use dots ({@code /topic/orders.<id>}) because RabbitMQ maps them to routing keys.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final LunchBoxProperties properties;
    private final StompAuthInterceptor authInterceptor;

    public WebSocketConfig(LunchBoxProperties properties, StompAuthInterceptor authInterceptor) {
        this.properties = properties;
        this.authInterceptor = authInterceptor;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        List<String> origins = properties.stomp().allowedOrigins();
        registry.addEndpoint("/ws").setAllowedOriginPatterns(origins == null ? new String[]{"*"} : origins.toArray(String[]::new));
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        LunchBoxProperties.Stomp stomp = properties.stomp();
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
        registry.setPathMatcher(new AntPathMatcher("."));
        var relay = registry.enableStompBrokerRelay("/topic", "/queue")
                .setClientLogin(stomp.clientLogin())
                .setClientPasscode(stomp.clientPasscode())
                .setSystemLogin(stomp.systemLogin())
                .setSystemPasscode(stomp.systemPasscode())
                .setSystemHeartbeatSendInterval(10_000)
                .setSystemHeartbeatReceiveInterval(10_000);
        if (stomp.relaySsl()) {
            relay.setTcpClient(new ReactorNettyTcpClient<>(
                    client -> client.host(stomp.relayHost()).port(stomp.relayPort()).secure(),
                    new StompReactorNettyCodec()));
        } else {
            relay.setRelayHost(stomp.relayHost()).setRelayPort(stomp.relayPort());
        }
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(authInterceptor);
        registration.taskExecutor().corePoolSize(8).maxPoolSize(64);
    }

    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
        registration.setMessageSizeLimit(64 * 1024)
                .setSendBufferSizeLimit(512 * 1024)
                .setSendTimeLimit(10_000);
    }
}
