package com.lunchbox.dispatch.calls;

import com.lunchbox.common.error.Errors;
import com.lunchbox.common.persistence.UuidV7;
import com.lunchbox.common.ratelimit.RateLimitPolicy;
import com.lunchbox.common.ratelimit.RateLimiter;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.dispatch.PartnerDirectory;
import com.lunchbox.orders.OrderQueries;
import com.lunchbox.orders.OrderStatus;
import com.lunchbox.orders.OrderView;
import com.lunchbox.users.UserDirectory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Clock;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

/**
 * Bridges partner and parent phones through Exotel. Calls are only possible on the delivery day, for the partner
 * assigned to the order, while the delivery is live — neither side ever learns the other's number.
 */
@Service
public class MaskedCallService {

    private static final Set<OrderStatus> PARTNER_MAY_CALL = EnumSet.of(OrderStatus.ASSIGNED, OrderStatus.PARTNER_EN_ROUTE);
    private static final Set<OrderStatus> PARENT_MAY_CALL = EnumSet.copyOf(OrderStatus.TRACKABLE);

    private final CallMasking masking;
    private final OrderQueries orders;
    private final PartnerDirectory partners;
    private final UserDirectory users;
    private final RateLimiter rateLimiter;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public MaskedCallService(CallMasking masking, OrderQueries orders, PartnerDirectory partners, UserDirectory users,
                             RateLimiter rateLimiter, JdbcTemplate jdbc, Clock clock) {
        this.masking = masking;
        this.orders = orders;
        this.partners = partners;
        this.users = users;
        this.rateLimiter = rateLimiter;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public void partnerCallsParent(UUID partnerUserId, UUID orderId) {
        PartnerDirectory.PartnerInfo partner = partners.requireWorkingPartner(partnerUserId);
        OrderView order = orders.require(orderId);
        requireToday(order);
        if (!partner.id().equals(order.partnerId()) || !PARTNER_MAY_CALL.contains(order.status())) {
            throw Errors.notFound("Order");
        }
        rateLimiter.consume(RateLimitPolicy.MASKED_CALL, partnerUserId.toString());
        String partnerPhone = users.requireUser(partnerUserId).phone();
        String parentPhone = users.requireParent(order.parentId()).phone();
        place(order, partner.id(), "PARTNER_TO_PARENT", partnerPhone, parentPhone);
    }

    public void parentCallsPartner(UUID parentUserId, UUID orderId) {
        UUID parentId = users.requireParentId(parentUserId);
        OrderView order = orders.requireOwnedByParent(orderId, parentId);
        requireToday(order);
        if (order.partnerId() == null || !PARENT_MAY_CALL.contains(order.status())) {
            throw Errors.unprocessable("call_unavailable", "You can call the partner while your delivery is in progress.");
        }
        rateLimiter.consume(RateLimitPolicy.MASKED_CALL, parentUserId.toString());
        PartnerDirectory.PartnerInfo partner = partners.require(order.partnerId());
        String partnerPhone = users.requireUser(partner.userId()).phone();
        String parentPhone = users.requireUser(parentUserId).phone();
        place(order, partner.id(), "PARENT_TO_PARTNER", parentPhone, partnerPhone);
    }

    private void place(OrderView order, UUID partnerId, String direction, String from, String to) {
        if (from == null || to == null) {
            throw Errors.unprocessable("call_unavailable", "Calling is not available for this delivery.");
        }
        String callId = masking.connect(from, to, order.id().toString());
        Timestamp now = Timestamp.from(clock.instant());
        jdbc.update("""
                INSERT INTO masked_calls (id, order_id, partner_id, direction, provider_call_id, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'INITIATED', ?, ?)
                """, UuidV7.generate(), order.id(), partnerId, direction, callId, now, now);
    }

    private void requireToday(OrderView order) {
        if (!order.scheduledDate().equals(TimeZones.todayIst(clock))) {
            throw Errors.unprocessable("call_unavailable", "Calls are only available on the delivery day.");
        }
    }
}
