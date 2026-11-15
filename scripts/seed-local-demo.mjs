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

const API = process.env.API_URL ?? 'http://localhost:8080';
const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? 'localhost:9099'}`;
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? 'demo-lunchbox';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@lunchbox.test';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'LunchBox-local-123';
const PARENT_PHONE = '+919876543210';
const PARTNER_PHONE = '+919876500001';

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

async function adminToken() {
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
  const res = await fetch(`${AUTH}/securetoken.googleapis.com/v1/token?key=demo-key`, {
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
  const parentAuth = await phoneToken(PARENT_PHONE);
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
  if (partner.kycStatus !== 'APPROVED') {
    // Approval needs verified Aadhaar, licence and photo. Upload a 1×1 PNG for each to the LocalStack bucket through
    // the same pre-signed flow the admin uses, record it, and mark it verified. Numbers are obviously fake test values.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const docs = [['AADHAAR', '999999990019'], ['DRIVING_LICENSE', 'KA0320260000001'], ['PHOTO', '']];
    const have = (await call('GET', `/api/v1/admin/partners/${partnerId}/kyc/documents`, admin)).body;
    for (const [docType, documentNumber] of docs) {
      let doc = have.find((d) => d.docType === docType);
      if (!doc) {
        const upload = (await call('POST', `/api/v1/admin/partners/${partnerId}/kyc/upload-url`, admin,
          { docType, contentType: 'image/png' })).body;
        const put = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: png });
        if (!put.ok) throw new Error(`KYC upload to ${new URL(upload.url).host} failed: ${put.status}`);
        doc = (await call('POST', `/api/v1/admin/partners/${partnerId}/kyc/documents`, admin,
          { docType, s3Key: upload.key, ...(documentNumber ? { documentNumber } : {}) })).body;
      }
      if (doc.status !== 'VERIFIED') {
        await call('POST', `/api/v1/admin/partners/${partnerId}/kyc/documents/${doc.id}/review?verified=true`, admin);
      }
    }
    await call('POST', `/api/v1/admin/partners/${partnerId}/kyc/decision`, admin, { approved: true, notes: 'Local demo' });
    console.log('Approved rider KYC.');
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
