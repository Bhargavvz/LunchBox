package com.lunchbox.common.messaging;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Declarable;
import org.springframework.amqp.core.Declarables;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.ArrayList;
import java.util.List;

import static com.lunchbox.common.messaging.Messaging.*;

/**
 * Topology: one durable topic exchange fed only by the transactional outbox; one quorum queue per consumer, each with
 * a dead-letter queue. Failed deliveries are retried in-listener with backoff, then dead-lettered for inspection.
 */
@Configuration
public class RabbitConfig {

    @Bean
    public MessageConverter jsonMessageConverter(ObjectMapper objectMapper) {
        Jackson2JsonMessageConverter converter = new Jackson2JsonMessageConverter(objectMapper);
        converter.setAlwaysConvertToInferredType(true);
        return converter;
    }

    @Bean
    public Declarables topology() {
        TopicExchange events = new TopicExchange(EVENTS_EXCHANGE, true, false);
        DirectExchange dlx = new DirectExchange(DEAD_LETTER_EXCHANGE, true, false);
        List<Declarable> d = new ArrayList<>(List.of(events, dlx));

        queue(d, events, dlx, Q_NOTIFICATIONS_ORDER_EVENTS, "order.#");
        queue(d, events, dlx, Q_NOTIFICATIONS_OPS_EVENTS, PARTNER_ISSUE_REPORTED);
        Queue earnings = queue(d, events, dlx, Q_EARNINGS_EVENTS, ORDER_STATUS_CHANGED);
        d.add(BindingBuilder.bind(earnings).to(events).with(ROUTE_COMPLETED));
        d.add(BindingBuilder.bind(earnings).to(events).with(SHIFT_ENDED));
        d.add(BindingBuilder.bind(earnings).to(events).with(SHIFT_NO_SHOW));
        queue(d, events, dlx, Q_TRACKING_ORDER_EVENTS, ORDER_STATUS_CHANGED);
        queue(d, events, dlx, Q_DISPATCH_RATINGS, RATING_SUBMITTED);
        queue(d, events, dlx, JOB_BROADCAST, BROADCAST_REQUESTED);
        queue(d, events, dlx, JOB_PAYOUT, PAYOUT_REQUESTED);
        return new Declarables(d);
    }

    private static Queue queue(List<Declarable> d, TopicExchange events, DirectExchange dlx, String name,
                               String routingKey) {
        Queue q = QueueBuilder.durable(name)
                .deadLetterExchange(DEAD_LETTER_EXCHANGE)
                .deadLetterRoutingKey(name + ".dlq")
                .quorum()
                .build();
        Queue dlq = QueueBuilder.durable(name + ".dlq").quorum().build();
        Binding binding = BindingBuilder.bind(q).to(events).with(routingKey);
        d.add(q);
        d.add(dlq);
        d.add(binding);
        d.add(BindingBuilder.bind(dlq).to(dlx).with(name + ".dlq"));
        return q;
    }
}
