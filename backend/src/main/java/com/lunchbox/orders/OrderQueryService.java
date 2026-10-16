package com.lunchbox.orders;

import com.lunchbox.children.ChildDirectory;
import com.lunchbox.children.ChildDirectory.ChildInfo;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.privacy.PersonalDataContributor;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.common.web.Pagination;
import com.lunchbox.orders.web.OrderDtos.AdminOrderDetailResponse;
import com.lunchbox.orders.web.OrderDtos.AdminOrderResponse;
import com.lunchbox.orders.web.OrderDtos.OrderDetailResponse;
import com.lunchbox.orders.web.OrderDtos.OrderResponse;
import com.lunchbox.orders.web.OrderDtos.SchoolOrderResponse;
import com.lunchbox.orders.web.OrderDtos.StatusEventResponse;
import com.lunchbox.schools.SchoolDirectory;
import com.lunchbox.schools.SchoolDirectory.SchoolInfo;
import com.lunchbox.users.UserDirectory;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class OrderQueryService implements OrderQueries, PersonalDataContributor {

    private final OrderRepository orders;
    private final OrderStatusHistoryRepository history;
    private final ChildDirectory children;
    private final SchoolDirectory schools;
    private final UserDirectory users;
    private final Clock clock;

    public OrderQueryService(OrderRepository orders, OrderStatusHistoryRepository history, ChildDirectory children,
                             SchoolDirectory schools, UserDirectory users, Clock clock) {
        this.orders = orders;
        this.history = history;
        this.children = children;
        this.schools = schools;
        this.users = users;
        this.clock = clock;
    }

    // ---- OrderQueries ----

    @Override
    @Transactional(readOnly = true)
    public Optional<OrderView> find(UUID orderId) {
        return orders.findById(orderId).map(OrderView::of);
    }

    @Override
    @Transactional(readOnly = true)
    public OrderView require(UUID orderId) {
        return find(orderId).orElseThrow(() -> Errors.notFound("Order"));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, OrderView> findAll(Collection<UUID> orderIds) {
        if (orderIds.isEmpty()) {
            return Map.of();
        }
        return orders.findByIdIn(orderIds).stream().map(OrderView::of)
                .collect(Collectors.toMap(OrderView::id, Function.identity()));
    }

    @Override
    @Transactional(readOnly = true)
    public List<OrderView> forDate(LocalDate date, Set<OrderStatus> statuses) {
        return orders.findByScheduledDateAndStatusIn(date, statuses).stream().map(OrderView::of).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<OrderView> forSchoolAndDate(UUID schoolId, LocalDate date) {
        return orders.findBySchoolIdAndScheduledDate(schoolId, date).stream().map(OrderView::of).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<OrderView> forPartnerAndDate(UUID partnerId, LocalDate date) {
        return orders.findByPartnerIdAndScheduledDate(partnerId, date).stream().map(OrderView::of).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public OrderView requireOwnedByParent(UUID orderId, UUID parentId) {
        return orders.findById(orderId).filter(o -> o.getParentId().equals(parentId)).map(OrderView::of)
                .orElseThrow(() -> Errors.notFound("Order"));
    }

    // ---- Parent views ----

    @Transactional(readOnly = true)
    public List<OrderResponse> today(UUID parentUserId) {
        UUID parentId = users.requireParentId(parentUserId);
        List<Order> list = orders.findByParentIdAndScheduledDateOrderByPickupWindowStart(parentId, TimeZones.todayIst(clock));
        return toParentResponses(list);
    }

    @Transactional(readOnly = true)
    public PageResponse<OrderResponse> history(UUID parentUserId, UUID childId, LocalDate from, LocalDate to,
                                               Integer page, Integer size) {
        UUID parentId = users.requireParentId(parentUserId);
        LocalDate today = TimeZones.todayIst(clock);
        LocalDate f = from == null ? today.minusDays(90) : from;
        LocalDate t = to == null ? today.plusDays(7) : to;
        Page<Order> result = orders.findForParent(parentId, childId, f, t,
                Pagination.of(page, size, Sort.by(Sort.Direction.DESC, "scheduledDate")));
        List<OrderResponse> items = toParentResponses(result.getContent());
        return PageResponse.of(items, result.getNumber(), result.getSize(), result.getTotalElements());
    }

    @Transactional(readOnly = true)
    public OrderDetailResponse detailForParent(UUID parentUserId, UUID orderId) {
        UUID parentId = users.requireParentId(parentUserId);
        Order order = orders.findById(orderId).filter(o -> o.getParentId().equals(parentId))
                .orElseThrow(() -> Errors.notFound("Order"));
        return new OrderDetailResponse(toParentResponses(List.of(order)).getFirst(), timeline(orderId));
    }

    // ---- Admin views ----

    @Transactional(readOnly = true)
    public PageResponse<AdminOrderResponse> search(LocalDate date, OrderStatus status, UUID schoolId, UUID partnerId,
                                                   UUID parentId, Integer page, Integer size) {
        Page<Order> result = orders.findAll(spec(date, status, schoolId, partnerId, parentId),
                Pagination.of(page, size, Sort.by("pickupWindowStart")));
        List<AdminOrderResponse> items = toAdminResponses(result.getContent());
        return PageResponse.of(items, result.getNumber(), result.getSize(), result.getTotalElements());
    }

    @Transactional(readOnly = true)
    public List<AdminOrderResponse> exportRows(LocalDate date, OrderStatus status, UUID schoolId, UUID partnerId) {
        List<Order> rows = orders.findAll(spec(date, status, schoolId, partnerId, null), Sort.by("pickupWindowStart"));
        if (rows.size() > 50_000) {
            throw Errors.unprocessable("export_too_large", "Narrow the filters; exports are limited to 50,000 rows.");
        }
        return toAdminResponses(rows);
    }

    @Transactional(readOnly = true)
    public AdminOrderDetailResponse adminDetail(UUID orderId) {
        Order order = orders.findById(orderId).orElseThrow(() -> Errors.notFound("Order"));
        return new AdminOrderDetailResponse(toAdminResponses(List.of(order)).getFirst(), timeline(orderId));
    }

    @Transactional(readOnly = true)
    public List<SchoolOrderResponse> forSchoolAdmin(UUID schoolId, LocalDate date) {
        List<Order> list = orders.findBySchoolIdAndScheduledDate(schoolId, date);
        Map<UUID, ChildInfo> childMap = children.findAll(list.stream().map(Order::getChildId).collect(Collectors.toSet()));
        return list.stream()
                .filter(o -> o.getStatus() != OrderStatus.CANCELLED)
                .map(o -> {
                    ChildInfo c = childMap.get(o.getChildId());
                    return new SchoolOrderResponse(o.getId(), c == null ? null : c.displayName(),
                            c == null ? null : c.className(), c == null ? null : c.section(), o.getStatus(),
                            o.getDeliveredAt(), o.getSchoolReceivedAt());
                }).toList();
    }

    // ---- PersonalDataContributor ----

    @Override
    public String section() {
        return "orders";
    }

    @Override
    public int order() {
        return 10;
    }

    @Override
    @Transactional(readOnly = true)
    public Object export(UUID userId) {
        UUID parentId = users.requireParentId(userId);
        return toParentResponses(orders.findByParentId(parentId));
    }

    /** Vetoes erasure while a lunchbox is physically with a partner. Order rows are retained (no direct PII). */
    @Override
    @Transactional
    public void erase(UUID userId) {
        UUID parentId = users.requireParentId(userId);
        if (orders.existsByParentIdAndStatusIn(parentId, EnumSet.copyOf(OrderStatus.IN_CUSTODY))) {
            throw Errors.conflict("delivery_in_progress",
                    "A delivery is in progress. You can delete your account once it has been completed.");
        }
    }

    // ---- helpers ----

    private Specification<Order> spec(LocalDate date, OrderStatus status, UUID schoolId, UUID partnerId, UUID parentId) {
        return (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            if (date != null) {
                p.add(cb.equal(root.get("scheduledDate"), date));
            }
            if (status != null) {
                p.add(cb.equal(root.get("status"), status));
            }
            if (schoolId != null) {
                p.add(cb.equal(root.get("schoolId"), schoolId));
            }
            if (partnerId != null) {
                p.add(cb.equal(root.get("partnerId"), partnerId));
            }
            if (parentId != null) {
                p.add(cb.equal(root.get("parentId"), parentId));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
    }

    private List<StatusEventResponse> timeline(UUID orderId) {
        return history.findByOrderIdOrderByOccurredAt(orderId).stream()
                .map(h -> new StatusEventResponse(h.getToStatus(), h.getOccurredAt(), h.getReason()))
                .toList();
    }

    private List<OrderResponse> toParentResponses(List<Order> list) {
        Map<UUID, ChildInfo> childMap = children.findAll(list.stream().map(Order::getChildId).collect(Collectors.toSet()));
        Map<UUID, SchoolInfo> schoolMap = schools.findAll(list.stream().map(Order::getSchoolId).collect(Collectors.toSet()));
        return list.stream().map(o -> {
            ChildInfo c = childMap.get(o.getChildId());
            SchoolInfo s = schoolMap.get(o.getSchoolId());
            return new OrderResponse(o.getId(), o.getChildId(), c == null ? null : c.displayName(), o.getSchoolId(),
                    s == null ? null : s.name(), o.getScheduledDate(), o.getPickupWindowStart(), o.getPickupWindowEnd(),
                    o.getDeliveryDeadline(), o.getStatus(), o.getPartnerId() != null, o.getPickedUpAt(),
                    o.getDeliveredAt(), o.getCancelReason(), o.getFailureReason(), o.getSchoolReceivedAt());
        }).toList();
    }

    private List<AdminOrderResponse> toAdminResponses(List<Order> list) {
        Map<UUID, ChildInfo> childMap = children.findAll(list.stream().map(Order::getChildId).collect(Collectors.toSet()));
        Map<UUID, SchoolInfo> schoolMap = schools.findAll(list.stream().map(Order::getSchoolId).collect(Collectors.toSet()));
        return list.stream().map(o -> {
            ChildInfo c = childMap.get(o.getChildId());
            SchoolInfo s = schoolMap.get(o.getSchoolId());
            return new AdminOrderResponse(o.getId(), o.getScheduledDate(), o.getStatus(), o.getChildId(),
                    c == null ? null : c.displayName(), c == null ? null : c.className(), o.getParentId(),
                    o.getSchoolId(), s == null ? null : s.name(), o.getPartnerId(), o.getAddressId(),
                    Geo.toGeoPoint(o.getPickupLocation()), o.getPickupWindowStart(), o.getPickupWindowEnd(),
                    o.getDeliveryDeadline(), o.getPickedUpAt(), o.getDeliveredAt(), o.getCancelReason(),
                    o.getFailureReason(), o.getVersion());
        }).toList();
    }
}
