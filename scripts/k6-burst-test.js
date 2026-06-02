import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

const success = new Rate('success');
const blocked = new Rate('blocked');

export const options = {
  thresholds: {
    http_req_duration: ['p(95)<2000'],
  },
};

const USER = '00000000-0000-0000-0000-00000000a001';
const TOKEN = 'loadtest01-token';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxc21wZGV0aXFzcWZuaWRla2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjUyOTMsImV4cCI6MjA5NTY0MTI5M30.e429MImfeQcj3_DMbxkYHKD_5GS0ZwYD8QyZTaD0Lv0';
const URL = 'https://dqsmpdetiqsqfnidekik.supabase.co/rest/v1/rpc/place_bet';

export default function () {
  for (let i = 0; i < 45; i++) {
    const sc = 'RT' + Math.random().toString(36).substring(2, 8).toUpperCase() + i;
    const body = '{"p_user_id":"' + USER + '","p_session_code":"' + sc + '","p_selections":[{"bet_code":"BIG","selection":"BIG","stake":1,"potential_payout":2}]}';

    const res = http.post(URL, body, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': KEY,
        'Authorization': 'Bearer ' + KEY,
        'x-user-token': TOKEN,
      },
      tags: { call: 'place_bet' },
    });

    success.add(res.status === 200);
    blocked.add(res.status !== 200);
  }
}
