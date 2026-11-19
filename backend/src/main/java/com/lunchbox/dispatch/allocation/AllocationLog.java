package com.lunchbox.dispatch.allocation;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.dispatch.PartnerDirectory;
import com.lunchbox.dispatch.allocation.AllocationDecision.Outcome;
import com.lunchbox.dispatch.allocation.AllocationModel.Breakdown;
import com.lunchbox.dispatch.allocation.AllocationModel.Result;
import com.lunchbox.dispatch.allocation.AllocationRun.Trigger;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * The allocation decision log: one run per engine invocation and one decision per order touched (assigned, left
 * unassigned with a reason, overridden by ops, declined by a rider, released). Powers "who / when / why" in the admin
 * panel and keeps declined riders from being offered the same order again.
 */
@Service
public class AllocationLog {

    private final AllocationRunRepository runs;
    private final AllocationDecisionRepository decisions;
    private final PartnerDirectory partners;
    private final ObjectMapper json;
    private final Clock clock;

    public AllocationLog(AllocationRunRepository runs, AllocationDecisionRepository decisions, PartnerDirectory partners,
                         ObjectMapper json, Clock clock) {
        this.runs = runs;
        this.decisions = decisions;
        this.partners = partners;
        this.json = json;
        this.clock = clock;
    }

    public record RunView(UUID id, LocalDate date, Trigger trigger, UUID actorUserId, Instant startedAt,
                          Instant finishedAt, int considered, int assigned, int unassigned, int riders,
                          BigDecimal totalCost, int improvingMoves, int solveMs, String travelSource, JsonNode weights) {
    }

    public record DecisionView(UUID id, UUID runId, UUID orderId, UUID partnerId, String partnerName, Outcome outcome,
                               String reasonCode, String reason, JsonNode breakdown, Integer eligibleRiders,
                               UUID runnerUpPartnerId, String runnerUpName, BigDecimal runnerUpCost, UUID actorUserId,
                               Instant createdAt) {
    }

    public record LatestOutcome(Outcome outcome, String reasonCode) {
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public UUID startRun(LocalDate date, Trigger trigger, UUID actorUserId, AllocationWeights weights, Instant startedAt) {
        return runs.save(new AllocationRun(date, trigger, actorUserId, write(weights), startedAt)).getId();
    }

    /** The most recent decision per order, to avoid logging the same "still no rider" every few minutes. */
    @Transactional(readOnly = true)
    public Map<UUID, LatestOutcome> latestOutcomes(Collection<UUID> orderIds) {
        if (orderIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, LatestOutcome> out = new HashMap<>();
        decisions.latest(orderIds).forEach(d -> out.put(d.getOrderId(), new LatestOutcome(Outcome.valueOf(d.getOutcome()), d.getReasonCode())));
        return out;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void finishRun(UUID runId, int considered, int assigned, int unassigned, int riders, Result result) {
        runs.findById(runId).ifPresent(r -> r.finish(considered, assigned, unassigned, riders,
                result == null ? 0 : result.totalCost(), result == null ? 0 : result.improvingMoves(),
                result == null ? 0 : result.solveMillis(), result == null ? null : result.travelSource(), clock.instant()));
    }

    /** Records one decision in its own transaction, so the log survives a later failure in the same run. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(UUID runId, UUID orderId, UUID partnerId, Outcome outcome, String reasonCode, String reason,
                       Breakdown breakdown, Integer eligibleRiders, UUID runnerUpPartnerId, Double runnerUpCost,
                       UUID actorUserId) {
        decisions.save(new AllocationDecision(runId, orderId, partnerId, outcome, reasonCode, reason,
                breakdown == null ? null : write(breakdown), eligibleRiders, runnerUpPartnerId, runnerUpCost, actorUserId,
                clock.instant()));
    }

    /** Order id → riders who declined it. */
    @Transactional(readOnly = true)
    public Map<UUID, Set<UUID>> declinedBy(Collection<UUID> orderIds) {
        if (orderIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, Set<UUID>> out = new HashMap<>();
        decisions.declinedFor(orderIds).forEach(d -> out.computeIfAbsent(d.getOrderId(), k -> new HashSet<>()).add(d.getPartnerId()));
        return out;
    }

    @Transactional(readOnly = true)
    public Map<UUID, Long> declineCounts(Collection<UUID> partnerIds, Instant since) {
        if (partnerIds.isEmpty()) {
            return Map.of();
        }
        return decisions.declineCounts(partnerIds, since).stream()
                .collect(Collectors.toMap(AllocationDecisionRepository.PartnerCount::getPartnerId,
                        AllocationDecisionRepository.PartnerCount::getDeclines));
    }

    @Transactional(readOnly = true)
    public List<DecisionView> forOrder(UUID orderId) {
        return views(decisions.findByOrderIdOrderByCreatedAtDesc(orderId));
    }

    @Transactional(readOnly = true)
    public List<DecisionView> forRun(UUID runId) {
        return views(decisions.findByRunIdOrderByCreatedAt(runId));
    }

    @Transactional(readOnly = true)
    public List<RunView> runs(LocalDate date, int limit) {
        PageRequest page = PageRequest.of(0, Math.max(1, Math.min(limit, 200)));
        List<AllocationRun> list = date == null ? runs.findAllByOrderByStartedAtDesc(page)
                : runs.findByRunDateOrderByStartedAtDesc(date, page);
        return list.stream().map(r -> new RunView(r.getId(), r.getRunDate(), r.getTrigger(), r.getActorUserId(),
                r.getStartedAt(), r.getFinishedAt(), r.getConsidered(), r.getAssigned(), r.getUnassigned(), r.getRiders(),
                r.getTotalCost(), r.getImprovingMoves(), r.getSolveMs(), r.getTravelSource(), read(r.getWeights()))).toList();
    }

    private List<DecisionView> views(List<AllocationDecision> list) {
        Set<UUID> ids = list.stream().flatMap(d -> Stream.of(d.getPartnerId(), d.getRunnerUpPartnerId()))
                .filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        Map<UUID, PartnerDirectory.PartnerInfo> names = partners.findAll(ids);
        return list.stream().map(d -> new DecisionView(d.getId(), d.getRunId(), d.getOrderId(), d.getPartnerId(),
                name(names, d.getPartnerId()), d.getOutcome(), d.getReasonCode(), d.getReason(), read(d.getBreakdown()),
                d.getEligibleRiders(), d.getRunnerUpPartnerId(), name(names, d.getRunnerUpPartnerId()), d.getRunnerUpCost(),
                d.getActorUserId(), d.getCreatedAt())).toList();
    }

    private static String name(Map<UUID, PartnerDirectory.PartnerInfo> names, UUID id) {
        PartnerDirectory.PartnerInfo p = id == null ? null : names.get(id);
        return p == null ? null : p.displayName();
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private JsonNode read(String value) {
        if (value == null) {
            return null;
        }
        try {
            return json.readTree(value);
        } catch (JsonProcessingException e) {
            return null;
        }
    }
}
