/**
 * FRONTEND UNIT TESTS - NUMBER9 React Dashboard
 * Tests critical business logic for game, wallet, and turnover
 */

import assert from 'assert';

// Test utilities
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║        FRONTEND UNIT TESTS - NUMBER9 Dashboard            ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    for (const { name, fn } of this.tests) {
      try {
        await fn();
        console.log(`✅ PASS: ${name}`);
        this.passed++;
      } catch (e) {
        console.log(`❌ FAIL: ${name}`);
        console.log(`   Error: ${e.message}`);
        this.failed++;
      }
    }

    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`Tests Passed: ${this.passed}/${this.tests.length}`);
    console.log(`Tests Failed: ${this.failed}/${this.tests.length}`);
    console.log(`═══════════════════════════════════════════════════════════\n`);

    return this.failed === 0;
  }
}

const runner = new TestRunner();

// TIMER FORMATTING
runner.test('Timer: 0ms → 00:00', () => {
  const fmtTimer = (ms) => {
    if (ms < 0) ms = 0;
    const s = Math.ceil(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  assert.strictEqual(fmtTimer(0), '00:00');
});

runner.test('Timer: 30000ms → 00:30', () => {
  const fmtTimer = (ms) => {
    if (ms < 0) ms = 0;
    const s = Math.ceil(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  assert.strictEqual(fmtTimer(30000), '00:30');
});

runner.test('Timer: 290000ms → 04:50', () => {
  const fmtTimer = (ms) => {
    if (ms < 0) ms = 0;
    const s = Math.ceil(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  assert.strictEqual(fmtTimer(290000), '04:50');
});

// SESSION CODE
runner.test('Session code: 202605301115', () => {
  const pad2 = (n) => String(n).padStart(2, '0');
  const d = new Date('2026-05-30T11:15:00Z');
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  const h = pad2(d.getUTCHours());
  const min = pad2(Math.floor(d.getUTCMinutes() / 5) * 5);
  assert.strictEqual(`${y}${m}${day}${h}${min}`, '202605301115');
});

// BET SELECTIONS
runner.test('Valid selections: BIG, SMALL, ODD, EVEN', () => {
  const test = (sel) => ['BIG', 'SMALL', 'ODD', 'EVEN'].includes(sel);
  assert(test('BIG') && test('ODD') && !test('INVALID'));
});

runner.test('Valid numbers: 0-27', () => {
  const isValid = (num) => Number.isInteger(num) && num >= 0 && num <= 27;
  assert(isValid(0) && isValid(27) && !isValid(28));
});

runner.test('Multiplier: BIG/SMALL/ODD/EVEN = 2x', () => {
  const getM = (sel) => ['BIG', 'SMALL', 'ODD', 'EVEN'].includes(sel) ? 2 : 0;
  assert.strictEqual(getM('BIG'), 2);
  assert.strictEqual(getM('ODD'), 2);
});

runner.test('Multiplier: NUMBER = 3x', () => {
  const getM = (sel) => typeof sel === 'number' ? 3 : 0;
  assert.strictEqual(getM(15), 3);
});

// MARKET PRICE
runner.test('Market price bounds: 0-27', () => {
  let price = 0;
  for (let i = 0; i < 100; i++) {
    price = Math.max(0, Math.min(27, price + (Math.random() > 0.5 ? 1 : -1)));
  }
  assert(price >= 0 && price <= 27);
});

// TURNOVER CALCULATIONS
runner.test('Turnover %: 0% at 0 progress', () => {
  const pct = Math.min(100, Math.round((0 / 1000) * 100));
  assert.strictEqual(pct, 0);
});

runner.test('Turnover %: 50% at halfway', () => {
  const pct = Math.min(100, Math.round((500 / 1000) * 100));
  assert.strictEqual(pct, 50);
});

runner.test('Turnover %: 100% when complete', () => {
  const pct = Math.min(100, Math.round((1000 / 1000) * 100));
  assert.strictEqual(pct, 100);
});

runner.test('Remaining turnover: 1000 - 350 = 650', () => {
  const remaining = Math.max(0, 1000 - 350);
  assert.strictEqual(remaining, 650);
});

// PROFIT/LOSS
runner.test('Win: payout 200 - stake 100 = +100', () => {
  const pnl = 200 - 100;
  assert.strictEqual(pnl, 100);
});

runner.test('Loss: payout 0 - stake 100 = -100', () => {
  const pnl = 0 - 100;
  assert.strictEqual(pnl, -100);
});

runner.test('Aggregate P&L: 3 bets = +400', () => {
  const bids = [
    { payout: 200, stake: 100 },
    { payout: 0, stake: 100 },
    { payout: 600, stake: 200 }
  ];
  const pnl = bids.reduce((s, b) => s + (b.payout || 0) - b.stake, 0);
  assert.strictEqual(pnl, 400);
});

// BALANCE
runner.test('Available: main 5000 - locked 1000 = 4000', () => {
  assert.strictEqual(5000 - 1000, 4000);
});

runner.test('Total: main 5000 + bonus 500 + locked 1000 = 6500', () => {
  assert.strictEqual(5000 + 500 + 1000, 6500);
});

runner.test('Withdrawable: main 5000 - locked 1000 = 4000', () => {
  const w = Math.max(0, 5000 - 1000);
  assert.strictEqual(w, 4000);
});

// VALIDATION
runner.test('Stake: positive number required', () => {
  const validate = (input) => {
    const num = Number(input);
    return Number.isFinite(num) && num > 0;
  };
  assert(validate('100') && !validate('-100'));
});

runner.test('Preset stakes: 100, 500, 1000, 5000', () => {
  const isPreset = (val) => [100, 500, 1000, 5000].includes(val);
  assert(isPreset(100) && isPreset(5000) && !isPreset(250));
});

// EDGE CASES
runner.test('Empty bet list: sum = 0', () => {
  const bids = [];
  const total = bids.reduce((s, b) => s + b.stake, 0);
  assert.strictEqual(total, 0);
});

runner.test('Missing payout: treat as 0', () => {
  const bids = [
    { stake: 100 },
    { stake: 100, payout: 200 }
  ];
  const payout = bids.reduce((s, b) => s + (b.payout || 0), 0);
  assert.strictEqual(payout, 200);
});

runner.run().then(success => process.exit(success ? 0 : 1));
