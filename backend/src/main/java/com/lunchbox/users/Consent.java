package com.lunchbox.users;

import com.lunchbox.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Getter
@Entity
@Table(name = "consents")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Consent extends BaseEntity {

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private ConsentPurpose purpose;

    @Column(name = "policy_version", nullable = false, updatable = false)
    private String policyVersion;

    @Column(nullable = false)
    private boolean granted;

    @Column(name = "granted_at")
    private Instant grantedAt;

    @Column(name = "withdrawn_at")
    private Instant withdrawnAt;

    private String ip;

    @Column(name = "user_agent")
    private String userAgent;

    public Consent(UUID userId, ConsentPurpose purpose, String policyVersion, boolean granted, Instant at,
                   String ip, String userAgent) {
        this.userId = userId;
        this.purpose = purpose;
        this.policyVersion = policyVersion;
        this.granted = granted;
        this.grantedAt = granted ? at : null;
        this.withdrawnAt = granted ? null : at;
        this.ip = ip;
        this.userAgent = userAgent;
    }

    public void withdraw(Instant at) {
        this.granted = false;
        this.withdrawnAt = at;
    }

    public boolean isActive() {
        return granted && withdrawnAt == null;
    }
}
