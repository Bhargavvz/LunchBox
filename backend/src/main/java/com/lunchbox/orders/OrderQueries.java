package com.lunchbox.orders;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/** Public read API of the orders module. */
public interface OrderQueries {

    Optional<OrderView> find(UUID orderId);

    OrderView require(UUID orderId);

    Map<UUID, OrderView> findAll(Collection<UUID> orderIds);

    List<OrderView> forDate(LocalDate date, Set<OrderStatus> statuses);

    List<OrderView> forSchoolAndDate(UUID schoolId, LocalDate date);

    List<OrderView> forPartnerAndDate(UUID partnerId, LocalDate date);

    /** The order if it belongs to this parent; 404 otherwise. */
    OrderView requireOwnedByParent(UUID orderId, UUID parentId);
}
