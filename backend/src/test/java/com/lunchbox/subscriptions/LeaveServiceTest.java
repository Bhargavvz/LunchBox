package com.lunchbox.subscriptions;

import com.lunchbox.audit.AuditService;
import com.lunchbox.children.ChildDirectory;
import com.lunchbox.common.error.ApiException;
import com.lunchbox.common.error.Errors;
import com.lunchbox.orders.PickupWindows;
import com.lunchbox.subscriptions.SubscriptionEvents.LeaveDayAdded;
import com.lunchbox.subscriptions.web.SubscriptionDtos.LeaveDayRequest;
import com.lunchbox.users.UserDirectory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LeaveServiceTest {

    private static final LocalDate FIRST_OPEN = LocalDate.of(2026, 10, 21);

    private final LeaveDayRepository leaves = mock(LeaveDayRepository.class);
    private final ChildDirectory children = mock(ChildDirectory.class);
    private final UserDirectory users = mock(UserDirectory.class);
    private final PickupWindows windows = mock(PickupWindows.class);
    private final AuditService audit = mock(AuditService.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final LeaveService service = new LeaveService(leaves, children, users, windows, audit, events);

    private final UUID parentUser = UUID.randomUUID();
    private final UUID parentId = UUID.randomUUID();
    private final UUID childId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        when(users.requireParentId(parentUser)).thenReturn(parentId);
        when(windows.firstOpenDate()).thenReturn(FIRST_OPEN);
        when(leaves.save(any(LeaveDay.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void addsLeaveOnTheFirstOpenDayAndPublishesTheEvent() {
        var response = service.add(parentUser, childId, new LeaveDayRequest(FIRST_OPEN, "Unwell"));

        assertThat(response.date()).isEqualTo(FIRST_OPEN);
        verify(children).requireOwned(childId, parentId);
        verify(events).publishEvent(new LeaveDayAdded(childId, FIRST_OPEN, "Unwell"));
    }

    @Test
    void rejectsDaysWhoseCutoffHasPassed() {
        assertThatThrownBy(() -> service.add(parentUser, childId, new LeaveDayRequest(FIRST_OPEN.minusDays(1), null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("cutoff_passed");
        verify(leaves, never()).save(any());
    }

    @Test
    void rejectsDaysTooFarAhead() {
        assertThatThrownBy(() -> service.add(parentUser, childId, new LeaveDayRequest(FIRST_OPEN.plusDays(181), null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("too_far_ahead");
    }

    @Test
    void rejectsDuplicateLeave() {
        when(leaves.findByChildIdAndLeaveDate(childId, FIRST_OPEN))
                .thenReturn(Optional.of(new LeaveDay(childId, FIRST_OPEN, null, parentUser)));

        assertThatThrownBy(() -> service.add(parentUser, childId, new LeaveDayRequest(FIRST_OPEN, null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("leave_exists");
    }

    @Test
    void ownershipIsCheckedBeforeAnythingElse() {
        when(children.requireOwned(childId, parentId)).thenThrow(Errors.notFound("Child"));

        assertThatThrownBy(() -> service.remove(parentUser, childId, FIRST_OPEN)).isInstanceOf(ApiException.class);
        verify(leaves, never()).delete(any());
    }

    @Test
    void removingAfterCutoffIsRefused() {
        assertThatThrownBy(() -> service.remove(parentUser, childId, FIRST_OPEN.minusDays(1)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("cutoff_passed");
        verify(leaves, never()).delete(any());
    }
}
