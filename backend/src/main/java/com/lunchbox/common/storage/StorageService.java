package com.lunchbox.common.storage;

import java.time.Duration;
import java.util.Optional;

/** Private object storage with short-lived pre-signed URLs (S3 in AWS, LocalStack locally). */
public interface StorageService {

    enum Bucket { HANDOVER, KYC }

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
