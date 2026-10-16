package com.lunchbox.common.storage;

import com.lunchbox.common.config.LunchBoxProperties;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.model.ServerSideEncryption;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;

import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Component
public class S3StorageService implements StorageService {

    private final LunchBoxProperties.Storage config;
    private final S3Client s3;
    private final S3Presigner presigner;
    private final Clock clock;

    public S3StorageService(LunchBoxProperties properties, Clock clock) {
        this.config = properties.storage();
        this.clock = clock;
        Region region = Region.of(config.region());
        S3Configuration s3Config = S3Configuration.builder().pathStyleAccessEnabled(config.pathStyle()).build();
        var clientBuilder = S3Client.builder().region(region).serviceConfiguration(s3Config)
                .credentialsProvider(DefaultCredentialsProvider.create());
        var presignerBuilder = S3Presigner.builder().region(region).serviceConfiguration(s3Config)
                .credentialsProvider(DefaultCredentialsProvider.create());
        if (config.endpoint() != null && !config.endpoint().isBlank()) {
            clientBuilder.endpointOverride(URI.create(config.endpoint()));
            presignerBuilder.endpointOverride(URI.create(config.endpoint()));
        }
        this.s3 = clientBuilder.build();
        this.presigner = presignerBuilder.build();
    }

    private String bucket(Bucket bucket) {
        return switch (bucket) {
            case HANDOVER -> config.handoverBucket();
            case KYC -> config.kycBucket();
        };
    }

    private boolean useKms() {
        return config.kmsKeyId() != null && !config.kmsKeyId().isBlank();
    }

    @Override
    public PresignedUpload presignUpload(Bucket bucket, String key, String contentType, long maxBytes) {
        PutObjectRequest.Builder put = PutObjectRequest.builder()
                .bucket(bucket(bucket))
                .key(key)
                .contentType(contentType);
        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Type", contentType);
        if (useKms()) {
            put.serverSideEncryption(ServerSideEncryption.AWS_KMS).ssekmsKeyId(config.kmsKeyId());
            headers.put("x-amz-server-side-encryption", "aws:kms");
            headers.put("x-amz-server-side-encryption-aws-kms-key-id", config.kmsKeyId());
        }
        PresignedPutObjectRequest presigned = presigner.presignPutObject(r -> r
                .signatureDuration(config.presignTtl())
                .putObjectRequest(put.build()));
        return new PresignedUpload(presigned.url().toString(), key, "PUT", headers,
                clock.instant().plus(config.presignTtl()));
    }

    @Override
    public String presignDownload(Bucket bucket, String key, Duration ttl) {
        return presigner.presignGetObject(r -> r.signatureDuration(ttl)
                        .getObjectRequest(GetObjectRequest.builder().bucket(bucket(bucket)).key(key).build()))
                .url().toString();
    }

    @Override
    public Optional<ObjectInfo> head(Bucket bucket, String key) {
        try {
            HeadObjectResponse head = s3.headObject(HeadObjectRequest.builder().bucket(bucket(bucket)).key(key).build());
            return Optional.of(new ObjectInfo(head.contentLength(), head.contentType()));
        } catch (NoSuchKeyException e) {
            return Optional.empty();
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                return Optional.empty();
            }
            throw e;
        }
    }

    @Override
    public void delete(Bucket bucket, String key) {
        s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket(bucket)).key(key).build());
    }

    @PreDestroy
    void close() {
        presigner.close();
        s3.close();
    }
}
