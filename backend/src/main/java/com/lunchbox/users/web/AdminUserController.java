package com.lunchbox.users.web;

import com.lunchbox.common.security.Role;
import com.lunchbox.common.security.Roles;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.users.StaffService;
import com.lunchbox.users.UserDirectory;
import com.lunchbox.users.web.UserDtos.AdminParentResponse;
import com.lunchbox.users.web.UserDtos.ChangeStatusRequest;
import com.lunchbox.users.web.UserDtos.CreateStaffRequest;
import com.lunchbox.users.web.UserDtos.StaffResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@Tag(name = "Admin · Users")
@RestController
@RequestMapping("/api/v1/admin")
public class AdminUserController {

    private final StaffService staff;
    private final UserDirectory users;

    public AdminUserController(StaffService staff, UserDirectory users) {
        this.staff = staff;
        this.users = users;
    }

    @GetMapping("/parents")
    @PreAuthorize(Roles.ADMIN_READ)
    public PageResponse<AdminParentResponse> parents(@RequestParam(required = false) String q,
                                                     @RequestParam(required = false) Integer page,
                                                     @RequestParam(required = false) Integer size) {
        return staff.searchParents(q, page, size);
    }

    @GetMapping("/staff")
    @PreAuthorize(Roles.SUPER_ADMIN)
    public PageResponse<StaffResponse> staff(@RequestParam(required = false) String q,
                                             @RequestParam(required = false) Integer page,
                                             @RequestParam(required = false) Integer size) {
        return staff.searchStaff(q, page, size);
    }

    @PostMapping("/staff")
    @PreAuthorize(Roles.SUPER_ADMIN)
    @ResponseStatus(HttpStatus.CREATED)
    public StaffResponse createStaff(@Valid @RequestBody CreateStaffRequest request) {
        return staff.createStaff(request);
    }

    public record ChangeRoleRequest(@NotNull Role role, UUID schoolId) {
    }

    @PutMapping("/staff/{userId}/role")
    @PreAuthorize(Roles.SUPER_ADMIN)
    public StaffResponse changeRole(@PathVariable UUID userId, @Valid @RequestBody ChangeRoleRequest request) {
        return staff.changeRole(userId, request.role(), request.schoolId());
    }

    @PostMapping("/users/{userId}/status")
    @PreAuthorize(Roles.ADMIN_WRITE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changeStatus(@PathVariable UUID userId, @Valid @RequestBody ChangeStatusRequest request) {
        switch (request.action()) {
            case SUSPEND -> users.suspendUser(userId);
            case REACTIVATE -> users.reactivateUser(userId);
        }
    }
}
