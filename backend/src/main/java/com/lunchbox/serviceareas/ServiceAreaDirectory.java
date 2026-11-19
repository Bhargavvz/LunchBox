package com.lunchbox.serviceareas;

import org.locationtech.jts.geom.Geometry;

import java.util.Optional;
import java.util.UUID;

/** Public API of the service-areas module. */
public interface ServiceAreaDirectory {

    boolean isServiceable(double lat, double lng);

    /** The boundary of an active service area, for limiting riders to a zone. */
    Optional<Geometry> activeBoundary(UUID areaId);
}
