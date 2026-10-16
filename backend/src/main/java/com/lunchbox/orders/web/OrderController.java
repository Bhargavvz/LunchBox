package com.lunchbox.orders.web;

import com.lunchbox.common.idempotency.IdempotencyService;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.Roles;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.common.web.Csv;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.orders.OrderAdminService;
import com.lunchbox.orders.OrderGenerationService;
import com.lunchbox.orders.OrderQueryService;
import com.lunchbox.orders.OrderStatus;
import com.lunchbox.orders.web.OrderDtos.AdminOrderDetailResponse;
import com.lunchbox.orders.web.OrderDtos.AdminOrderResponse;
import com.lunchbox.orders.web.OrderDtos.CreateManualOrderRequest;
import com.lunchbox.orders.web.OrderDtos.OrderDetailResponse;
import com.lunchbox.orders.web.OrderDtos.OrderResponse;
import com.lunchbox.orders.web.OrderDtos.ReasonRequest;
import com.lunchbox.orders.web.OrderDtos.SchoolOrderResponse;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Tag(name = "Orders")
@RestController
public class OrderController {

    private final OrderQueryService queries;
    private final OrderAdminService admin;
    private final OrderGenerationService generation;
    private final IdempotencyService idempotency;
    private final Clock clock;

    public OrderController(OrderQueryService queries, OrderAdminService admin, OrderGenerationService generation,
                           IdempotencyService idempotency, Clock clock) {
        this.queries = queries;
        this.admin = admin;
        this.generation = generation;
        this.idempotency = idempotency;
        this.clock = clock;
    }

    // ---- Parent ----

    @GetMapping("/api/v1/orders/today")
    @PreAuthorize(Roles.PARENT)
    public List<OrderResponse> today(@AuthenticationPrincipal CurrentUser user) {
        return queries.today(user.requireUserId());
    }

    @GetMapping("/api/v1/orders")
    @PreAuthorize(Roles.PARENT)
    public PageResponse<OrderResponse> history(@AuthenticationPrincipal CurrentUser user,
                                               @RequestParam(required = false) UUID childId,
                                               @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                               @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                               @RequestParam(required = false) Integer page,
                                               @RequestParam(required = false) Integer size) {
        return queries.history(user.requireUserId(), childId, from, to, page, size);
    }

    @GetMapping("/api/v1/orders/{orderId}")
    @PreAuthorize(Roles.PARENT)
    public OrderDetailResponse detail(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID orderId) {
        return queries.detailForParent(user.requireUserId(), orderId);
    }

    // ---- Admin ----

    @GetMapping("/api/v1/admin/orders")
    @PreAuthorize(Roles.ADMIN_READ)
    public PageResponse<AdminOrderResponse> search(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                                                   @RequestParam(required = false) OrderStatus status,
                                                   @RequestParam(required = false) UUID schoolId,
                                                   @RequestParam(required = false) UUID partnerId,
                                                   @RequestParam(required = false) UUID parentId,
                                                   @RequestParam(required = false) Integer page,
                                                   @RequestParam(required = false) Integer size) {
        return queries.search(date, status, schoolId, partnerId, parentId, page, size);
    }

    @GetMapping(value = "/api/v1/admin/orders/export.csv", produces = "text/csv")
    @PreAuthorize(Roles.ADMIN_READ)
    public void export(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                       @RequestParam(required = false) OrderStatus status,
                       @RequestParam(required = false) UUID schoolId,
                       @RequestParam(required = false) UUID partnerId,
                       HttpServletResponse response) throws IOException {
        Csv.write(response, "orders-" + date + ".csv",
                List.of("id", "date", "status", "child", "class", "school", "partnerId", "pickupStart", "pickupEnd",
                        "deadline", "pickedUpAt", "deliveredAt", "failureReason", "cancelReason"),
                queries.exportRows(date, status, schoolId, partnerId),
                o -> List.of(o.id(), o.scheduledDate(), o.status(), nz(o.childName()), nz(o.className()),
                        nz(o.schoolName()), o.partnerId() == null ? "" : o.partnerId(), o.pickupWindowStart(),
                        o.pickupWindowEnd(), o.deliveryDeadline(), o.pickedUpAt() == null ? "" : o.pickedUpAt(),
                        o.deliveredAt() == null ? "" : o.deliveredAt(), nz(o.failureReason()), nz(o.cancelReason())));
    }

    @GetMapping("/api/v1/admin/orders/{orderId}")
    @PreAuthorize(Roles.ADMIN_READ)
    public AdminOrderDetailResponse adminDetail(@PathVariable UUID orderId) {
        return queries.adminDetail(orderId);
    }

    @PostMapping("/api/v1/admin/orders")
    @PreAuthorize(Roles.ADMIN_WRITE)
    @ResponseStatus(HttpStatus.CREATED)
    public AdminOrderDetailResponse createManual(@AuthenticationPrincipal CurrentUser user,
                                                 @Parameter(description = "Client-generated key; retries replay the first result")
                                                 @RequestHeader(value = IdempotencyService.HEADER, required = false) String idempotencyKey,
                                                 @Valid @RequestBody CreateManualOrderRequest request) {
        return idempotency.execute(idempotencyKey, user.requireUserId(), "admin.order.create", request,
                AdminOrderDetailResponse.class, () -> admin.createManual(request));
    }

    @PostMapping("/api/v1/admin/orders/{orderId}/cancel")
    @PreAuthorize(Roles.ADMIN_WRITE)
    public AdminOrderDetailResponse cancel(@PathVariable UUID orderId, @Valid @RequestBody ReasonRequest request) {
        return admin.cancel(orderId, request.reason());
    }

    @PostMapping("/api/v1/admin/jobs/generate-orders")
    @PreAuthorize(Roles.ADMIN_WRITE)
    public OrderGenerationService.GenerationResult generate(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return generation.generate(date == null ? TimeZones.todayIst(clock).plusDays(1) : date);
    }

    // ---- School admin ----

    @GetMapping("/api/v1/school-admin/orders")
    @PreAuthorize(Roles.SCHOOL_ADMIN)
    public List<SchoolOrderResponse> schoolOrders(@AuthenticationPrincipal CurrentUser user,
                                                  @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return queries.forSchoolAdmin(user.schoolId(), date == null ? TimeZones.todayIst(clock) : date);
    }

    @PostMapping("/api/v1/school-admin/orders/{orderId}/confirm-receipt")
    @PreAuthorize(Roles.SCHOOL_ADMIN)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void confirmReceipt(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID orderId) {
        admin.confirmSchoolReceipt(orderId, user);
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
