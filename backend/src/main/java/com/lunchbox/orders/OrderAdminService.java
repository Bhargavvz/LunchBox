package com.lunchbox.orders;

import com.lunchbox.addresses.AddressDirectory;
import com.lunchbox.addresses.AddressDirectory.AddressInfo;
import com.lunchbox.audit.AuditService;
import com.lunchbox.children.ChildDirectory;
import com.lunchbox.children.ChildDirectory.ChildInfo;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.orders.web.OrderDtos.AdminOrderDetailResponse;
import com.lunchbox.orders.web.OrderDtos.CreateManualOrderRequest;
import com.lunchbox.schools.SchoolDirectory;
import com.lunchbox.schools.SchoolDirectory.SchoolInfo;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Map;
import java.util.UUID;

@Service
public class OrderAdminService {

    private final OrderRepository orders;
    private final OrderStatusHistoryRepository history;
    private final OrderTransitionService transitions;
    private final OrderQueryService queries;
    private final ChildDirectory children;
    private final AddressDirectory addresses;
    private final SchoolDirectory schools;
    private final PickupWindows windows;
    private final AuditService audit;
    private final Clock clock;

    public OrderAdminService(OrderRepository orders, OrderStatusHistoryRepository history,
                             OrderTransitionService transitions, OrderQueryService queries, ChildDirectory children,
                             AddressDirectory addresses, SchoolDirectory schools, PickupWindows windows,
                             AuditService audit, Clock clock) {
        this.orders = orders;
        this.history = history;
        this.transitions = transitions;
        this.queries = queries;
        this.children = children;
        this.addresses = addresses;
        this.schools = schools;
        this.windows = windows;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional
    public AdminOrderDetailResponse createManual(CreateManualOrderRequest request) {
        if (request.date().isBefore(TimeZones.todayIst(clock))) {
            throw Errors.badRequest("date_in_past", "Orders cannot be created for past dates.");
        }
        ChildInfo child = children.require(request.childId());
        if (child.deleted()) {
            throw Errors.unprocessable("child_removed", "This child has been removed.");
        }
        AddressInfo address = addresses.requireOwned(request.addressId(), child.parentId());
        if (!schools.isSchoolDay(child.schoolId(), request.date())) {
            throw Errors.unprocessable("not_school_day", "The school is closed on this date.");
        }
        if (orders.findByChildIdAndScheduledDate(child.id(), request.date()).isPresent()) {
            throw Errors.conflict("order_exists", "This child already has an order on this date.");
        }
        SchoolInfo school = schools.require(child.schoolId());
        PickupWindows.Window w = windows.forSchool(school, request.date());
        Order order = orders.saveAndFlush(Order.manual(child.id(), child.parentId(), school.id(), address.id(), null,
                request.date(), w.pickupStart(), w.pickupEnd(), w.deliveryDeadline(), address.location()));
        history.save(new OrderStatusHistory(order.getId(), null, OrderStatus.SCHEDULED, null, "ADMIN",
                "Created manually", null, clock.instant()));
        audit.record("order.created_manually", "Order", order.getId(), null,
                Map.of("childId", child.id(), "date", request.date().toString()));
        return queries.adminDetail(order.getId());
    }

    @Transactional
    public AdminOrderDetailResponse cancel(UUID orderId, String reason) {
        OrderView before = queries.require(orderId);
        transitions.transition(orderId, OrderStatus.CANCELLED, reason, Map.of("by", "admin"));
        audit.record("order.cancelled", "Order", orderId, Map.of("status", before.status().name()),
                Map.of("status", OrderStatus.CANCELLED.name(), "reason", reason));
        return queries.adminDetail(orderId);
    }

    @Transactional
    public void confirmSchoolReceipt(UUID orderId, CurrentUser schoolAdmin) {
        Order order = orders.findForUpdate(orderId).orElseThrow(() -> Errors.notFound("Order"));
        if (schoolAdmin.schoolId() == null || !schoolAdmin.schoolId().equals(order.getSchoolId())) {
            throw Errors.notFound("Order");
        }
        if (order.getStatus() != OrderStatus.DELIVERED) {
            throw Errors.unprocessable("not_delivered", "Only delivered lunchboxes can be confirmed.");
        }
        if (order.getSchoolReceivedAt() == null) {
            order.confirmSchoolReceipt(schoolAdmin.userId(), clock.instant());
            audit.record("order.school_receipt_confirmed", "Order", orderId, null, Map.of("schoolId", order.getSchoolId()));
        }
    }
}
