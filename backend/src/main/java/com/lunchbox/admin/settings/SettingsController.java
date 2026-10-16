package com.lunchbox.admin.settings;

import com.lunchbox.admin.settings.AppSettingsService.SettingResponse;
import com.lunchbox.admin.settings.AppSettingsService.UpdateSettingRequest;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.Roles;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "Admin · Settings")
@RestController
@RequestMapping("/api/v1/admin/settings")
public class SettingsController {

    private final AppSettingsService settings;

    public SettingsController(AppSettingsService settings) {
        this.settings = settings;
    }

    @GetMapping
    @PreAuthorize(Roles.ADMIN_READ)
    public List<SettingResponse> list() {
        return settings.list();
    }

    @PutMapping("/{key}")
    @PreAuthorize(Roles.SUPER_ADMIN)
    public SettingResponse update(@PathVariable String key, @RequestBody UpdateSettingRequest request,
                                  @AuthenticationPrincipal CurrentUser user) {
        return settings.update(key, request, user);
    }
}
