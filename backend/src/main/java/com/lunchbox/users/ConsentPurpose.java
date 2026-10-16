package com.lunchbox.users;

public enum ConsentPurpose {
    /** Required to hold an account and deliver the service. */
    ACCOUNT_AND_SERVICE,
    /** Verifiable parental consent to process a child's data (DPDP Act 2023, s.9). Required before adding children. */
    CHILD_DATA_PROCESSING,
    /** Showing the delivery partner's live location to the parent during an active delivery. */
    LIVE_TRACKING,
    /** Optional promotional messages. */
    MARKETING
}
