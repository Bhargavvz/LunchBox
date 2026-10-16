package com.lunchbox.addresses;

import org.locationtech.jts.geom.Point;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/** Public API of the addresses module. */
public interface AddressDirectory {

    AddressInfo require(UUID addressId);

    AddressInfo requireOwned(UUID addressId, UUID parentId);

    Map<UUID, AddressInfo> findAll(Collection<UUID> addressIds);

    record AddressInfo(UUID id, UUID parentId, String label, String line1, String line2, String landmark, String city,
                       String pincode, Point location, String instructions, boolean deleted) {

        public String singleLine() {
            StringBuilder sb = new StringBuilder(line1);
            if (line2 != null) {
                sb.append(", ").append(line2);
            }
            if (landmark != null) {
                sb.append(" (near ").append(landmark).append(')');
            }
            return sb.append(", ").append(city).append(' ').append(pincode).toString();
        }
    }

    /** In-process event raised before an address is removed; listeners may veto by throwing. */
    record AddressRemoving(UUID addressId, UUID parentId) {
    }
}
