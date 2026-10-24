import { expect, mockFirebase, test } from './fixtures';

test.describe('login', () => {
  test('rejects a wrong password', async ({ page, api: _api }) => {
    await mockFirebase(page, 'ops@lunchbox.test');
    await page.goto('/login/');
    await page.getByLabel('Email').fill('ops@lunchbox.test');
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('Incorrect email or password');
  });

  test('staff without a second factor are sent to authenticator enrolment', async ({ page, api }) => {
    api.on('GET', /\/api\/v1\/auth\/me$/, (r) =>
      r.fulfill({ status: 403, json: { code: 'mfa_required', detail: 'Multi-factor authentication is required for admin access.' } }));
    await mockFirebase(page, 'ops@lunchbox.test');
    await page.goto('/login/');
    await page.getByLabel('Email').fill('ops@lunchbox.test');
    await page.getByLabel('Password').fill('correct-horse');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('button', { name: 'Set up authenticator' })).toBeVisible();
  });

  test('signs in and lands on the dashboard', async ({ page, api, signIn }) => {
    api.on('GET', /\/api\/v1\/admin\/dashboard/, (r) => r.fulfill({ json: {
      date: '2026-10-19', ordersByStatus: { DELIVERED: 40, IN_TRANSIT: 5 }, total: 45, delivered: 40, onTime: 38,
      onTimeRate: 95, unassigned: 0, activePartners: 6, scheduledPartners: 7, openIssues: 1,
    } }));
    api.on('GET', /\/api\/v1\/admin\/tracking\/live/, (r) => r.fulfill({ json: [] }));
    await signIn();
    await expect(page).toHaveURL(/\/dashboard\/$/);
    await expect(page.getByText('Pickups today')).toBeVisible();
    await expect(page.getByText('95%')).toBeVisible();
    await expect(page.getByText('1 open issue')).toBeVisible();
  });
});
