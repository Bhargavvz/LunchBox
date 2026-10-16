package com.lunchbox.dispatch;

import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.persistence.UuidV7;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.storage.StorageService;
import com.lunchbox.common.storage.StorageService.Bucket;
import com.lunchbox.dispatch.kyc.KycProvider;
import com.lunchbox.dispatch.web.DispatchDtos.KycDecisionRequest;
import com.lunchbox.dispatch.web.DispatchDtos.KycDocumentRequest;
import com.lunchbox.dispatch.web.DispatchDtos.KycDocumentResponse;
import com.lunchbox.dispatch.web.DispatchDtos.UploadUrlRequest;
import com.lunchbox.dispatch.web.DispatchDtos.UploadUrlResponse;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Partner KYC: operations staff collect documents (uploaded straight to the private, KMS-encrypted KYC bucket),
 * IDfy verifies what it can against government sources, and a human makes the final approve/reject decision.
 */
@Slf4j
@Service
public class KycService {

    private static final Set<KycDocument.DocType> REQUIRED = EnumSet.of(KycDocument.DocType.AADHAAR,
            KycDocument.DocType.DRIVING_LICENSE, KycDocument.DocType.PHOTO);
    private static final long MAX_DOC_BYTES = 10L * 1024 * 1024;

    private final DeliveryPartnerRepository partners;
    private final KycDocumentRepository documents;
    private final KycProvider provider;
    private final StorageService storage;
    private final AuditService audit;
    private final Clock clock;

    public KycService(DeliveryPartnerRepository partners, KycDocumentRepository documents, KycProvider provider,
                      StorageService storage, AuditService audit, Clock clock) {
        this.partners = partners;
        this.documents = documents;
        this.provider = provider;
        this.storage = storage;
        this.audit = audit;
        this.clock = clock;
    }

    public UploadUrlResponse uploadUrl(UUID partnerId, UploadUrlRequest request) {
        partners.findById(partnerId).orElseThrow(() -> Errors.notFound("Partner"));
        String ext = switch (request.contentType()) {
            case "image/png" -> "png";
            case "application/pdf" -> "pdf";
            default -> "jpg";
        };
        String key = "kyc/" + partnerId + "/" + request.docType().name().toLowerCase() + "-" + UuidV7.generate() + "." + ext;
        var upload = storage.presignUpload(Bucket.KYC, key, request.contentType(), MAX_DOC_BYTES);
        return new UploadUrlResponse(upload.url(), upload.key(), upload.method(), upload.headers(), upload.expiresAt());
    }

    @Transactional
    public KycDocumentResponse addDocument(UUID partnerId, KycDocumentRequest request) {
        DeliveryPartner partner = partners.findById(partnerId).orElseThrow(() -> Errors.notFound("Partner"));
        if (!request.s3Key().startsWith("kyc/" + partnerId + "/")) {
            throw Errors.badRequest("invalid_key", "Upload the document using the provided upload link.");
        }
        storage.head(Bucket.KYC, request.s3Key())
                .orElseThrow(() -> Errors.unprocessable("upload_missing", "The document upload has not completed."));
        KycDocument doc = documents.save(new KycDocument(partnerId, request.docType(), request.s3Key(),
                request.documentNumber() == null ? null : request.documentNumber().replace(" ", "").toUpperCase()));
        if (provider.supports(request.docType()) && doc.getDocumentNumber() != null) {
            String requestId = provider.submit(request.docType(), doc.getDocumentNumber(), request.dateOfBirth(),
                    doc.getId().toString());
            doc.verifying(requestId);
        }
        partner.kycSubmitted();
        audit.record("kyc.document_added", "Partner", partnerId, null,
                Map.of("docType", request.docType().name(), "documentId", doc.getId()));
        return toResponse(doc);
    }

    @Transactional(readOnly = true)
    public List<KycDocumentResponse> documents(UUID partnerId) {
        return documents.findByPartnerIdOrderByCreatedAt(partnerId).stream().map(this::toResponse).toList();
    }

    @Transactional
    public KycDocumentResponse manualReview(UUID partnerId, UUID documentId, boolean verified) {
        KycDocument doc = documents.findById(documentId).filter(d -> d.getPartnerId().equals(partnerId))
                .orElseThrow(() -> Errors.notFound("Document"));
        doc.manuallyVerified(verified);
        partners.findById(partnerId).ifPresent(DeliveryPartner::kycInReview);
        audit.record("kyc.document_reviewed", "Partner", partnerId, null,
                Map.of("documentId", documentId, "verified", verified));
        return toResponse(doc);
    }

    @Transactional
    public void decide(UUID partnerId, KycDecisionRequest request, CurrentUser reviewer) {
        DeliveryPartner partner = partners.findById(partnerId).orElseThrow(() -> Errors.notFound("Partner"));
        if (request.approved()) {
            List<KycDocument> docs = documents.findByPartnerIdOrderByCreatedAt(partnerId);
            Set<KycDocument.DocType> verified = EnumSet.noneOf(KycDocument.DocType.class);
            docs.stream().filter(d -> d.getStatus() == KycDocument.Status.VERIFIED).forEach(d -> verified.add(d.getDocType()));
            if (!verified.containsAll(REQUIRED)) {
                throw Errors.unprocessable("kyc_incomplete", "Aadhaar, driving licence and photo must be verified before approval.");
            }
            docs.stream().filter(d -> d.getDocType() == KycDocument.DocType.PHOTO && d.getStatus() == KycDocument.Status.VERIFIED)
                    .reduce((a, b) -> b).ifPresent(photo -> partner.setPhoto(photo.getS3Key()));
        }
        String before = partner.getKycStatus().name();
        partner.kycDecision(request.approved(), reviewer.userId(), request.notes(), clock.instant());
        audit.record("kyc.decision", "Partner", partnerId, Map.of("kycStatus", before),
                Map.of("kycStatus", partner.getKycStatus().name(), "notes", request.notes() == null ? "" : request.notes()));
    }

    /** Polls IDfy for documents still being verified. */
    @Scheduled(fixedDelay = 120_000)
    @SchedulerLock(name = "kycPoll", lockAtMostFor = "PT5M")
    @Transactional
    public void pollPending() {
        for (KycDocument doc : documents.findByStatus(KycDocument.Status.VERIFYING)) {
            try {
                provider.fetch(doc.getProviderTaskId()).ifPresent(result -> {
                    doc.result(result.verified(), result.rawJson());
                    partners.findById(doc.getPartnerId()).ifPresent(DeliveryPartner::kycInReview);
                });
            } catch (RuntimeException e) {
                log.warn("KYC poll failed for document {}: {}", doc.getId(), e.getMessage());
            }
        }
    }

    private KycDocumentResponse toResponse(KycDocument d) {
        String number = d.getDocumentNumber();
        String masked = number == null ? null
                : "X".repeat(Math.max(0, number.length() - 4)) + number.substring(Math.max(0, number.length() - 4));
        String url = storage.presignDownload(Bucket.KYC, d.getS3Key(), Duration.ofMinutes(5));
        return new KycDocumentResponse(d.getId(), d.getDocType(), d.getStatus(), masked, url, d.getCreatedAt());
    }
}
