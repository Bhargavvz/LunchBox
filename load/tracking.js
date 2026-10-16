// k6 load test for the live-tracking pipeline: N partners stream GPS fixes over STOMP while parents subscribe to
// their order topics. Target (docs/architecture.md): 10,000 concurrent tracked deliveries, end-to-end < 3 s.
//
//   k6 run -e WS_URL=wss://api.staging.lunchbox.in/ws -e TOKENS_FILE=./tokens.json load/tracking.js
//
// tokens.json: [{ "partnerToken": "...", "parentToken": "...", "orderId": "..." }, ...]. Prepare it in a staging
// environment by onboarding test partners and parents through the admin/parent APIs, generating and assigning
// orders for today, and starting each partner's route (see docs/runbooks/load-testing.md).
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend, Counter } from 'k6/metrics';
import ws from 'k6/ws';

const pairs = new SharedArray('pairs', () => JSON.parse(open(__ENV.TOKENS_FILE || './tokens.json')));
const WS_URL = __ENV.WS_URL || 'ws://localhost:8080/ws';

const endToEnd = new Trend('tracking_end_to_end_ms', true);
const received = new Counter('tracking_messages_received');

export const options = {
  scenarios: {
    partners: {
      executor: 'ramping-vus',
      exec: 'partner',
      startVUs: 0,
      stages: [
        { duration: '3m', target: Number(__ENV.PARTNERS || 2000) },
        { duration: '10m', target: Number(__ENV.PARTNERS || 2000) },
        { duration: '1m', target: 0 },
      ],
    },
    parents: {
      executor: 'ramping-vus',
      exec: 'parent',
      startVUs: 0,
      stages: [
        { duration: '3m', target: Number(__ENV.PARENTS || 10000) },
        { duration: '10m', target: Number(__ENV.PARENTS || 10000) },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    tracking_end_to_end_ms: ['p(95)<3000'],
    ws_connecting: ['p(95)<1000'],
  },
};

const NUL = '\u0000';

function frame(command, headers, body = '') {
  const h = Object.entries(headers).map(([k, v]) => `${k}:${v}`).join('\n');
  return `${command}\n${h}\n\n${body}${NUL}`;
}

function connect(socket, token) {
  socket.send(frame('CONNECT', { 'accept-version': '1.2', 'heart-beat': '10000,10000', Authorization: `Bearer ${token}` }));
}

export function partner() {
  const pair = pairs[(__VU - 1) % pairs.length];
  let lat = 12.97 + Math.random() * 0.05;
  let lng = 77.59 + Math.random() * 0.05;
  const res = ws.connect(WS_URL, {}, (socket) => {
    socket.on('open', () => connect(socket, pair.partnerToken));
    socket.on('message', (m) => {
      if (m.startsWith('CONNECTED')) {
        socket.setInterval(() => {
          lat += (Math.random() - 0.5) * 0.0004;
          lng += (Math.random() - 0.5) * 0.0004;
          const body = JSON.stringify({ lat, lng, accuracyM: 8, speedMps: 6, headingDeg: 90, recordedAt: new Date().toISOString() });
          socket.send(frame('SEND', { destination: '/app/partner.location', 'content-type': 'application/json' }, body));
        }, 5000);
      }
    });
    socket.setTimeout(() => socket.close(), 14 * 60 * 1000);
  });
  check(res, { 'partner socket opened': (r) => r && r.status === 101 });
}

export function parent() {
  const pair = pairs[(__VU - 1) % pairs.length];
  const res = ws.connect(WS_URL, {}, (socket) => {
    socket.on('open', () => connect(socket, pair.parentToken));
    socket.on('message', (m) => {
      if (m.startsWith('CONNECTED')) {
        socket.send(frame('SUBSCRIBE', { id: 'sub-0', destination: `/topic/orders.${pair.orderId}` }));
      } else if (m.startsWith('MESSAGE')) {
        const body = m.substring(m.indexOf('\n\n') + 2).replace(NUL, '');
        try {
          const msg = JSON.parse(body);
          if (msg.type === 'location' && msg.at) {
            endToEnd.add(Date.now() - Date.parse(msg.at));
          }
          received.add(1);
        } catch (_e) {
          // ignore heartbeats / malformed frames
        }
      }
    });
    socket.setTimeout(() => socket.close(), 14 * 60 * 1000);
  });
  check(res, { 'parent socket opened': (r) => r && r.status === 101 });
}
