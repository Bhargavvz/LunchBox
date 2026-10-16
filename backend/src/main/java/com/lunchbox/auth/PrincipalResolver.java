package com.lunchbox.auth;

import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.users.UserDirectory;
import com.lunchbox.users.UserDirectory.AuthPrincipal;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Maps a verified token to a LunchBox principal. Positive lookups are cached for a short TTL so a request does not
 * hit Postgres every time; suspension therefore takes effect within {@link #TTL} (and refresh tokens are revoked).
 */
@Component
public class PrincipalResolver {

    static final Duration TTL = Duration.ofSeconds(30);
    private static final int MAX_ENTRIES = 50_000;

    private final UserDirectory users;
    private final Clock clock;
    private final ConcurrentHashMap<String, Cached> cache = new ConcurrentHashMap<>();

    public PrincipalResolver(UserDirectory users, Clock clock) {
        this.users = users;
        this.clock = clock;
    }

    public Resolved resolve(VerifiedToken token) {
        Instant now = clock.instant();
        Cached cached = cache.get(token.uid());
        AuthPrincipal principal;
        if (cached != null && cached.expiresAt().isAfter(now)) {
            principal = cached.principal();
        } else {
            Optional<AuthPrincipal> found = users.findPrincipal(token.uid());
            principal = found.orElse(null);
            if (principal != null) {
                if (cache.size() > MAX_ENTRIES) {
                    cache.entrySet().removeIf(e -> e.getValue().expiresAt().isBefore(now));
                }
                cache.put(token.uid(), new Cached(principal, now.plus(TTL)));
            }
        }
        if (principal == null) {
            return new Resolved(new CurrentUser(null, token.uid(), null, null, token.phone(), token.email()), null);
        }
        return new Resolved(new CurrentUser(principal.userId(), token.uid(), principal.role(), principal.schoolId(),
                principal.phone(), principal.email()), principal);
    }

    public void evict(String firebaseUid) {
        cache.remove(firebaseUid);
    }

    public record Resolved(CurrentUser user, AuthPrincipal principal) {
    }

    private record Cached(AuthPrincipal principal, Instant expiresAt) {
    }
}
