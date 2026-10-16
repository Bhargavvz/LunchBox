package com.lunchbox.serviceareas;

import com.lunchbox.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.locationtech.jts.geom.Polygon;

@Getter
@Entity
@Table(name = "service_areas")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ServiceArea extends BaseEntity {

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String city;

    @Column(nullable = false, columnDefinition = "geometry(Polygon,4326)")
    private Polygon boundary;

    @Column(nullable = false)
    private boolean active = true;

    ServiceArea(String name, String city, Polygon boundary, boolean active) {
        update(name, city, boundary, active);
    }

    void update(String name, String city, Polygon boundary, boolean active) {
        this.name = name;
        this.city = city;
        this.boundary = boundary;
        this.active = active;
    }
}
