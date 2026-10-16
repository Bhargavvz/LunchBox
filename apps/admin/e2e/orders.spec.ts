import { expect, page1, sampleOrder, test } from './fixtures';

test.describe('order management', () => {
  test.beforeEach(async ({ api }) => {
    api.on('GET', /\/api\/v1\/admin\/dashboard/, (r) => r.fulfill({ json: {
      date: '', ordersByStatus: {}, total: 0, delivered: 0, onTime: 0, onTimeRate: 0, unassigned: 0,
      activePartners: 0, scheduledPartners: 0, openIssues: 0 } }));
    api.on('GET', /\/api\/v1\/admin\/tracking\/live/, (r) => r.fulfill({ json: [] }));
    api.on('GET', /\/api\/v1\/admin\/orders\?/, (r) => r.fulfill({ json: page1([sampleOrder]) }));
    api.on('GET', /\/api\/v1\/admin\/orders\/[^/?]+$/, (r) => r.fulfill({ json: {
      order: sampleOrder, timeline: [{ status: 'SCHEDULED', occurredAt: '2026-10-18T16:00:00Z', reason: 'Generated from subscription' }] } }));
    api.on('GET', /\/api\/v1\/admin\/tracking\/nearby/, (r) => r.fulfill({ json: [] }));
    api.on('GET', /\/api\/v1\/admin\/partners\?/, (r) => r.fulfill({ json: page1([{
      id: 'pt1', userId: 'pu1', firstName: 'Ravi', lastName: null, phone: '+919800000002', vehicleType: 'SCOOTER',
      vehicleNumber: 'KA01AB1234', capacity: 8, homeZone: { lat: 12.97, lng: 77.59 }, serviceRadiusM: 5000,
      kycStatus: 'APPROVED', kycNotes: null, rating: 4.8, ratingCount: 12, active: true, payoutAccountLinked: true,
      createdAt: '2026-09-01T00:00:00Z' }]) }));
  });

  test('lists orders and filters by status', async ({ page, api, signIn }) => {
    await signIn();
    await page.goto('/orders/');
    await expect(page.getByRole('button', { name: 'Meera Rao' })).toBeVisible();
    await page.getByLabel('Status').selectOption('DELIVERED');
    await expect.poll(() => api.calls.some((c) => c.path.includes('status=DELIVERED'))).toBe(true);
  });

  test('assigns a partner to an order', async ({ page, api, signIn }) => {
    let assignedTo: string | null = null;
    api.on('POST', /\/api\/v1\/admin\/orders\/[^/]+\/assign$/, async (r, body) => {
      assignedTo = (body as { partnerId: string }).partnerId;
      await r.fulfill({ status: 204, body: '' });
    });
    await signIn();
    await page.goto('/orders/');
    await page.getByRole('button', { name: 'Meera Rao' }).click();
    await expect(page.getByRole('dialog')).toContainText('Generated from subscription');
    await page.getByLabel('Assign to partner').selectOption('pt1');
    await page.getByRole('button', { name: 'Assign' }).click();
    await expect.poll(() => assignedTo).toBe('pt1');
  });

  test('cancelling requires a reason', async ({ page, api, signIn }) => {
    let cancelled: unknown = null;
    api.on('POST', /\/api\/v1\/admin\/orders\/[^/]+\/cancel$/, async (r, body) => {
      cancelled = body;
      await r.fulfill({ json: { order: { ...sampleOrder, status: 'CANCELLED' }, timeline: [] } });
    });
    await signIn();
    await page.goto('/orders/');
    await page.getByRole('button', { name: 'Meera Rao' }).click();
    const cancel = page.getByRole('button', { name: 'Cancel order' });
    await expect(cancel).toBeDisabled();
    await page.getByLabel('Reason (required to cancel)').fill('School closed for elections');
    await cancel.click();
    await expect.poll(() => cancelled).toEqual({ reason: 'School closed for elections' });
  });
});
