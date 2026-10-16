package com.lunchbox.addresses;

import com.lunchbox.addresses.AddressService.AddressRequest;
import com.lunchbox.addresses.AddressService.AddressResponse;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.Roles;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@Tag(name = "Addresses")
@RestController
@RequestMapping("/api/v1/addresses")
@PreAuthorize(Roles.PARENT)
public class AddressController {

    private final AddressService addresses;

    public AddressController(AddressService addresses) {
        this.addresses = addresses;
    }

    @GetMapping
    public List<AddressResponse> list(@AuthenticationPrincipal CurrentUser user) {
        return addresses.list(user.requireUserId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AddressResponse create(@AuthenticationPrincipal CurrentUser user, @Valid @RequestBody AddressRequest request) {
        return addresses.create(user.requireUserId(), request);
    }

    @PutMapping("/{addressId}")
    public AddressResponse update(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID addressId,
                                  @Valid @RequestBody AddressRequest request) {
        return addresses.update(user.requireUserId(), addressId, request);
    }

    @DeleteMapping("/{addressId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID addressId) {
        addresses.delete(user.requireUserId(), addressId);
    }
}
