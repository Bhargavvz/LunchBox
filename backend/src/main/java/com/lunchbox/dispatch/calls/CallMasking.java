package com.lunchbox.dispatch.calls;

/**
 * Number masking (Exotel in production): the provider rings {@code from} first, then bridges to {@code to}; each side
 * only ever sees the virtual ExoPhone number.
 */
public interface CallMasking {

    /** @return provider call id */
    String connect(String fromPhone, String toPhone, String reference);
}
