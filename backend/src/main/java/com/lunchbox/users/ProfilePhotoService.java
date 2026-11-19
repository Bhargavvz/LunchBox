package com.lunchbox.users;

import com.lunchbox.common.error.Errors;
import com.lunchbox.common.persistence.UuidV7;
import com.lunchbox.common.storage.StorageService;
import com.lunchbox.common.storage.StorageService.Bucket;
import com.lunchbox.common.storage.StorageService.PresignedUpload;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Set;
import java.util.UUID;

/**
 * Profile photos in private storage. The app compresses the image, uploads it straight to storage with a short-lived
 * signed PUT, then confirms the key; the API only ever hands out signed GET links, so photos are never public.
 */
@Slf4j
@Service
public class ProfilePhotoService {

    static final long MAX_BYTES = 2L * 1024 * 1024;
    private static final Set<String> TYPES = Set.of("image/jpeg");
    private static final Duration VIEW_TTL = Duration.ofHours(1);

    private final StorageService storage;

    public ProfilePhotoService(StorageService storage) {
        this.storage = storage;
    }

    static String prefix(UUID userId) {
        return "profiles/" + userId + "/";
    }

    PresignedUpload uploadUrl(UUID userId) {
        return storage.presignUpload(Bucket.PROFILE, prefix(userId) + UuidV7.generate() + ".jpg", "image/jpeg", MAX_BYTES);
    }

    /** Checks that the key is this user's, that the upload happened, and that it is a small JPEG. */
    void verify(UUID userId, String key) {
        if (!key.startsWith(prefix(userId)) || key.contains("..")) {
            throw Errors.badRequest("invalid_photo", "That photo upload does not belong to your account.");
        }
        StorageService.ObjectInfo info = storage.head(Bucket.PROFILE, key)
                .orElseThrow(() -> Errors.badRequest("photo_missing", "The photo did not finish uploading. Please try again."));
        if (info.sizeBytes() > MAX_BYTES || info.contentType() == null || !TYPES.contains(info.contentType())) {
            storage.delete(Bucket.PROFILE, key);
            throw Errors.badRequest("photo_invalid", "Please choose a JPEG photo smaller than 2 MB.");
        }
    }

    String viewUrl(String key) {
        return key == null ? null : storage.presignDownload(Bucket.PROFILE, key, VIEW_TTL);
    }

    void deleteQuietly(String key) {
        if (key == null) {
            return;
        }
        try {
            storage.delete(Bucket.PROFILE, key);
        } catch (RuntimeException e) {
            // The account change has already committed; an orphaned object is harmless and private.
            log.warn("Could not delete old profile photo {}: {}", key, e.toString());
        }
    }
}
