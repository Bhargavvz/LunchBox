package com.lunchbox.admin.demo;

import com.lunchbox.common.security.Roles;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Admin")
@RestController
@RequestMapping("/api/v1/admin/demo-data")
public class DemoDataController {

    private final DemoDataService demo;

    public DemoDataController(DemoDataService demo) {
        this.demo = demo;
    }

    @GetMapping
    @PreAuthorize(Roles.ADMIN_READ)
    public DemoDataService.DemoDataStatus status() {
        return demo.status();
    }

    @PostMapping
    @PreAuthorize(Roles.SUPER_ADMIN)
    @Operation(summary = "Load tagged demo data (inactive schools, riders who cannot take work, 30 days of history)")
    public DemoDataService.DemoDataStatus seed() {
        return demo.seed();
    }

    @DeleteMapping
    @PreAuthorize(Roles.SUPER_ADMIN)
    @Operation(summary = "Remove every demo record, and nothing else")
    public DemoDataService.DemoDataStatus remove() {
        return demo.remove();
    }
}
