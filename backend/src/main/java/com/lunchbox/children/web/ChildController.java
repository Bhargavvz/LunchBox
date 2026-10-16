package com.lunchbox.children.web;

import com.lunchbox.children.ChildService;
import com.lunchbox.children.web.ChildDtos.AdminChildResponse;
import com.lunchbox.children.web.ChildDtos.ChildRequest;
import com.lunchbox.children.web.ChildDtos.ChildResponse;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.Roles;
import com.lunchbox.common.web.PageResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@Tag(name = "Children")
@RestController
public class ChildController {

    private final ChildService children;

    public ChildController(ChildService children) {
        this.children = children;
    }

    @GetMapping("/api/v1/children")
    @PreAuthorize(Roles.PARENT)
    public List<ChildResponse> list(@AuthenticationPrincipal CurrentUser user) {
        return children.list(user.requireUserId());
    }

    @GetMapping("/api/v1/children/{childId}")
    @PreAuthorize(Roles.PARENT)
    public ChildResponse get(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID childId) {
        return children.get(user.requireUserId(), childId);
    }

    @PostMapping("/api/v1/children")
    @PreAuthorize(Roles.PARENT)
    @ResponseStatus(HttpStatus.CREATED)
    public ChildResponse create(@AuthenticationPrincipal CurrentUser user, @Valid @RequestBody ChildRequest request) {
        return children.create(user.requireUserId(), request);
    }

    @PutMapping("/api/v1/children/{childId}")
    @PreAuthorize(Roles.PARENT)
    public ChildResponse update(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID childId,
                                @Valid @RequestBody ChildRequest request) {
        return children.update(user.requireUserId(), childId, request);
    }

    @DeleteMapping("/api/v1/children/{childId}")
    @PreAuthorize(Roles.PARENT)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID childId) {
        children.delete(user.requireUserId(), childId);
    }

    @GetMapping("/api/v1/admin/children")
    @PreAuthorize(Roles.ADMIN_READ)
    public PageResponse<AdminChildResponse> search(@RequestParam(required = false) UUID schoolId,
                                                   @RequestParam(required = false) String q,
                                                   @RequestParam(required = false) Integer page,
                                                   @RequestParam(required = false) Integer size) {
        return children.search(schoolId, q, page, size);
    }
}
