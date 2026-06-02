import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const failRate = new Rate('rpc_failures');
const rateLimited = new Rate('rate_limited');

export const options = {
  vus: 1,
  duration: '75s',
  thresholds: {
    rpc_failures: ['rate<0.1'],
    http_req_duration: ['p(95)<3000'],
  },
};

const USER = '00000000-0000-0000-0000-00000000a001';
const TOKEN = 'loadtest01-token';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxc21wZGV0aXFzcWZuaWRla2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjUyOTMsImV4cCI6MjA5NTY0MTI5M30.e429MImfeQcj3_DMbxkYHKD_5GS0ZwYD8QyZTaD0Lv0';
const URL = 'https://dqsmpdetiqsqfnidekik.supabase.co/rest/v1/rpc/place_bet';

let counter = 0;

export default function () {
  counter++;
  const c = `${__VU}-${counter}-${Date.now()}`;
  const sc = 'RATE-' + c;
  const body = '{"p_user_id":"' + USER + '","p_session_code":"' + sc + '","p_selections":[{"bet_code":"BIG","selection":"BIG","stake":1,"potential_payout":2}]}';

  const res = http.post(URL, body, {
    headers: {
      'Content-Type': 'application/json',
      'apikey': KEY,
      'Authorization': 'Bearer ' + KEY,
      'x-user-token': TOKEN,
    },
  });

  const isRateLimited = res.status !== 200;
  const isSuccess = res.status === 200;

  failRate.add(!isSuccess);
  rateLimited.add(isRateLimited);
  check(res, {
    'status 200': isSuccess,
    'not rate limited': !isRateLimited,
  });

  sleep(1.5);
}
