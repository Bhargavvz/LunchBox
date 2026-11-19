package com.lunchbox.common.storage;

import com.google.cloud.storage.Blob;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.HttpMethod;
import com.google.cloud.storage.Storage;
import com.google.firebase.FirebaseApp;
import com.google.firebase.cloud.StorageClient;
import com.lunchbox.common.config.LunchBoxProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

/**
 * Firebase Storage (a Google Cloud Storage bucket) with V4 signed URLs (ADR-0021). Signed URLs are checked by Cloud
 * Storage itself, so the bucket's security rules can stay closed ("production mode"): no app ever reads or writes
 * through the Firebase client SDK. Signing uses the service-account key the backend already has.
 */
@Component
@ConditionalOnProperty(name = "lunchbox.storage.provider", havingValue = "firebase")
public class FirebaseStorageService implements StorageService {

    private final LunchBoxProperties.Storage config;
    private final Storage storage;
    private final Clock clock;

    public FirebaseStorageService(LunchBoxProperties properties, FirebaseApp firebaseApp, Clock clock) {
        this.config = properties.storage();
        this.clock = clock;
        this.storage = StorageClient.getInstance(firebaseApp).bucket(config.handoverBucket()).getStorage();
    }

    private String bucket(Bucket bucket) {
        return switch (bucket) {
            case HANDOVER, PROFILE -> config.handoverBucket();
        };
    }

    @Override
    public PresignedUpload presignUpload(Bucket bucket, String key, String contentType, long maxBytes) {
        BlobInfo blob = BlobInfo.newBuilder(BlobId.of(bucket(bucket), key)).setContentType(contentType).build();
        Duration ttl = config.presignTtl();
        String url = storage.signUrl(blob, ttl.toSeconds(), TimeUnit.SECONDS,
                Storage.SignUrlOption.httpMethod(HttpMethod.PUT),
                Storage.SignUrlOption.withContentType(),
                Storage.SignUrlOption.withV4Signature()).toString();
        return new PresignedUpload(url, key, "PUT", Map.of("Content-Type", contentType), clock.instant().plus(ttl));
    }

    @Override
    public String presignDownload(Bucket bucket, String key, Duration ttl) {
        BlobInfo blob = BlobInfo.newBuilder(BlobId.of(bucket(bucket), key)).build();
        return storage.signUrl(blob, ttl.toSeconds(), TimeUnit.SECONDS,
                Storage.SignUrlOption.httpMethod(HttpMethod.GET),
                Storage.SignUrlOption.withV4Signature()).toString();
    }

    @Override
    public Optional<ObjectInfo> head(Bucket bucket, String key) {
        Blob blob = storage.get(BlobId.of(bucket(bucket), key));
        if (blob == null || !blob.exists()) {
            return Optional.empty();
        }
        return Optional.of(new ObjectInfo(blob.getSize() == null ? 0 : blob.getSize(), blob.getContentType()));
    }

    @Override
    public void delete(Bucket bucket, String key) {
        storage.delete(BlobId.of(bucket(bucket), key));
    }
}
