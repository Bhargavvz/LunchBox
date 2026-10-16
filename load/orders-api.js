// k6 load test for the hottest REST endpoints. Target: p95 < 300 ms.
//
//   k6 run -e API_URL=https://api.staging.lunchbox.in -e TOKENS_FILE=./tokens.json load/orders-api.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const pairs = new SharedArray('pairs', () => JSON.parse(open(__ENV.TOKENS_FILE || './tokens.json')));
const API = __ENV.API_URL || 'http://localhost:8080';

export const options = {
  scenarios: {
    parents: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RPS || 500),
      timeUnit: '1s',
      duration: '10m',
      preAllocatedVUs: 200,
      maxVUs: 2000,
    },
  },
  thresholds: {
    'http_req_duration{endpoint:today}': ['p(95)<300'],
    'http_req_duration{endpoint:tracking}': ['p(95)<300'],
    'http_req_duration{endpoint:notifications}': ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const pair = pairs[Math.floor(Math.random() * pairs.length)];
  const headers = { Authorization: `Bearer ${pair.parentToken}`, 'X-Request-Id': `k6-${__VU}-${__ITER}` };

  const today = http.get(`${API}/api/v1/orders/today`, { headers, tags: { endpoint: 'today' } });
  check(today, { 'today 200': (r) => r.status === 200 });

  const tracking = http.get(`${API}/api/v1/orders/${pair.orderId}/tracking`, { headers, tags: { endpoint: 'tracking' } });
  check(tracking, { 'tracking 200': (r) => r.status === 200 });

  const notifications = http.get(`${API}/api/v1/notifications/unread-count`, { headers, tags: { endpoint: 'notifications' } });
  check(notifications, { 'unread 200': (r) => r.status === 200 });

  sleep(Math.random());
}
