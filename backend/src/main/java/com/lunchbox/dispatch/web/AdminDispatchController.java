package com.lunchbox.dispatch.web;

import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.Roles;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.dispatch.AssignmentService;
import com.lunchbox.dispatch.DeliveryPartner;
import com.lunchbox.dispatch.DispatchAdminService;
import com.lunchbox.dispatch.KycService;
import com.lunchbox.dispatch.PartnerService;
import com.lunchbox.dispatch.ShiftService;
import com.lunchbox.dispatch.web.DispatchDtos.AdminPartnerResponse;
import com.lunchbox.dispatch.web.DispatchDtos.AdminRouteResponse;
import com.lunchbox.dispatch.web.DispatchDtos.AssignRequest;
import com.lunchbox.dispatch.web.DispatchDtos.AutoAssignResult;
import com.lunchbox.dispatch.web.DispatchDtos.BankAccountRequest;
import com.lunchbox.dispatch.web.DispatchDtos.CreatePartnerRequest;
import com.lunchbox.dispatch.web.DispatchDtos.IssueResponse;
import com.lunchbox.dispatch.web.DispatchDtos.KycDecisionRequest;
import com.lunchbox.dispatch.web.DispatchDtos.KycDocumentRequest;
import com.lunchbox.dispatch.web.DispatchDtos.KycDocumentResponse;
import com.lunchbox.dispatch.web.DispatchDtos.PartnerProfileRequest;
import com.lunchbox.dispatch.web.DispatchDtos.ResolveIssueRequest;
import com.lunchbox.dispatch.web.DispatchDtos.ShiftRequest;
import com.lunchbox.dispatch.web.DispatchDtos.ShiftResponse;
import com.lunchbox.dispatch.web.DispatchDtos.UploadUrlRequest;
import com.lunchbox.dispatch.web.DispatchDtos.UploadUrlResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Tag(name = "Admin · Dispatch")
@RestController
@RequestMapping("/api/v1/admin")
public class AdminDispatchController {

    private final PartnerService partners;
    private final KycService kyc;
    private final ShiftService shifts;
    private final AssignmentService assignment;
    private final DispatchAdminService dispatch;
    private final Clock clock;

    public AdminDispatchController(PartnerService partners, KycService kyc, ShiftService shifts,
                                   AssignmentService assignment, DispatchAdminService dispatch, Clock clock) {
        this.partners = partners;
        this.kyc = kyc;
        this.shifts = shifts;
        this.assignment = assignment;
        this.dispatch = dispatch;
        this.clock = clock;
    }

    // ---- Partners ----

    @GetMapping("/partners")
    @PreAuthorize(Roles.ADMIN_READ)
    public PageResponse<AdminPartnerResponse> partners(@RequestParam(required = false) String q,
                                                       @RequestParam(required = false) DeliveryPartner.KycStatus kycStatus,
                                                       @RequestParam(required = false) Integer page,
                                                       @RequestParam(required = false) Integer size) {
        return partners.search(q, kycStatus, page, size);
    }

    @GetMapping("/partners/{partnerId}")
    @PreAuthorize(Roles.ADMIN_READ)
    public AdminPartnerResponse partner(@PathVariable UUID partnerId) {
        return partners.get(partnerId);
    }

    @PostMapping("/partners")
    @PreAuthorize(Roles.ADMIN_WRITE)
    @ResponseStatus(HttpStatus.CREATED)
    public AdminPartnerResponse createPartner(@Valid @RequestBody CreatePartnerRequest request) {
        return partners.create(request);
    }

    @PutMapping("/partners/{partnerId}")
    @PreAuthorize(Roles.ADMIN_WRITE)
    public AdminPartnerResponse updatePartner(@PathVariable UUID partnerId, @Valid @RequestBody PartnerProfileRequest request) {
        return partners.update(partnerId, request);
    }

    @PostMapping("/partners/{partnerId}/activate")
    @PreAuthorize(Roles.ADMIN_WRITE)
    public AdminPartnerResponse activate(@PathVariable UUID partnerId) {
        return partners.setActive(partnerId, true);
    }

    @PostMapping("/partners/{partnerId}/deactivate")
    @PreAuthorize(Roles.ADMIN_WRITE)
    public AdminPartnerResponse deactivate(@PathVariable UUID partnerId) {
        return partners.setActive(partnerId, false);
    }

    @PutMapping("/partners/{partnerId}/bank-account")
    @PreAuthorize(Roles.SUPER_ADMIN)
    public AdminPartnerResponse bankAccount(@PathVariable UUID partnerId, @Valid @RequestBody BankAccountRequest request) {
        return partners.linkBankAccount(partnerId, request);
    }

    // ---- KYC ----

    @PostMapping("/partners/{partnerId}/kyc/upload-url")
    @PreAuthorize(Roles.ADMIN_WRITE)
    public UploadUrlResponse kycUploadUrl(@PathVariable UUID partnerId, @Valid @RequestBody UploadUrlRequest request) {
        return kyc.uploadUrl(partnerId, request);
    }

    @PostMapping("/partners/{partnerId}/kyc/documents")
    @PreAuthorize(Roles.ADMIN_WRITE)
    @ResponseStatus(HttpStatus.CREATED)
    public KycDocumentResponse addKycDocument(@PathVariable UUID partnerId, @Valid @RequestBody KycDocumentRequest request) {
        return kyc.addDocument(partnerId, request);
    }

    @GetMapping("/partners/{partnerId}/kyc/documents")
    @PreAuthorize(Roles.ADMIN_WRITE)
    public List<KycDocumentResponse> kycDocuments(@PathVariable UUID partnerId) {
        return kyc.documents(partnerId);
    }

    @PostMapping("/partners/{partnerId}/kyc/documents/{documentId}/review")
    @PreAuthorize(Roles.ADMIN_WRITE)
    public KycDocumentResponse reviewDocument(@PathVariable UUID partnerId, @PathVariable UUID documentId,
                                              @RequestParam boolean verified) {
        return kyc.manualReview(partnerId, documentId, verified);
    }

    @PostMapping("/partners/{partnerId}/kyc/decision")
    @PreAuthorize(Roles.ADMIN_WRITE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void kycDecision(@PathVariable UUID partnerId, @Valid @RequestBody KycDecisionRequest request,
                            @AuthenticationPrincipal CurrentUser user) {
        kyc.decide(partnerId, request, user);
    }

    // ---- Shifts ----

    @GetMapping("/partners/{partnerId}/shifts")
    @PreAuthorize(Roles.ADMIN_READ)
    public List<ShiftResponse> shifts(@PathVariable UUID partnerId,
                                      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return shifts.list(partnerId, from, to);
    }

    @PostMapping("/partners/{partnerId}/shifts")
    @PreAuthorize(Roles.ADMIN_WRITE)
    public ShiftResponse scheduleShift(@PathVariable UUID partnerId, @Valid @RequestBody ShiftRequest request) {
        return shifts.schedule(partnerId, request);
    }

    @DeleteMapping("/partners/{partnerId}/shifts/{date}")
    @PreAuthorize(Roles.ADMIN_WRITE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancelShift(@PathVariable UUID partnerId,
                            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        shifts.cancel(partnerId, date);
    }

    // ---- Assignment & routes ----

    @PostMapping("/orders/{orderId}/assign")
    @PreAuthorize(Roles.ADMIN_WRITE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void assign(@PathVariable UUID orderId, @Valid @RequestBody AssignRequest request) {
        assignment.manualAssign(orderId, request.partnerId(), request.reason());
    }

    @PostMapping("/jobs/auto-assign")
    @PreAuthorize(Roles.ADMIN_WRITE)
    public AutoAssignResult autoAssign(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return assignment.autoAssign(date == null ? TimeZones.todayIst(clock).plusDays(1) : date);
    }

    @GetMapping("/routes")
    @PreAuthorize(Roles.ADMIN_READ)
    public List<AdminRouteResponse> routes(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return dispatch.routes(date == null ? TimeZones.todayIst(clock) : date);
    }

    // ---- Issues / SOS ----

    @GetMapping("/issues")
    @PreAuthorize(Roles.ADMIN_READ)
    public PageResponse<IssueResponse> issues(@RequestParam(defaultValue = "true") boolean openOnly,
                                              @RequestParam(required = false) Integer page,
                                              @RequestParam(required = false) Integer size) {
        return dispatch.issues(openOnly, page, size);
    }

    @PostMapping("/issues/{issueId}/acknowledge")
    @PreAuthorize(Roles.ADMIN_WRITE)
    public IssueResponse acknowledge(@PathVariable UUID issueId, @AuthenticationPrincipal CurrentUser user) {
        return dispatch.acknowledge(issueId, user);
    }

    @PostMapping("/issues/{issueId}/resolve")
    @PreAuthorize(Roles.ADMIN_WRITE)
    public IssueResponse resolve(@PathVariable UUID issueId, @Valid @RequestBody ResolveIssueRequest request,
                                 @AuthenticationPrincipal CurrentUser user) {
        return dispatch.resolve(issueId, request.note(), user);
    }
}
