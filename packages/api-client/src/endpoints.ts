import { createRawClient, newIdempotencyKey, unwrap, type ClientOptions } from './client';
import { ApiError } from './errors';
import type { Schemas } from './types';

type S = Schemas;

/**
 * Typed facade over the generated OpenAPI client. Apps call these functions instead of raw paths so that a
 * contract change surfaces as one compile error here.
 */
export function createLunchBoxApi(options: ClientOptions) {
  const c = createRawClient(options);

  const raw = async (method: string, path: string, body?: unknown): Promise<Response> => {
    const token = await options.getToken();
    const f = options.fetch ?? fetch;
    const res = await f(options.baseUrl + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw await ApiError.fromResponse(res);
    return res;
  };

  return {
    newIdempotencyKey,

    auth: {
      me: () => unwrap(c.GET('/api/v1/auth/me')),
      registerParent: (body: S['RegisterParentRequest']) =>
        unwrap(c.POST('/api/v1/auth/register/parent', { body })),
    },

    account: {
      update: (body: S['UpdateProfileRequest']) => unwrap(c.PATCH('/api/v1/me', { body })),
      consents: () => unwrap(c.GET('/api/v1/me/consents')),
      recordConsent: (body: S['RecordConsentRequest']) => unwrap(c.POST('/api/v1/me/consents', { body })),
      exportData: () => unwrap(c.GET('/api/v1/me/export')),
      deleteAccount: () => unwrap(c.DELETE('/api/v1/me')),
    },

    schools: {
      search: (q?: string, page = 0) =>
        unwrap(c.GET('/api/v1/schools', { params: { query: { q, page, size: 30 } } })),
      holidays: (schoolId: string, from: string, to: string) =>
        unwrap(c.GET('/api/v1/schools/{schoolId}/holidays', { params: { path: { schoolId }, query: { from, to } } })),
    },

    serviceAreas: {
      check: (lat: number, lng: number) =>
        unwrap(c.GET('/api/v1/service-areas/check', { params: { query: { lat, lng } } })),
    },

    children: {
      list: () => unwrap(c.GET('/api/v1/children')),
      get: (childId: string) => unwrap(c.GET('/api/v1/children/{childId}', { params: { path: { childId } } })),
      create: (body: S['ChildRequest']) => unwrap(c.POST('/api/v1/children', { body })),
      update: (childId: string, body: S['ChildRequest']) =>
        unwrap(c.PUT('/api/v1/children/{childId}', { params: { path: { childId } }, body })),
      remove: (childId: string) => unwrap(c.DELETE('/api/v1/children/{childId}', { params: { path: { childId } } })),
      leaveDays: (childId: string, from: string, to: string) =>
        unwrap(c.GET('/api/v1/children/{childId}/leave-days', { params: { path: { childId }, query: { from, to } } })),
      addLeave: (childId: string, body: S['LeaveDayRequest']) =>
        unwrap(c.POST('/api/v1/children/{childId}/leave-days', { params: { path: { childId } }, body })),
      removeLeave: (childId: string, date: string) =>
        unwrap(c.DELETE('/api/v1/children/{childId}/leave-days/{date}', { params: { path: { childId, date } } })),
    },

    addresses: {
      list: () => unwrap(c.GET('/api/v1/addresses')),
      create: (body: S['AddressRequest']) => unwrap(c.POST('/api/v1/addresses', { body })),
      update: (addressId: string, body: S['AddressRequest']) =>
        unwrap(c.PUT('/api/v1/addresses/{addressId}', { params: { path: { addressId } }, body })),
      remove: (addressId: string) =>
        unwrap(c.DELETE('/api/v1/addresses/{addressId}', { params: { path: { addressId } } })),
    },

    plans: {
      list: () => unwrap(c.GET('/api/v1/plans')),
    },

    subscriptions: {
      list: () => unwrap(c.GET('/api/v1/subscriptions')),
      create: (body: S['CreateSubscriptionRequest'], idempotencyKey = newIdempotencyKey()) =>
        unwrap(c.POST('/api/v1/subscriptions', { params: { header: { 'Idempotency-Key': idempotencyKey } }, body })),
      verify: (subscriptionId: string, body: S['VerifyCheckoutRequest'], idempotencyKey = newIdempotencyKey()) =>
        unwrap(
          c.POST('/api/v1/subscriptions/{subscriptionId}/verify', {
            params: { path: { subscriptionId }, header: { 'Idempotency-Key': idempotencyKey } },
            body,
          }),
        ),
      updateSchedule: (subscriptionId: string, body: S['UpdateScheduleRequest']) =>
        unwrap(c.PUT('/api/v1/subscriptions/{subscriptionId}/schedule', { params: { path: { subscriptionId } }, body })),
      cancel: (subscriptionId: string, reason: string) =>
        unwrap(
          c.POST('/api/v1/subscriptions/{subscriptionId}/cancel', {
            params: { path: { subscriptionId } },
            body: { reason },
          }),
        ),
      /** Local development only (fake Razorpay): simulates a successful checkout. */
      devSimulateCharge: async (providerSubscriptionId: string, amountPaise: number) => {
        const res = await raw('POST', '/api/v1/dev/payments/simulate-charge', { providerSubscriptionId, amountPaise });
        return (await res.json()) as { razorpayPaymentId: string; razorpaySignature: string };
      },
    },

    orders: {
      today: () => unwrap(c.GET('/api/v1/orders/today')),
      history: (query: { childId?: string; from?: string; to?: string; page?: number; size?: number }) =>
        unwrap(c.GET('/api/v1/orders', { params: { query } })),
      detail: (orderId: string) => unwrap(c.GET('/api/v1/orders/{orderId}', { params: { path: { orderId } } })),
      tracking: (orderId: string) =>
        unwrap(c.GET('/api/v1/orders/{orderId}/tracking', { params: { path: { orderId } } })),
      pickupCode: (orderId: string) =>
        unwrap(c.GET('/api/v1/orders/{orderId}/pickup-code', { params: { path: { orderId } } })),
      handoverPhoto: (orderId: string) =>
        unwrap(c.GET('/api/v1/orders/{orderId}/handover-photo', { params: { path: { orderId } } })),
      callPartner: (orderId: string) =>
        unwrap(c.POST('/api/v1/orders/{orderId}/call-partner', { params: { path: { orderId } } })),
    },

    notifications: {
      list: (page = 0) => unwrap(c.GET('/api/v1/notifications', { params: { query: { page, size: 30 } } })),
      unreadCount: () => unwrap(c.GET('/api/v1/notifications/unread-count')),
      markRead: (notificationId: string) =>
        unwrap(c.POST('/api/v1/notifications/{notificationId}/read', { params: { path: { notificationId } } })),
      markAllRead: () => unwrap(c.POST('/api/v1/notifications/read-all')),
      registerDevice: (body: S['RegisterDeviceRequest']) => unwrap(c.POST('/api/v1/devices', { body })),
      unregisterDevice: (token: string) =>
        unwrap(c.DELETE('/api/v1/devices/{token}', { params: { path: { token } } })),
    },

    payments: {
      list: (page = 0) => unwrap(c.GET('/api/v1/payments', { params: { query: { page, size: 30 } } })),
      invoice: (paymentId: string) =>
        unwrap(c.GET('/api/v1/payments/{paymentId}/invoice', { params: { path: { paymentId } } })),
    },

    partner: {
      me: () => unwrap(c.GET('/api/v1/partner/me')),
      startShift: (location: S['GeoPoint']) => unwrap(c.POST('/api/v1/partner/shift/start', { body: { location } })),
      endShift: () => unwrap(c.POST('/api/v1/partner/shift/end')),
      todayRoute: () => unwrap(c.GET('/api/v1/partner/route/today')),
      startRoute: () => unwrap(c.POST('/api/v1/partner/route/start')),
      arrive: (stopId: string, location: S['GeoPoint']) =>
        unwrap(c.POST('/api/v1/partner/stops/{stopId}/arrive', { params: { path: { stopId } }, body: { location } })),
      pickup: (orderId: string, body: S['PickupConfirmRequest'], idempotencyKey: string) =>
        unwrap(
          c.POST('/api/v1/partner/orders/{orderId}/pickup', {
            params: { path: { orderId }, header: { 'Idempotency-Key': idempotencyKey } },
            body,
          }),
        ),
      pickupFailed: (orderId: string, body: S['FailureRequest'], idempotencyKey: string) =>
        unwrap(
          c.POST('/api/v1/partner/orders/{orderId}/pickup-failed', {
            params: { path: { orderId }, header: { 'Idempotency-Key': idempotencyKey } },
            body,
          }),
        ),
      handoverUploadUrl: () => unwrap(c.POST('/api/v1/partner/handover/upload-url')),
      handover: (schoolId: string, body: S['HandoverRequest'], idempotencyKey: string) =>
        unwrap(
          c.POST('/api/v1/partner/schools/{schoolId}/handover', {
            params: { path: { schoolId }, header: { 'Idempotency-Key': idempotencyKey } },
            body,
          }),
        ),
      deliveryFailed: (orderId: string, body: S['FailureRequest'], idempotencyKey: string) =>
        unwrap(
          c.POST('/api/v1/partner/orders/{orderId}/delivery-failed', {
            params: { path: { orderId }, header: { 'Idempotency-Key': idempotencyKey } },
            body,
          }),
        ),
      callParent: (orderId: string) =>
        unwrap(c.POST('/api/v1/partner/orders/{orderId}/call', { params: { path: { orderId } } })),
      reportIssue: (body: S['IssueRequest'], idempotencyKey: string) =>
        unwrap(c.POST('/api/v1/partner/issues', { params: { header: { 'Idempotency-Key': idempotencyKey } }, body })),
      sendLocations: (pings: S['PingInput'][]) =>
        unwrap(c.POST('/api/v1/partner/locations', { body: { pings } })),
      earnings: (from?: string, to?: string) =>
        unwrap(c.GET('/api/v1/partner/earnings', { params: { query: { from, to } } })),
      monthlyEarnings: (month?: string) =>
        unwrap(c.GET('/api/v1/partner/earnings/monthly', { params: { query: { month } } })),
      payouts: (page = 0) => unwrap(c.GET('/api/v1/partner/payouts', { params: { query: { page, size: 30 } } })),
    },

    admin: createAdminApi(c, raw),

    schoolAdmin: {
      orders: (date?: string) => unwrap(c.GET('/api/v1/school-admin/orders', { params: { query: { date } } })),
      confirmReceipt: (orderId: string) =>
        unwrap(c.POST('/api/v1/school-admin/orders/{orderId}/confirm-receipt', { params: { path: { orderId } } })),
    },
  };
}

function createAdminApi(c: ReturnType<typeof createRawClient>, raw: (m: string, p: string, b?: unknown) => Promise<Response>) {
  return {
    dashboard: (date?: string) => unwrap(c.GET('/api/v1/admin/dashboard', { params: { query: { date } } })),

    parents: (q?: string, page = 0, size = 25) =>
      unwrap(c.GET('/api/v1/admin/parents', { params: { query: { q, page, size } } })),
    children: (query: { schoolId?: string; q?: string; page?: number; size?: number }) =>
      unwrap(c.GET('/api/v1/admin/children', { params: { query } })),
    setUserStatus: (userId: string, action: 'SUSPEND' | 'REACTIVATE') =>
      unwrap(c.POST('/api/v1/admin/users/{userId}/status', { params: { path: { userId } }, body: { action } })),
    staff: (q?: string, page = 0) => unwrap(c.GET('/api/v1/admin/staff', { params: { query: { q, page, size: 25 } } })),
    createStaff: (body: Schemas['CreateStaffRequest']) => unwrap(c.POST('/api/v1/admin/staff', { body })),

    schools: (q?: string, page = 0, size = 25) =>
      unwrap(c.GET('/api/v1/admin/schools', { params: { query: { q, page, size } } })),
    school: (schoolId: string) => unwrap(c.GET('/api/v1/admin/schools/{schoolId}', { params: { path: { schoolId } } })),
    createSchool: (body: Schemas['SchoolRequest']) => unwrap(c.POST('/api/v1/admin/schools', { body })),
    updateSchool: (schoolId: string, body: Schemas['SchoolRequest']) =>
      unwrap(c.PUT('/api/v1/admin/schools/{schoolId}', { params: { path: { schoolId } }, body })),
    addHoliday: (schoolId: string, body: Schemas['HolidayRequest']) =>
      unwrap(c.POST('/api/v1/admin/schools/{schoolId}/holidays', { params: { path: { schoolId } }, body })),
    removeHoliday: (schoolId: string, holidayId: string) =>
      unwrap(
        c.DELETE('/api/v1/admin/schools/{schoolId}/holidays/{holidayId}', { params: { path: { schoolId, holidayId } } }),
      ),

    serviceAreas: () => unwrap(c.GET('/api/v1/admin/service-areas')),
    createServiceArea: (body: Schemas['ServiceAreaRequest']) => unwrap(c.POST('/api/v1/admin/service-areas', { body })),
    updateServiceArea: (id: string, body: Schemas['ServiceAreaRequest']) =>
      unwrap(c.PUT('/api/v1/admin/service-areas/{id}', { params: { path: { id } }, body })),
    deleteServiceArea: (id: string) =>
      unwrap(c.DELETE('/api/v1/admin/service-areas/{id}', { params: { path: { id } } })),

    orders: (query: { date?: string; status?: string; schoolId?: string; partnerId?: string; page?: number; size?: number }) =>
      unwrap(c.GET('/api/v1/admin/orders', { params: { query: query as never } })),
    order: (orderId: string) => unwrap(c.GET('/api/v1/admin/orders/{orderId}', { params: { path: { orderId } } })),
    cancelOrder: (orderId: string, reason: string) =>
      unwrap(c.POST('/api/v1/admin/orders/{orderId}/cancel', { params: { path: { orderId } }, body: { reason } })),
    assignOrder: (orderId: string, partnerId: string, reason?: string) =>
      unwrap(c.POST('/api/v1/admin/orders/{orderId}/assign', { params: { path: { orderId } }, body: { partnerId, reason } })),
    createManualOrder: (body: Schemas['CreateManualOrderRequest'], idempotencyKey = newIdempotencyKey()) =>
      unwrap(c.POST('/api/v1/admin/orders', { params: { header: { 'Idempotency-Key': idempotencyKey } }, body })),
    generateOrders: (date?: string) =>
      unwrap(c.POST('/api/v1/admin/jobs/generate-orders', { params: { query: { date } } })),
    autoAssign: (date?: string) => unwrap(c.POST('/api/v1/admin/jobs/auto-assign', { params: { query: { date } } })),
    routes: (date?: string) => unwrap(c.GET('/api/v1/admin/routes', { params: { query: { date } } })),

    partners: (query: { q?: string; kycStatus?: string; page?: number; size?: number }) =>
      unwrap(c.GET('/api/v1/admin/partners', { params: { query: query as never } })),
    partner: (partnerId: string) =>
      unwrap(c.GET('/api/v1/admin/partners/{partnerId}', { params: { path: { partnerId } } })),
    createPartner: (body: Schemas['CreatePartnerRequest']) => unwrap(c.POST('/api/v1/admin/partners', { body })),
    updatePartner: (partnerId: string, body: Schemas['PartnerProfileRequest']) =>
      unwrap(c.PUT('/api/v1/admin/partners/{partnerId}', { params: { path: { partnerId } }, body })),
    activatePartner: (partnerId: string) =>
      unwrap(c.POST('/api/v1/admin/partners/{partnerId}/activate', { params: { path: { partnerId } } })),
    deactivatePartner: (partnerId: string) =>
      unwrap(c.POST('/api/v1/admin/partners/{partnerId}/deactivate', { params: { path: { partnerId } } })),
    linkBankAccount: (partnerId: string, body: Schemas['BankAccountRequest']) =>
      unwrap(c.PUT('/api/v1/admin/partners/{partnerId}/bank-account', { params: { path: { partnerId } }, body })),
    kycUploadUrl: (partnerId: string, body: Schemas['UploadUrlRequest']) =>
      unwrap(c.POST('/api/v1/admin/partners/{partnerId}/kyc/upload-url', { params: { path: { partnerId } }, body })),
    kycDocuments: (partnerId: string) =>
      unwrap(c.GET('/api/v1/admin/partners/{partnerId}/kyc/documents', { params: { path: { partnerId } } })),
    addKycDocument: (partnerId: string, body: Schemas['KycDocumentRequest']) =>
      unwrap(c.POST('/api/v1/admin/partners/{partnerId}/kyc/documents', { params: { path: { partnerId } }, body })),
    reviewKycDocument: (partnerId: string, documentId: string, verified: boolean) =>
      unwrap(
        c.POST('/api/v1/admin/partners/{partnerId}/kyc/documents/{documentId}/review', {
          params: { path: { partnerId, documentId }, query: { verified } },
        }),
      ),
    kycDecision: (partnerId: string, body: Schemas['KycDecisionRequest']) =>
      unwrap(c.POST('/api/v1/admin/partners/{partnerId}/kyc/decision', { params: { path: { partnerId } }, body })),
    shifts: (partnerId: string, from: string, to: string) =>
      unwrap(c.GET('/api/v1/admin/partners/{partnerId}/shifts', { params: { path: { partnerId }, query: { from, to } } })),
    scheduleShift: (partnerId: string, body: Schemas['ShiftRequest']) =>
      unwrap(c.POST('/api/v1/admin/partners/{partnerId}/shifts', { params: { path: { partnerId } }, body })),
    cancelShift: (partnerId: string, date: string) =>
      unwrap(c.DELETE('/api/v1/admin/partners/{partnerId}/shifts/{date}', { params: { path: { partnerId, date } } })),
    adjustEarnings: (partnerId: string, body: Schemas['AdjustmentRequest']) =>
      unwrap(
        c.POST('/api/v1/admin/partners/{partnerId}/earnings/adjustments', { params: { path: { partnerId } }, body }),
      ),

    livePartners: () => unwrap(c.GET('/api/v1/admin/tracking/live')),
    nearbyPartners: (lat: number, lng: number, radiusM = 3000) =>
      unwrap(c.GET('/api/v1/admin/tracking/nearby', { params: { query: { lat, lng, radiusM } } })),

    issues: (openOnly = true, page = 0) =>
      unwrap(c.GET('/api/v1/admin/issues', { params: { query: { openOnly, page, size: 25 } } })),
    acknowledgeIssue: (issueId: string) =>
      unwrap(c.POST('/api/v1/admin/issues/{issueId}/acknowledge', { params: { path: { issueId } } })),
    resolveIssue: (issueId: string, note: string) =>
      unwrap(c.POST('/api/v1/admin/issues/{issueId}/resolve', { params: { path: { issueId } }, body: { note } })),

    plans: () => unwrap(c.GET('/api/v1/admin/plans')),
    createPlan: (body: Schemas['PlanRequest']) => unwrap(c.POST('/api/v1/admin/plans', { body })),
    updatePlan: (planId: string, body: Schemas['PlanUpdateRequest']) =>
      unwrap(c.PUT('/api/v1/admin/plans/{planId}', { params: { path: { planId } }, body })),
    subscriptions: (status?: string, page = 0) =>
      unwrap(c.GET('/api/v1/admin/subscriptions', { params: { query: { status, page, size: 25 } as never } })),
    cancelSubscription: (subscriptionId: string, reason: string) =>
      unwrap(
        c.POST('/api/v1/admin/subscriptions/{subscriptionId}/cancel', {
          params: { path: { subscriptionId } },
          body: { reason },
        }),
      ),

    broadcasts: () => unwrap(c.GET('/api/v1/admin/broadcasts')),
    broadcast: (body: Schemas['BroadcastRequest']) => unwrap(c.POST('/api/v1/admin/broadcasts', { body })),

    settings: () => unwrap(c.GET('/api/v1/admin/settings')),
    updateSetting: (key: string, value: unknown, version: number) =>
      unwrap(
        c.PUT('/api/v1/admin/settings/{key}', {
          params: { path: { key } },
          body: { value, version } as Schemas['UpdateSettingRequest'],
        }),
      ),

    payouts: (status?: string, page = 0) =>
      unwrap(c.GET('/api/v1/admin/payouts', { params: { query: { status, page, size: 25 } as never } })),
    runPayouts: (periodEnd: string) =>
      unwrap(c.POST('/api/v1/admin/payouts/run', { params: { query: { periodEnd } } })),

    onTimeReport: (from: string, to: string, schoolId?: string) =>
      unwrap(c.GET('/api/v1/admin/reports/on-time', { params: { query: { from, to, schoolId } } })),
    partnerPerformance: (from: string, to: string) =>
      unwrap(c.GET('/api/v1/admin/reports/partner-performance', { params: { query: { from, to } } })),
    failures: (from: string, to: string) =>
      unwrap(c.GET('/api/v1/admin/reports/failures', { params: { query: { from, to } } })),

    auditLogs: (query: { entityType?: string; entityId?: string; action?: string; from?: string; to?: string; page?: number }) =>
      unwrap(c.GET('/api/v1/admin/audit-logs', { params: { query } })),

    /** CSV endpoints stream files, so they bypass the JSON client. */
    downloadCsv: async (path: string, query: Record<string, string | undefined>): Promise<Blob> => {
      const qs = new URLSearchParams(
        Object.entries(query).filter((e): e is [string, string] => e[1] !== undefined && e[1] !== ''),
      ).toString();
      const res = await raw('GET', `${path}${qs ? `?${qs}` : ''}`);
      return res.blob();
    },
  };
}

export type LunchBoxApi = ReturnType<typeof createLunchBoxApi>;
