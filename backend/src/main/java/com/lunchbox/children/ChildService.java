package com.lunchbox.children;

import com.lunchbox.audit.AuditService;
import com.lunchbox.children.web.ChildDtos.AdminChildResponse;
import com.lunchbox.children.web.ChildDtos.ChildRequest;
import com.lunchbox.children.web.ChildDtos.ChildResponse;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.privacy.PersonalDataContributor;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.common.web.Pagination;
import com.lunchbox.schools.SchoolDirectory;
import com.lunchbox.schools.SchoolDirectory.SchoolInfo;
import com.lunchbox.users.ConsentPurpose;
import com.lunchbox.users.UserDirectory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class ChildService implements ChildDirectory, PersonalDataContributor {

    static final int MAX_CHILDREN_PER_PARENT = 8;

    private final ChildRepository children;
    private final SchoolDirectory schools;
    private final UserDirectory users;
    private final AuditService audit;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public ChildService(ChildRepository children, SchoolDirectory schools, UserDirectory users, AuditService audit,
                        ApplicationEventPublisher events, Clock clock) {
        this.children = children;
        this.schools = schools;
        this.users = users;
        this.audit = audit;
        this.events = events;
        this.clock = clock;
    }

    // ---- ChildDirectory ----

    @Override
    @Transactional(readOnly = true)
    public ChildInfo require(UUID childId) {
        return children.findById(childId).map(ChildService::info).orElseThrow(() -> Errors.notFound("Child"));
    }

    @Override
    @Transactional(readOnly = true)
    public ChildInfo requireOwned(UUID childId, UUID parentId) {
        return children.findByIdAndParentIdAndDeletedAtIsNull(childId, parentId).map(ChildService::info)
                .orElseThrow(() -> Errors.notFound("Child"));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, ChildInfo> findAll(Collection<UUID> childIds) {
        if (childIds.isEmpty()) {
            return Map.of();
        }
        return children.findByIdIn(childIds).stream().map(ChildService::info)
                .collect(Collectors.toMap(ChildInfo::id, Function.identity()));
    }

    @Override
    @Transactional(readOnly = true)
    public Set<UUID> parentIdsAtSchool(UUID schoolId) {
        return Set.copyOf(children.findParentIdsAtSchool(schoolId));
    }

    // ---- Parent API ----

    @Transactional(readOnly = true)
    public List<ChildResponse> list(UUID parentUserId) {
        UUID parentId = users.requireParentId(parentUserId);
        List<Child> list = children.findByParentIdAndDeletedAtIsNullOrderByCreatedAt(parentId);
        Map<UUID, SchoolInfo> schoolMap = schools.findAll(list.stream().map(Child::getSchoolId).collect(Collectors.toSet()));
        return list.stream().map(c -> toResponse(c, schoolMap.get(c.getSchoolId()))).toList();
    }

    @Transactional(readOnly = true)
    public ChildResponse get(UUID parentUserId, UUID childId) {
        UUID parentId = users.requireParentId(parentUserId);
        Child child = children.findByIdAndParentIdAndDeletedAtIsNull(childId, parentId)
                .orElseThrow(() -> Errors.notFound("Child"));
        return toResponse(child, schools.find(child.getSchoolId()).orElse(null));
    }

    @Transactional
    public ChildResponse create(UUID parentUserId, ChildRequest request) {
        if (!users.hasActiveConsent(parentUserId, ConsentPurpose.CHILD_DATA_PROCESSING)) {
            throw Errors.unprocessable("parental_consent_required",
                    "Please give parental consent before adding a child.");
        }
        UUID parentId = users.requireParentId(parentUserId);
        if (children.countByParentIdAndDeletedAtIsNull(parentId) >= MAX_CHILDREN_PER_PARENT) {
            throw Errors.unprocessable("too_many_children", "You can add up to " + MAX_CHILDREN_PER_PARENT + " children.");
        }
        SchoolInfo school = requireActiveSchool(request.schoolId());
        Child child = new Child(parentId);
        apply(child, request);
        child = children.save(child);
        ChildResponse response = toResponse(child, school);
        audit.record("child.created", "Child", child.getId(), null, auditView(child));
        return response;
    }

    @Transactional
    public ChildResponse update(UUID parentUserId, UUID childId, ChildRequest request) {
        UUID parentId = users.requireParentId(parentUserId);
        Child child = children.findByIdAndParentIdAndDeletedAtIsNull(childId, parentId)
                .orElseThrow(() -> Errors.notFound("Child"));
        Map<String, Object> before = auditView(child);
        SchoolInfo school = requireActiveSchool(request.schoolId());
        apply(child, request);
        audit.record("child.updated", "Child", childId, before, auditView(child));
        return toResponse(child, school);
    }

    @Transactional
    public void delete(UUID parentUserId, UUID childId) {
        UUID parentId = users.requireParentId(parentUserId);
        Child child = children.findByIdAndParentIdAndDeletedAtIsNull(childId, parentId)
                .orElseThrow(() -> Errors.notFound("Child"));
        events.publishEvent(new ChildRemoved(childId, parentId));
        child.softDelete(clock.instant());
        audit.record("child.deleted", "Child", childId, auditView(child), null);
    }

    // ---- Admin ----

    @Transactional(readOnly = true)
    public PageResponse<AdminChildResponse> search(UUID schoolId, String q, Integer page, Integer size) {
        var result = children.search(schoolId, q == null || q.isBlank() ? null : q.trim(),
                Pagination.of(page, size, Sort.by("firstName")));
        Set<UUID> schoolIds = result.getContent().stream().map(Child::getSchoolId).collect(Collectors.toSet());
        Map<UUID, SchoolInfo> schoolMap = schools.findAll(schoolIds);
        return PageResponse.of(result, c -> new AdminChildResponse(c.getId(), c.getParentId(), c.getSchoolId(),
                nameOf(schoolMap.get(c.getSchoolId())), c.getFirstName(), c.getLastName(), c.getClassName(),
                c.getSection(), c.getRollNumber(), c.getCreatedAt()));
    }

    // ---- PersonalDataContributor ----

    @Override
    public String section() {
        return "children";
    }

    @Override
    public int order() {
        return 50;
    }

    @Override
    @Transactional(readOnly = true)
    public Object export(UUID userId) {
        return list(userId);
    }

    @Override
    @Transactional
    public void erase(UUID userId) {
        UUID parentId = users.requireParentId(userId);
        for (Child child : children.findByParentId(parentId)) {
            if (!child.isDeleted()) {
                events.publishEvent(new ChildRemoved(child.getId(), parentId));
            }
            child.anonymise(clock.instant());
        }
    }

    private SchoolInfo requireActiveSchool(UUID schoolId) {
        SchoolInfo school = schools.find(schoolId).orElseThrow(() -> Errors.badRequest("invalid_school", "Choose a valid school."));
        if (!school.active()) {
            throw Errors.unprocessable("school_inactive", "This school is not currently served by LunchBox.");
        }
        return school;
    }

    private static void apply(Child child, ChildRequest r) {
        child.update(r.schoolId(), r.firstName().trim(), blank(r.lastName()), r.className().trim(), blank(r.section()),
                blank(r.rollNumber()), blank(r.allergiesNote()));
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static ChildInfo info(Child c) {
        return new ChildInfo(c.getId(), c.getParentId(), c.getSchoolId(), c.getFirstName(), c.getLastName(),
                c.getClassName(), c.getSection(), c.isDeleted());
    }

    private static String nameOf(SchoolInfo school) {
        return school == null ? null : school.name();
    }

    private static ChildResponse toResponse(Child c, SchoolInfo school) {
        return new ChildResponse(c.getId(), c.getSchoolId(), nameOf(school), c.getFirstName(), c.getLastName(),
                c.getClassName(), c.getSection(), c.getRollNumber(), c.getAllergiesNote(), c.getCreatedAt());
    }

    /** Audit snapshot without health data. */
    private static Map<String, Object> auditView(Child c) {
        return Map.of("schoolId", c.getSchoolId(), "className", c.getClassName(),
                "section", c.getSection() == null ? "" : c.getSection(),
                "hasAllergiesNote", c.getAllergiesNote() != null);
    }
}
