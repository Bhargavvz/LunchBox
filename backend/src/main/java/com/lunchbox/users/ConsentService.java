package com.lunchbox.users;

import com.lunchbox.audit.AuditService;
import com.lunchbox.common.web.ClientInfo;
import com.lunchbox.users.web.UserDtos.ConsentResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ConsentService {

    private final ConsentRepository consents;
    private final AuditService audit;
    private final Clock clock;

    public ConsentService(ConsentRepository consents, AuditService audit, Clock clock) {
        this.consents = consents;
        this.audit = audit;
        this.clock = clock;
    }

    /** Consents are immutable records: every change appends a new row; withdrawal also stamps the prior grant. */
    @Transactional
    public ConsentResponse record(UUID userId, ConsentPurpose purpose, boolean granted, String policyVersion) {
        Instant now = clock.instant();
        consents.findFirstByUserIdAndPurposeOrderByCreatedAtDesc(userId, purpose)
                .filter(Consent::isActive)
                .ifPresent(previous -> {
                    if (!granted) {
                        previous.withdraw(now);
                    }
                });
        Consent saved = consents.save(new Consent(userId, purpose, policyVersion, granted, now,
                ClientInfo.currentIp(), ClientInfo.currentUserAgent()));
        audit.record(granted ? "consent.granted" : "consent.withdrawn", "Consent", saved.getId(), null,
                Map.of("purpose", purpose.name(), "policyVersion", policyVersion));
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<ConsentResponse> list(UUID userId) {
        return consents.findByUserIdOrderByCreatedAtDesc(userId).stream().map(ConsentService::toResponse).toList();
    }

    static ConsentResponse toResponse(Consent c) {
        return new ConsentResponse(c.getId(), c.getPurpose(), c.getPolicyVersion(), c.isGranted(), c.getGrantedAt(),
                c.getWithdrawnAt());
    }
}
