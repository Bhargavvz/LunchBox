package com.lunchbox.common.geo;

import com.lunchbox.common.error.Errors;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.PrecisionModel;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** WGS84 helpers. JTS coordinates are (x = longitude, y = latitude). */
public final class Geo {

    public static final int SRID = 4326;
    public static final GeometryFactory FACTORY = new GeometryFactory(new PrecisionModel(), SRID);
    private static final double EARTH_RADIUS_M = 6_371_008.8;

    private Geo() {
    }

    public static Point point(double lat, double lng) {
        return FACTORY.createPoint(new Coordinate(lng, lat));
    }

    public static Point point(GeoPoint p) {
        return point(p.lat(), p.lng());
    }

    public static GeoPoint toGeoPoint(Point p) {
        return p == null ? null : new GeoPoint(p.getY(), p.getX());
    }

    public static Polygon polygon(List<GeoPoint> vertices) {
        if (vertices == null || vertices.size() < 3) {
            throw Errors.badRequest("invalid_polygon", "A polygon needs at least 3 points.");
        }
        List<Coordinate> coords = new ArrayList<>(vertices.stream().map(v -> new Coordinate(v.lng(), v.lat())).toList());
        if (!coords.getFirst().equals2D(coords.getLast())) {
            coords.add(new Coordinate(coords.getFirst()));
        }
        Polygon polygon = FACTORY.createPolygon(coords.toArray(Coordinate[]::new));
        if (!polygon.isValid()) {
            throw Errors.badRequest("invalid_polygon", "The polygon edges must not cross each other.");
        }
        return polygon;
    }

    public static List<GeoPoint> vertices(Polygon polygon) {
        if (polygon == null) {
            return List.of();
        }
        Coordinate[] coords = polygon.getExteriorRing().getCoordinates();
        return Arrays.stream(coords, 0, coords.length - 1).map(c -> new GeoPoint(c.y, c.x)).toList();
    }

    public static double haversineMeters(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1.0, Math.sqrt(a)));
    }

    public static double haversineMeters(Point a, Point b) {
        return haversineMeters(a.getY(), a.getX(), b.getY(), b.getX());
    }

    public static double haversineMeters(GeoPoint a, GeoPoint b) {
        return haversineMeters(a.lat(), a.lng(), b.lat(), b.lng());
    }

    /** Whether the point lies inside the polygon, or within {@code radiusM} of {@code center} when there is no polygon. */
    public static boolean insideGeofence(Polygon fence, Point center, int radiusM, double lat, double lng) {
        if (fence != null) {
            return fence.contains(point(lat, lng));
        }
        return haversineMeters(center.getY(), center.getX(), lat, lng) <= radiusM;
    }
}
