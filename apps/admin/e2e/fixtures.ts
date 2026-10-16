import { test as base, type Page, type Route } from '@playwright/test';

const API = 'http://api.lunchbox.test';

function b64url(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** Unsigned JWT: the Firebase JS SDK decodes (does not verify) ID tokens client-side. */
export function fakeIdToken(email: string): string {
  const now = Math.floor(Date.now() / 1000);
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({
    iss: 'https://securetoken.google.com/demo-lunchbox',
    aud: 'demo-lunchbox',
    auth_time: now,
    user_id: 'admin-uid',
    sub: 'admin-uid',
    iat: now,
    exp: now + 3600,
    email,
    email_verified: true,
    firebase: { identities: { email: [email] }, sign_in_provider: 'password', sign_in_second_factor: 'totp' },
  })}.`;
}

export interface MockApi {
  calls: { method: string; path: string; body: unknown }[];
  on: (method: string, path: RegExp, handler: (route: Route, body: unknown) => Promise<void> | void) => void;
}

async function mockFirebase(page: Page, email: string) {
  const token = fakeIdToken(email);
  await page.route('**/identitytoolkit.googleapis.com/**', async (route) => {
    const url = route.request().url();
    if (url.includes('accounts:signInWithPassword')) {
      const body = route.request().postDataJSON() as { password: string };
      if (body.password !== 'correct-horse') {
        await route.fulfill({ status: 400, json: { error: { code: 400, message: 'INVALID_LOGIN_CREDENTIALS' } } });
        return;
      }
      await route.fulfill({ json: { idToken: token, refreshToken: 'refresh', expiresIn: '3600', localId: 'admin-uid', email, registered: true } });
      return;
    }
    if (url.includes('accounts:lookup')) {
      await route.fulfill({ json: { users: [{ localId: 'admin-uid', email, emailVerified: true, providerUserInfo: [], mfaInfo: [{ mfaEnrollmentId: 'm1', totpInfo: {} }] }] } });
      return;
    }
    await route.fulfill({ json: {} });
  });
  await page.route('**/securetoken.googleapis.com/**', (route) =>
    route.fulfill({ json: { id_token: token, refresh_token: 'refresh', expires_in: '3600', user_id: 'admin-uid' } }));
}

export const test = base.extend<{ api: MockApi; signIn: () => Promise<void> }>({
  api: async ({ page }, use) => {
    const handlers: { method: string; path: RegExp; handler: (route: Route, body: unknown) => Promise<void> | void }[] = [];
    const calls: MockApi['calls'] = [];
    await page.route(`${API}/**`, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const body = req.postData() ? req.postDataJSON() : null;
      calls.push({ method: req.method(), path: url.pathname + url.search, body });
      const h = handlers.find((x) => x.method === req.method() && x.path.test(url.pathname + url.search));
      if (h) {
        await h.handler(route, body);
      } else {
        await route.fulfill({ status: 404, json: { code: 'not_found', detail: `No mock for ${req.method()} ${url.pathname}` } });
      }
    });
    await use({ calls, on: (method, path, handler) => handlers.unshift({ method, path, handler }) });
  },
  signIn: async ({ page, api }, use) => {
    api.on('GET', /\/api\/v1\/auth\/me$/, (r) => r.fulfill({ json: {
      registered: true, userId: 'u1', role: 'OPS_ADMIN', status: 'ACTIVE', displayName: 'Ops', phone: null,
      email: 'ops@lunchbox.test', schoolId: null, preferredLanguage: 'en', parent: null, consents: [],
    } }));
    await use(async () => {
      await mockFirebase(page, 'ops@lunchbox.test');
      await page.goto('/login/');
      await page.getByLabel('Email').fill('ops@lunchbox.test');
      await page.getByLabel('Password').fill('correct-horse');
      await page.getByRole('button', { name: 'Sign in' }).click();
    });
  },
});

export { expect } from '@playwright/test';

export const sampleOrder = {
  id: '01929b6a-0000-7000-8000-000000000001',
  scheduledDate: new Date().toISOString().slice(0, 10),
  status: 'SCHEDULED',
  childId: 'c1',
  childName: 'Meera Rao',
  className: '4',
  parentId: 'p1',
  schoolId: 's1',
  schoolName: 'Delhi Public School',
  partnerId: null,
  addressId: 'a1',
  pickupLocation: { lat: 12.97, lng: 77.59 },
  pickupWindowStart: '2026-10-19T04:30:00Z',
  pickupWindowEnd: '2026-10-19T05:15:00Z',
  deliveryDeadline: '2026-10-19T06:45:00Z',
  pickedUpAt: null,
  deliveredAt: null,
  cancelReason: null,
  failureReason: null,
  version: 0,
};

export function page1<T>(items: T[]) {
  return { items, page: 0, size: 50, totalElements: items.length, totalPages: items.length ? 1 : 0 };
}

export { mockFirebase };
