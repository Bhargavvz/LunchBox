package com.lunchbox.common.privacy;

import java.util.UUID;

/**
 * Implemented by every module that stores personal data about a user. Drives the DPDP data-export and
 * account-erasure flows without the users module reaching into other modules' tables.
 */
public interface PersonalDataContributor {

    /** Section name in the export document, e.g. "children". */
    String section();

    /** Everything this module holds about the user, as DTOs safe to hand to the data principal. */
    Object export(UUID userId);

    /**
     * Erases or anonymises this module's personal data for the user. Data that must be retained by law
     * (payments/invoices) is retained but unlinked from direct identifiers.
     */
    void erase(UUID userId);

    /** Lower runs first. */
    default int order() {
        return 100;
    }
}
