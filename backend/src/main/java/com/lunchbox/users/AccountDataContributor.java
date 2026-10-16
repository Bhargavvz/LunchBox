package com.lunchbox.users;

import com.lunchbox.common.privacy.PersonalDataContributor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Component
class AccountDataContributor implements PersonalDataContributor {

    private final UserRepository users;
    private final ParentRepository parents;
    private final ConsentService consents;

    AccountDataContributor(UserRepository users, ParentRepository parents, ConsentService consents) {
        this.users = users;
        this.parents = parents;
        this.consents = consents;
    }

    @Override
    public String section() {
        return "account";
    }

    @Override
    public int order() {
        return 1000;
    }

    @Override
    @Transactional(readOnly = true)
    public Object export(UUID userId) {
        Map<String, Object> data = new LinkedHashMap<>();
        users.findById(userId).ifPresent(u -> data.put("profile", UserService.summary(u)));
        parents.findByUserId(userId).ifPresent(p -> {
            Map<String, Object> parent = new LinkedHashMap<>();
            parent.put("firstName", p.getFirstName());
            parent.put("lastName", p.getLastName());
            data.put("parent", parent);
        });
        data.put("consents", consents.list(userId));
        return data;
    }

    /** Runs last so other modules can still resolve the parent while erasing. Consent records are kept as proof. */
    @Override
    @Transactional
    public void erase(UUID userId) {
        parents.findByUserId(userId).ifPresent(Parent::anonymise);
    }
}
