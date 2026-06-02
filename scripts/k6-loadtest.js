import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const failRate = new Rate('rpc_failures');

export const options = {
  stages: [
    { duration: '10s', target: 10 },
    { duration: '20s', target: 10 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    rpc_failures: ['rate<0.1'],
    http_req_duration: ['p(95)<2000'],
  },
};

const SUPABASE_URL  = __ENV.SUPABASE_URL || 'https://dqsmpdetiqsqfnidekik.supabase.co';
const SUPABASE_KEY  = __ENV.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxc21wZGV0aXFzcWZuaWRla2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjUyOTMsImV4cCI6MjA5NTY0MTI5M30.e429MImfeQcj3_DMbxkYHKD_5GS0ZwYD8QyZTaD0Lv0';

export default function () {
  // Simulasi GET king_results (read-heavy, tanpa write)
  const url = `${SUPABASE_URL}/rest/v1/king_results?order=session_code.desc&limit=5`;

  const res = http.get(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });

  latency.add(res.timings.duration);
  failRate.add(res.status !== 200);
  check(res, { 'status 200': (r) => r.status === 200 });

  sleep(Math.random() * 0.5 + 0.1);
}
