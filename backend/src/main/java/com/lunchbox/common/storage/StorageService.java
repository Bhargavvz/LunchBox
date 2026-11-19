package com.lunchbox.common.storage;

import java.time.Duration;
import java.util.Optional;

/** Private object storage with short-lived pre-signed URLs (Firebase Storage in production, LocalStack S3 locally). */
public interface StorageService {

    /**
     * HANDOVER: rider photos at school (90-day lifecycle on the handover/ prefix). PROFILE: parents' profile photos
     * (profiles/ prefix, kept until replaced or the account is deleted). Both live in the configured bucket.
     */
    enum Bucket { HANDOVER, PROFILE }

    PresignedUpload presignUpload(Bucket bucket, String key, String contentType, long maxBytes);

    String presignDownload(Bucket bucket, String key, Duration ttl);

    Optional<ObjectInfo> head(Bucket bucket, String key);

    void delete(Bucket bucket, String key);

    record PresignedUpload(String url, String key, String method, java.util.Map<String, String> headers,
                           java.time.Instant expiresAt) {
    }

    record ObjectInfo(long sizeBytes, String contentType) {
    }
}
