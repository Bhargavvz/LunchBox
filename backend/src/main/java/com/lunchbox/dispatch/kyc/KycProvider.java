package com.lunchbox.dispatch.kyc;

import com.lunchbox.dispatch.KycDocument.DocType;

import java.time.LocalDate;
import java.util.Optional;

/** Government-source document verification (IDfy in production). */
public interface KycProvider {

    /** Whether the provider can verify this document type automatically (others need manual review). */
    boolean supports(DocType type);

    /** Starts an async verification and returns the provider's request id. */
    String submit(DocType type, String documentNumber, LocalDate dateOfBirth, String referenceId);

    /** Polls a submitted request; empty while still in progress. */
    Optional<Result> fetch(String requestId);

    record Result(boolean verified, String rawJson) {
    }
}
