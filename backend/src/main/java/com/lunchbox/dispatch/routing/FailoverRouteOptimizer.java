package com.lunchbox.dispatch.routing;

import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;

/** Tries an external provider first and falls back to another optimiser (OR-Tools) when it errors or times out. */
@Slf4j
public class FailoverRouteOptimizer implements RouteOptimizer {

    private final RouteOptimizer primary;
    private final RouteOptimizer secondary;
    private final MeterRegistry meters;

    public FailoverRouteOptimizer(RouteOptimizer primary, RouteOptimizer secondary, MeterRegistry meters) {
        this.primary = primary;
        this.secondary = secondary;
        this.meters = meters;
    }

    @Override
    public String name() {
        return primary.name();
    }

    @Override
    public RoutePlan optimize(RoutingProblem problem) {
        try {
            return primary.optimize(problem);
        } catch (RuntimeException e) {
            log.warn("{} failed ({}); using {}", primary.name(), e.toString(), secondary.name());
            meters.counter("lunchbox.dispatch.optimizer_failover", "provider", primary.name()).increment();
            return secondary.optimize(problem);
        }
    }
}
