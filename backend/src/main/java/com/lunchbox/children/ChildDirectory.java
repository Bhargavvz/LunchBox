package com.lunchbox.children;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/** Public API of the children module. */
public interface ChildDirectory {

    ChildInfo require(UUID childId);

    /** The child, or 404 when it does not belong to this parent (never reveals that the child exists). */
    ChildInfo requireOwned(UUID childId, UUID parentId);

    Map<UUID, ChildInfo> findAll(Collection<UUID> childIds);

    /** Parent ids of every (non-removed) child at the school — broadcast audience. */
    java.util.Set<UUID> parentIdsAtSchool(UUID schoolId);

    record ChildInfo(UUID id, UUID parentId, UUID schoolId, String firstName, String lastName, String className,
                     String section, boolean deleted) {

        public String displayName() {
            return lastName == null ? firstName : firstName + " " + lastName;
        }
    }

    /** In-process event raised when a parent removes a child, so live subscriptions are cancelled. */
    record ChildRemoved(UUID childId, UUID parentId) {
    }
}
