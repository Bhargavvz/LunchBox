package com.lunchbox.subscriptions;

import com.lunchbox.audit.AuditService;
import com.lunchbox.payments.PaymentGateway;
import com.lunchbox.subscriptions.web.SubscriptionDtos.PlanUpdateRequest;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PlanServiceTest {

    private final PlanRepository plans = mock(PlanRepository.class);
    private final PlanFeatures features = mock(PlanFeatures.class);
    private final PlanService service = new PlanService(plans, mock(SubscriptionRepository.class), features,
            mock(PaymentGateway.class), mock(AuditService.class), "prepaid");

    @Test
    void activatingAPlanKeepsItsFeaturesTrialAndLimits() {
        Plan plan = new Plan("PRIORITY", "Priority", null, 299900, Plan.BillingPeriod.MONTHLY, 5);
        plan.configure(Plan.Visibility.HIDDEN, 7, 3, 50, "{\"priority_delivery\": true}");
        UUID id = UUID.randomUUID();
        when(plans.findById(id)).thenReturn(Optional.of(plan));
        when(features.days(any(), any())).thenReturn(Optional.empty());

        service.update(id, new PlanUpdateRequest("Priority", null, 5, false, null, null, null, null, null, null));

        assertThat(plan.isActive()).isFalse();
        assertThat(plan.getEntitlements()).isEqualTo("{\"priority_delivery\": true}");
        assertThat(plan.getTrialDays()).isEqualTo(7);
        assertThat(plan.getDurationPeriods()).isEqualTo(3);
        assertThat(plan.getMaxSubscribers()).isEqualTo(50);
        assertThat(plan.getVisibility()).isEqualTo(Plan.Visibility.HIDDEN);
    }

    @Test
    void zeroClearsTheDurationAndSubscriberLimit() {
        Plan plan = new Plan("MONTHLY", "Monthly", null, 249900, Plan.BillingPeriod.MONTHLY, 5);
        plan.configure(Plan.Visibility.PUBLIC, 0, 3, 50, "{}");
        UUID id = UUID.randomUUID();
        when(plans.findById(id)).thenReturn(Optional.of(plan));
        when(features.days(any(), any())).thenReturn(Optional.empty());

        service.update(id, new PlanUpdateRequest("Monthly", null, 5, true, null, null, null, 0, 0, null));

        assertThat(plan.getDurationPeriods()).isNull();
        assertThat(plan.getMaxSubscribers()).isNull();
    }
}
