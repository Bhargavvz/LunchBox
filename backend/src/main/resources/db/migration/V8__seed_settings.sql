INSERT INTO app_settings (key, value, description, updated_at, version) VALUES
    ('order.cutoff_time', '"21:00"', 'IST time on the previous day after which the next day''s orders are frozen', now(), 0),
    ('order.pickup_lead_minutes', '90', 'Minutes before the school delivery window that home pickups begin', now(), 0),
    ('order.pickup_window_minutes', '45', 'Length of the home pickup window in minutes', now(), 0),
    ('geofence.home_arrival_radius_m', '75', 'Radius around a home that counts as partner arrival (m)', now(), 0),
    ('geofence.default_school_radius_m', '150', 'School geofence radius when a school has no polygon (m)', now(), 0),
    ('dispatch.pickup_wait_minutes', '5', 'Minutes a partner waits at a home before a pickup may be marked failed', now(), 0),
    ('dispatch.no_show_grace_minutes', '15', 'Minutes after shift start before a partner is a no-show', now(), 0),
    ('pay.rates', '{"baseDayPaise": 15000, "perDeliveryPaise": 2500, "perKmPaise": 400, "onTimeBonusPaise": 500, "failedDeliveryPenaltyPaise": 2000, "noShowPenaltyPaise": 10000, "minPayoutPaise": 10000}',
     'Partner pay rates in paise', now(), 0);
