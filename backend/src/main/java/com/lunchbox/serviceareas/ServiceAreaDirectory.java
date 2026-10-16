package com.lunchbox.serviceareas;

/** Public API of the service-areas module. */
public interface ServiceAreaDirectory {

    boolean isServiceable(double lat, double lng);
}
