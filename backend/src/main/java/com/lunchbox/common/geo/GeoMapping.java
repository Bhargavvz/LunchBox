package com.lunchbox.common.geo;

import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.Polygon;
import org.springframework.stereotype.Component;

import java.util.List;

/** MapStruct helper: converts JTS geometries to API shapes. */
@Component
public class GeoMapping {

    public GeoPoint toGeoPoint(Point point) {
        return Geo.toGeoPoint(point);
    }

    public List<GeoPoint> toVertices(Polygon polygon) {
        return polygon == null ? null : Geo.vertices(polygon);
    }
}
