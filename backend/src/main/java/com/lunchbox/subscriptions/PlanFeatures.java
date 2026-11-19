package com.lunchbox.subscriptions;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.Errors;
import com.lunchbox.subscriptions.PlanFeatureDefinition.ValueType;
import com.lunchbox.subscriptions.web.SubscriptionDtos.FeatureDefinitionRequest;
import com.lunchbox.subscriptions.web.SubscriptionDtos.FeatureDefinitionResponse;
import com.lunchbox.subscriptions.web.SubscriptionDtos.PlanFeatureValue;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.DayOfWeek;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Plan features (ADR-0024). Each plan stores {@code key → value}; the keys and their value types live in
 * {@code plan_feature_definitions}, so admins can add new kinds of features without a release. The built-in keys below
 * are enforced by the backend; the rest are validated by type and shown to parents.
 */
@Service
public class PlanFeatures {

    public static final String MAX_CHILDREN = "max_children";
    public static final String ALLOWED_DAYS = "allowed_days";
    public static final String MAX_LEAVE_DAYS_PER_MONTH = "max_leave_days_per_month";
    public static final String CANCELLATION_ALLOWED = "cancellation_allowed";
    public static final String PRIORITY_DELIVERY = "priority_delivery";
    public static final String LIVE_TRACKING = "live_tracking";

    private final PlanFeatureDefinitionRepository definitions;
    private final ObjectMapper json;
    private final AuditService audit;
    private final Clock clock;

    public PlanFeatures(PlanFeatureDefinitionRepository definitions, ObjectMapper json, AuditService audit, Clock clock) {
        this.definitions = definitions;
        this.json = json;
        this.audit = audit;
        this.clock = clock;
    }

    // ---- Definitions (admin) ----

    @Transactional(readOnly = true)
    public List<FeatureDefinitionResponse> definitions() {
        return definitions.findAllByOrderByDisplayOrderAscKeyAsc().stream().map(this::toResponse).toList();
    }

    @Transactional
    public FeatureDefinitionResponse create(FeatureDefinitionRequest r) {
        if (definitions.existsById(r.key())) {
            throw Errors.conflict("duplicate_feature", "A feature with this key already exists.");
        }
        PlanFeatureDefinition d = definitions.save(new PlanFeatureDefinition(r.key(), r.label().trim(),
                blankToNull(r.description()), r.valueType(), r.displayOrder() == null ? 100 : r.displayOrder(), clock.instant()));
        FeatureDefinitionResponse out = toResponse(d);
        audit.record("plan_feature.created", "PlanFeature", d.getKey(), null, out);
        return out;
    }

    /** Label, description, order and active can change; the key and value type cannot (plans already use them). */
    @Transactional
    public FeatureDefinitionResponse update(String key, FeatureDefinitionRequest r) {
        PlanFeatureDefinition d = definitions.findById(key).orElseThrow(() -> Errors.notFound("Feature"));
        if (r.valueType() != d.getValueType()) {
            throw Errors.badRequest("type_immutable", "A feature's value type cannot change. Add a new feature instead.");
        }
        FeatureDefinitionResponse before = toResponse(d);
        d.update(r.label().trim(), blankToNull(r.description()), r.displayOrder() == null ? d.getDisplayOrder() : r.displayOrder(),
                d.isEnforced() || r.active(), clock.instant());
        FeatureDefinitionResponse after = toResponse(d);
        audit.record("plan_feature.updated", "PlanFeature", key, before, after);
        return after;
    }

    // ---- Values on plans ----

    /**
     * Checks a plan's feature values against the definitions and returns the canonical JSON to store. Null values
     * remove the feature from the plan.
     */
    @Transactional(readOnly = true)
    public String validate(Map<String, JsonNode> values) {
        Map<String, PlanFeatureDefinition> defs = definitionMap();
        ObjectNode out = json.createObjectNode();
        List<String> problems = new ArrayList<>();
        if (values != null) {
            values.forEach((key, value) -> {
                if (value == null || value.isNull()) {
                    return;
                }
                PlanFeatureDefinition d = defs.get(key);
                if (d == null || !d.isActive()) {
                    problems.add("Unknown feature \"" + key + "\".");
                    return;
                }
                String problem = check(d.getValueType(), value);
                if (problem != null) {
                    problems.add(d.getLabel() + ": " + problem);
                } else {
                    out.set(key, canonical(d.getValueType(), value));
                }
            });
        }
        if (!problems.isEmpty()) {
            throw Errors.badRequest("invalid_features", String.join(" ", problems));
        }
        return out.toString();
    }

    /** Plan features with labels, for plan cards: only the ones set on the plan, in display order. */
    @Transactional(readOnly = true)
    public List<PlanFeatureValue> describe(Plan plan) {
        Map<String, PlanFeatureDefinition> defs = definitionMap();
        JsonNode values = read(plan.getEntitlements());
        List<PlanFeatureValue> out = new ArrayList<>();
        for (Iterator<Map.Entry<String, JsonNode>> it = values.fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> e = it.next();
            PlanFeatureDefinition d = defs.get(e.getKey());
            if (d != null && d.isActive()) {
                out.add(new PlanFeatureValue(d.getKey(), d.getLabel(), d.getDescription(), d.getValueType(), e.getValue(),
                        d.isEnforced(), d.getDisplayOrder()));
            }
        }
        out.sort((a, b) -> a.displayOrder() != b.displayOrder() ? Integer.compare(a.displayOrder(), b.displayOrder())
                : a.key().compareTo(b.key()));
        return out;
    }

    public Map<String, JsonNode> values(Plan plan) {
        Map<String, JsonNode> out = new LinkedHashMap<>();
        read(plan.getEntitlements()).fields().forEachRemaining(e -> out.put(e.getKey(), e.getValue()));
        return out;
    }

    // ---- Typed reads for enforcement (definition default when the plan does not set it) ----

    public Optional<Integer> integer(Plan plan, String key) {
        JsonNode v = valueOrDefault(plan, key);
        return v != null && v.isInt() ? Optional.of(v.asInt()) : Optional.empty();
    }

    public boolean bool(Plan plan, String key, boolean fallback) {
        JsonNode v = valueOrDefault(plan, key);
        return v != null && v.isBoolean() ? v.asBoolean() : fallback;
    }

    public Optional<Set<DayOfWeek>> days(Plan plan, String key) {
        JsonNode v = valueOrDefault(plan, key);
        if (v == null || !v.isArray()) {
            return Optional.empty();
        }
        Set<DayOfWeek> out = EnumSet.noneOf(DayOfWeek.class);
        v.forEach(n -> out.add(DayOfWeek.valueOf(n.asText())));
        return Optional.of(out);
    }

    private JsonNode valueOrDefault(Plan plan, String key) {
        JsonNode v = read(plan.getEntitlements()).get(key);
        if (v != null && !v.isNull()) {
            return v;
        }
        return definitions.findById(key).filter(PlanFeatureDefinition::isActive)
                .map(d -> d.getDefaultValue() == null ? null : read(d.getDefaultValue())).orElse(null);
    }

    static String check(ValueType type, JsonNode v) {
        return switch (type) {
            case BOOLEAN -> v.isBoolean() ? null : "choose yes or no.";
            case INTEGER -> v.isIntegralNumber() && v.asLong() >= 0 && v.asLong() <= 10_000 ? null : "enter a whole number from 0 to 10000.";
            case MONEY -> v.isIntegralNumber() && v.asLong() >= 0 && v.asLong() <= 1_000_000_000L ? null : "enter an amount in paise.";
            case TEXT -> v.isTextual() && !v.asText().isBlank() && v.asText().length() <= 300 ? null : "enter up to 300 characters.";
            case DAYS -> {
                if (!v.isArray() || v.isEmpty()) {
                    yield "choose at least one day.";
                }
                Set<String> seen = new HashSet<>();
                for (JsonNode n : v) {
                    if (!n.isTextual() || !seen.add(n.asText())) {
                        yield "list each day once.";
                    }
                    try {
                        DayOfWeek.valueOf(n.asText());
                    } catch (IllegalArgumentException e) {
                        yield "\"" + n.asText() + "\" is not a day.";
                    }
                }
                yield null;
            }
        };
    }

    private JsonNode canonical(ValueType type, JsonNode v) {
        if (type == ValueType.TEXT) {
            return json.getNodeFactory().textNode(v.asText().trim());
        }
        if (type == ValueType.DAYS) {
            Set<DayOfWeek> days = EnumSet.noneOf(DayOfWeek.class);
            v.forEach(n -> days.add(DayOfWeek.valueOf(n.asText())));
            var arr = json.createArrayNode();
            days.forEach(d -> arr.add(d.name()));
            return arr;
        }
        return v;
    }

    private Map<String, PlanFeatureDefinition> definitionMap() {
        return definitions.findAll().stream().collect(Collectors.toMap(PlanFeatureDefinition::getKey, Function.identity()));
    }

    private FeatureDefinitionResponse toResponse(PlanFeatureDefinition d) {
        return new FeatureDefinitionResponse(d.getKey(), d.getLabel(), d.getDescription(), d.getValueType(), d.isEnforced(),
                d.getDefaultValue() == null ? null : read(d.getDefaultValue()), d.getDisplayOrder(), d.isActive());
    }

    private JsonNode read(String value) {
        try {
            return value == null ? json.createObjectNode() : json.readTree(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Unreadable plan features", e);
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
