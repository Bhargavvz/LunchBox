#!/usr/bin/env node
// Seeds a local stack (docker compose + `pnpm dev:backend`) with one school, one family and one rider, plus today's
// lunchboxes, so every screen of the parent and partner apps has something real to show.
//
//   node scripts/seed-local-demo.mjs
//
// Local only: it signs in through the Firebase Auth emulator and refuses to run against any other API host.
// Run scripts/seed-emulator-admin.ps1 first (and start the backend with BOOTSTRAP_SUPER_ADMIN_EMAIL once).
// Test sign-ins it creates (no SMS is sent; read codes with `docker compose logs firebase`):
//   parent  +91 98765 43210
//   partner +91 98765 00001
//
// Real Firebase project (backend started with `dev-backend.ps1 -Auth firebase`):
//   node scripts/seed-local-demo.mjs --firebase
// Signs in as the admin in backend/config/local-test-admin.env, uses the parent who already signed up in the app with
// PARENT_PHONE (default: the console test number +91 99123 95116) through a custom token minted with
// GOOGLE_APPLICATION_CREDENTIALS, and creates the rider for RIDER_PHONE (default +91 99123 95117). The rider signs in
// and starts the shift in the partner app.

import nodeCrypto from 'node:crypto';
import fs from 'node:fs';

const API = process.env.API_URL ?? 'http://localhost:8080';
const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? 'localhost:9099'}`;
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? 'demo-lunchbox';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@lunchbox.test';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'LunchBox-local-123';
const REAL = process.argv.includes('--firebase');
const PARENT_PHONE = REAL ? (process.env.PARENT_PHONE ?? '+919912395116') : '+919876543210';
const PARTNER_PHONE = REAL ? (process.env.RIDER_PHONE ?? '+919912395117') : '+919876500001';

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) {
  console.error(`Refusing to seed ${API}: this script is for a local stack only.`);
  process.exit(1);
}

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

async function call(method, path, token, body, { allow = [] } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok && !allow.includes(res.status)) {
    throw new Error(`${method} ${path} → ${res.status}: ${json?.detail ?? json?.title ?? text}`);
  }
  return { status: res.status, body: json };
}

async function emulator(path, body) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/${path}?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`emulator ${path}: ${JSON.stringify(json.error ?? json)}`);
  return json;
}

// ---- Real Firebase (--firebase) ----

function readEnvFile(path) {
  if (!fs.existsSync(path)) return {};
  return Object.fromEntries(
    fs.readFileSync(path, 'utf8').split('\n').map((l) => l.trim()).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
}
const webKey = () => readEnvFile('apps/admin/.env.local').NEXT_PUBLIC_FIREBASE_API_KEY;

async function identity(path, body) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/${path}?key=${webKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`firebase ${path}: ${json.error?.message ?? res.status}`);
  return json;
}

/** Service-account access token (the backend's key) for the Identity Toolkit admin API. */
async function serviceAccount() {
  const key = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const sign = (claims) => {
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}`;
    return `${unsigned}.${nodeCrypto.sign('RSA-SHA256', Buffer.from(unsigned), key.private_key).toString('base64url')}`;
  };
  const assertion = sign({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform', aud: key.token_uri, iat: now, exp: now + 600 });
  const access = (await (await fetch(key.token_uri, { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) })).json()).access_token;
  return { key, sign, access, now };
}

/** ID token for an existing phone user, without an SMS: look the user up and sign in with a custom token. */
async function realPhoneToken(phoneNumber) {
  const sa = await serviceAccount();
  const lookup = await (await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${sa.key.project_id}/accounts:lookup`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sa.access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: [phoneNumber] }),
  })).json();
  const uid = lookup.users?.[0]?.localId;
  if (!uid) throw new Error(`No Firebase user with ${phoneNumber} yet: sign in once in the app first.`);
  const token = sa.sign({
    iss: sa.key.client_email, sub: sa.key.client_email, uid, iat: sa.now, exp: sa.now + 3600,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
  });
  const { idToken, refreshToken } = await identity('accounts:signInWithCustomToken', { token, returnSecureToken: true });
  return { idToken, refreshToken };
}

async function adminToken() {
  if (REAL) {
    const env = readEnvFile('backend/config/local-test-admin.env');
    return (await identity('accounts:signInWithPassword', { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD, returnSecureToken: true })).idToken;
  }
  return (await emulator('accounts:signInWithPassword', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, returnSecureToken: true })).idToken;
}

/** Phone sign-in against the emulator: request a code, read it back from the emulator, confirm it. */
async function phoneToken(phoneNumber) {
  const { sessionInfo } = await emulator('accounts:sendVerificationCode', { phoneNumber, recaptchaToken: 'emulator' });
  const codes = await (await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/verificationCodes`)).json();
  const code = codes.verificationCodes.filter((c) => c.sessionInfo === sessionInfo).pop()?.code;
  const { idToken, refreshToken } = await emulator('accounts:signInWithPhoneNumber', { sessionInfo, code });
  return { idToken, refreshToken };
}

/** Re-issues an ID token so new role claims set by the backend are included. */
async function refresh(refreshToken) {
  const host = REAL ? 'https://securetoken.googleapis.com' : `${AUTH}/securetoken.googleapis.com`;
  const res = await fetch(`${host}/v1/token?key=${REAL ? webKey() : 'demo-key'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${refreshToken}`,
  });
  return (await res.json()).id_token;
}

const HOME = { lat: 12.9784, lng: 77.6408 };
const SCHOOL = { lat: 12.9719, lng: 77.6412 };

async function main() {
  const admin = await adminToken();
  console.log('Signed in as the local admin.');
  if (process.argv.includes('--assign')) {
    const assigned = await call('POST', `/api/v1/admin/jobs/auto-assign?date=${today}`, admin, undefined, { allow: [409, 422] });
    console.log(`Auto-assign: ${assigned.status} ${JSON.stringify(assigned.body)}`);
    return;
  }

  const areas = (await call('GET', '/api/v1/admin/service-areas', admin)).body;
  if (!areas.some((a) => a.name === 'Indiranagar')) {
    await call('POST', '/api/v1/admin/service-areas', admin, {
      name: 'Indiranagar', city: 'Bengaluru', active: true,
      boundary: [{ lat: 12.95, lng: 77.62 }, { lat: 12.95, lng: 77.66 }, { lat: 13.0, lng: 77.66 }, { lat: 13.0, lng: 77.62 }],
    });
    console.log('Created service area Indiranagar.');
  }

  let school = (await call('GET', '/api/v1/admin/schools?q=Greenwood', admin)).body.items?.[0];
  if (!school) {
    school = (await call('POST', '/api/v1/admin/schools', admin, {
      name: 'Greenwood Public School', code: 'GWPS-BLR', addressLine: '12th Main Road, HAL 2nd Stage', city: 'Bengaluru',
      pincode: '560038', location: SCHOOL, geofenceRadiusM: 150, lunchTime: '12:30', deliveryWindowStart: '11:30',
      deliveryWindowEnd: '12:15', handoverInstructions: 'Reception desk at Gate 2. Ask for the lunch register.',
      workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'], active: true,
    })).body;
    console.log('Created Greenwood Public School.');
  }

  // A plan to subscribe to. Prices are placeholders for local testing until the real ones are decided.
  const plans = (await call('GET', '/api/v1/admin/plans', admin)).body;
  if (!plans.some((p) => p.code === 'WEEKDAY_MONTHLY')) {
    await call('POST', '/api/v1/admin/plans', admin, {
      code: 'WEEKDAY_MONTHLY', name: 'Weekday lunch', description: 'Pickup on school days, paid monthly. Test price.',
      billingPeriod: 'MONTHLY', maxDaysPerWeek: 6, pricePaise: 150000,
    });
    console.log('Created plan Weekday lunch (monthly).');
  }

  // Parent
  const parentAuth = REAL ? await realPhoneToken(PARENT_PHONE) : await phoneToken(PARENT_PHONE);
  let parent = parentAuth.idToken;
  const me = (await call('GET', '/api/v1/auth/me', parent)).body;
  if (!me.registered) {
    await call('POST', '/api/v1/auth/register/parent', parent, {
      firstName: 'Meera', lastName: 'Rao', policyVersion: '2026-10', preferredLanguage: 'en',
      consents: ['ACCOUNT_AND_SERVICE', 'CHILD_DATA_PROCESSING', 'LIVE_TRACKING'].map((purpose) => ({ purpose, granted: true })),
    });
    parent = await refresh(parentAuth.refreshToken);
    console.log('Registered parent Meera.');
  }

  let children = (await call('GET', '/api/v1/children', parent)).body;
  for (const [firstName, className, section] of [['Aarav', '4', 'B'], ['Diya', 'UKG', 'A']]) {
    if (!children.some((c) => c.firstName === firstName)) {
      await call('POST', '/api/v1/children', parent, { schoolId: school.id, firstName, lastName: 'Rao', className, section });
    }
  }
  children = (await call('GET', '/api/v1/children', parent)).body;
  console.log(`Children: ${children.map((c) => `${c.firstName} (${c.boxCode})`).join(', ')}`);

  let addresses = (await call('GET', '/api/v1/addresses', parent)).body;
  if (addresses.length === 0) {
    await call('POST', '/api/v1/addresses', parent, {
      label: 'Home', line1: 'Flat 304, Lakeview Apartments', line2: '9th Cross, HAL 2nd Stage', landmark: 'Opposite the Ganesha temple',
      city: 'Bengaluru', pincode: '560038', location: HOME, instructions: 'Ring the bell once; the box is kept by the door.',
      makeDefault: true,
    });
    addresses = (await call('GET', '/api/v1/addresses', parent)).body;
  }

  const existing = (await call('GET', '/api/v1/orders/today', parent)).body;
  for (const child of children) {
    if (!existing.some((o) => o.childId === child.id)) {
      await call('POST', '/api/v1/admin/orders', admin, { childId: child.id, addressId: addresses[0].id, date: today });
    }
  }
  console.log(`Today's lunchboxes (${today}) are scheduled.`);

  // Partner
  const partners = (await call('GET', `/api/v1/admin/partners?q=${encodeURIComponent('Ravi')}`, admin)).body.items ?? [];
  let partner = partners[0];
  if (!partner) {
    partner = (await call('POST', '/api/v1/admin/partners', admin, {
      phone: PARTNER_PHONE,
      profile: { firstName: 'Ravi', lastName: 'Kumar', vehicleType: 'EV_SCOOTER', vehicleNumber: 'KA03EV4512', capacity: 8,
        homeZone: HOME, serviceRadiusM: 6000 },
    })).body;
    console.log('Created rider Ravi.');
  }
  const partnerId = partner.id ?? partner.partnerId;
  if (partner.approvalStatus !== 'APPROVED') {
    await call('POST', `/api/v1/admin/partners/${partnerId}/approval`, admin, { approved: true, notes: 'Local demo' });
    console.log('Approved rider.');
  }
  await call('POST', `/api/v1/admin/partners/${partnerId}/activate`, admin, undefined, { allow: [409, 422] });
  // The shift starts now and the rider clocks in straight away: a shift that is never started is (correctly) treated
  // as a no-show after its grace period, which sends the lunchboxes back for reassignment.
  const hhmm = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(d);
  const now = new Date();
  const end = new Date(Math.min(now.getTime() + 8 * 3600_000, new Date(`${today}T23:30:00+05:30`).getTime()));
  const shifts = (await call('GET', `/api/v1/admin/partners/${partnerId}/shifts?from=${today}&to=${today}`, admin)).body;
  if (shifts[0] && !['SCHEDULED', 'ACTIVE'].includes(shifts[0].status)) {
    await call('DELETE', `/api/v1/admin/partners/${partnerId}/shifts/${today}`, admin, undefined, { allow: [404, 409, 422] });
  }
  if (!shifts[0] || !['SCHEDULED', 'ACTIVE'].includes(shifts[0].status)) {
    await call('POST', `/api/v1/admin/partners/${partnerId}/shifts`, admin, { date: today, plannedStart: hhmm(now), plannedEnd: hhmm(end) });
  }
  if (REAL) {
    console.log(`
Done. Sign in to the partner app with ${PARTNER_PHONE}, start the shift, then run auto-assign:`);
    console.log('  node scripts/seed-local-demo.mjs --firebase --assign');
    return;
  }
  const rider = await phoneToken(PARTNER_PHONE);
  const riderMe = (await call('GET', '/api/v1/partner/me', rider.idToken)).body;
  if (riderMe.todayShift?.status === 'SCHEDULED') {
    await call('POST', '/api/v1/partner/shift/start', rider.idToken, { location: HOME });
    console.log('Rider shift started.');
  }
  const assigned = await call('POST', `/api/v1/admin/jobs/auto-assign?date=${today}`, admin, undefined, { allow: [409, 422] });
  console.log(`Auto-assign: ${assigned.status} ${JSON.stringify(assigned.body)}`);
  console.log('\nDone. Parent: +91 98765 43210 · Rider: +91 98765 00001');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
