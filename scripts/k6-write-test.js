import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '15s',
  thresholds: {
    http_req_failed: ['rate<0.5'],
    http_req_duration: ['p(95)<2000'],
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
  const body = '{"p_user_id":"' + USER + '","p_session_code":"LT-' + c + '","p_selections":[{"bet_code":"BIG","selection":"BIG","stake":1,"potential_payout":2}]}';

  const res = http.post(URL, body, {
    headers: {
      'Content-Type': 'application/json',
      'apikey': KEY,
      'Authorization': 'Bearer ' + KEY,
      'x-user-token': TOKEN,
    },
  });

  check(res, { 'status 200': (r) => r.status === 200 });

  sleep(3);
}
