package com.lunchbox.dispatch;

import com.lunchbox.common.crypto.EncryptedStringConverter;
import com.lunchbox.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.UUID;

@Getter
@Entity
@Table(name = "kyc_documents")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class KycDocument extends BaseEntity {

    public enum DocType { AADHAAR, PAN, DRIVING_LICENSE, VEHICLE_RC, PHOTO, POLICE_VERIFICATION }

    public enum Status { UPLOADED, VERIFYING, VERIFIED, FAILED }

    @Column(name = "partner_id", nullable = false, updatable = false)
    private UUID partnerId;

    @Enumerated(EnumType.STRING)
    @Column(name = "doc_type", nullable = false, updatable = false)
    private DocType docType;

    @Column(name = "s3_key", nullable = false)
    private String s3Key;

    @Convert(converter = EncryptedStringConverter.class)
    @Column(name = "document_number", columnDefinition = "text")
    private String documentNumber;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.UPLOADED;

    @Column(name = "provider_task_id")
    private String providerTaskId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "provider_result")
    private String providerResult;

    KycDocument(UUID partnerId, DocType docType, String s3Key, String documentNumber) {
        this.partnerId = partnerId;
        this.docType = docType;
        this.s3Key = s3Key;
        this.documentNumber = documentNumber;
    }

    void verifying(String taskId) {
        this.status = Status.VERIFYING;
        this.providerTaskId = taskId;
    }

    void result(boolean verified, String resultJson) {
        this.status = verified ? Status.VERIFIED : Status.FAILED;
        this.providerResult = resultJson;
    }

    void manuallyVerified(boolean verified) {
        this.status = verified ? Status.VERIFIED : Status.FAILED;
    }
}
