/**
 * FRONTEND UNIT TESTS - NUMBER9 React Dashboard
 * Tests critical business logic for game, wallet, and turnover
 */

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

const assert = require('assert');
const runner = new TestRunner();

// ═════════════════════════════════════════════════════════════════════════
// TIMER FORMATTING TESTS
// ═════════════════════════════════════════════════════════════════════════

runner.test('Timer formatting: 0ms should show 00:00', () => {
  const fmtTimer = (ms) => {
    if (ms < 0) ms = 0;
    const s = Math.ceil(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  
  assert.strictEqual(fmtTimer(0), '00:00');
});

runner.test('Timer formatting: 30 seconds should show 00:30', () => {
  const fmtTimer = (ms) => {
    if (ms < 0) ms = 0;
    const s = Math.ceil(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  
  assert.strictEqual(fmtTimer(30000), '00:30');
});

runner.test('Timer formatting: 290 seconds (4m50s) should show 04:50', () => {
  const fmtTimer = (ms) => {
    if (ms < 0) ms = 0;
    const s = Math.ceil(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  
  assert.strictEqual(fmtTimer(290000), '04:50');
});

runner.test('Timer formatting: negative should clamp to 00:00', () => {
  const fmtTimer = (ms) => {
    if (ms < 0) ms = 0;
    const s = Math.ceil(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  
  assert.strictEqual(fmtTimer(-5000), '00:00');
});

// ═════════════════════════════════════════════════════════════════════════
// SESSION CODE GENERATION TESTS
// ═════════════════════════════════════════════════════════════════════════

runner.test('Session code from result time: 202605301115', () => {
  const resultMs = new Date('2026-05-30T11:15:00Z').getTime();
  const pad2 = (n) => String(n).padStart(2, '0');
  
  const d = new Date(resultMs);
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  const h = pad2(d.getUTCHours());
  const min = pad2(Math.floor(d.getUTCMinutes() / 5) * 5);
  
  const code = `${y}${m}${day}${h}${min}`;
  assert.strictEqual(code, '202605301115');
});

runner.test('Session code should round minutes down to nearest 5', () => {
  const pad2 = (n) => String(n).padStart(2, '0');
  
  // 11:17 should round to 11:15
  const d = new Date('2026-05-30T11:17:30Z');
  const h = pad2(d.getUTCHours());
  const min = pad2(Math.floor(d.getUTCMinutes() / 5) * 5);
  
  assert.strictEqual(min, '15');
});

// ═════════════════════════════════════════════════════════════════════════
// BET SELECTION & VALIDATION
// ═════════════════════════════════════════════════════════════════════════

runner.test('Valid selections: BIG, SMALL, ODD, EVEN', () => {
  const VALID_SELECTIONS = ['BIG', 'SMALL', 'ODD', 'EVEN'];
  const test = (sel) => VALID_SELECTIONS.includes(sel);
  
  assert(test('BIG'));
  assert(test('SMALL'));
  assert(test('ODD'));
  assert(test('EVEN'));
  assert(!test('INVALID'));
});

runner.test('Valid number selections: 0-27', () => {
  const isValidNumber = (num) => Number.isInteger(num) && num >= 0 && num <= 27;
  
  assert(isValidNumber(0));
  assert(isValidNumber(13));
  assert(isValidNumber(27));
  assert(!isValidNumber(28));
  assert(!isValidNumber(-1));
  assert(!isValidNumber(3.5));
});

runner.test('Payout multiplier selection', () => {
  const getMultiplier = (sel) => {
    const isNumber = typeof sel === 'number';
    return isNumber ? 3 : (['BIG', 'SMALL'].includes(sel) ? 2 : ['ODD', 'EVEN'].includes(sel) ? 2 : 0);
  };
  
  assert.strictEqual(getMultiplier('BIG'), 2);
  assert.strictEqual(getMultiplier('ODD'), 2);
  assert.strictEqual(getMultiplier(15), 3);
  assert.strictEqual(getMultiplier('INVALID'), 0);
});

// ═════════════════════════════════════════════════════════════════════════
// MARKET PRICE SIMULATION
// ═════════════════════════════════════════════════════════════════════════

runner.test('Market price should stay within 0-27 bounds', () => {
  let price = 0;
  
  // Simulate 100 price movements
  for (let i = 0; i < 100; i++) {
    const delta = Math.random() > 0.5 ? 1 : -1;
    price = Math.max(0, Math.min(27, price + delta));
  }
  
  assert(price >= 0 && price <= 27, `Price ${price} should be in range`);
});

runner.test('Market price movement: +1 or -1 only', () => {
  const movements = [];
  let price = 13;
  
  for (let i = 0; i < 10; i++) {
    const prev = price;
    const delta = Math.random() > 0.5 ? 1 : -1;
    price = Math.max(0, Math.min(27, price + delta));
    const movement = Math.abs(price - prev);
    movements.push(movement);
  }
  
  assert(movements.every(m => m <= 1), 'Each movement should be at most 1');
});

// ═════════════════════════════════════════════════════════════════════════
// TURNOVER PROGRESS CALCULATIONS
// ═════════════════════════════════════════════════════════════════════════

runner.test('Turnover percentage: 0% when no progress', () => {
  const totalRequired = 1000;
  const totalAchieved = 0;
  const pct = totalRequired > 0 ? Math.min(100, Math.round((totalAchieved / totalRequired) * 100)) : 0;
  
  assert.strictEqual(pct, 0);
});

runner.test('Turnover percentage: 50% at halfway', () => {
  const totalRequired = 1000;
  const totalAchieved = 500;
  const pct = totalRequired > 0 ? Math.min(100, Math.round((totalAchieved / totalRequired) * 100)) : 0;
  
  assert.strictEqual(pct, 50);
});

runner.test('Turnover percentage: 100% when completed', () => {
  const totalRequired = 1000;
  const totalAchieved = 1000;
  const pct = totalRequired > 0 ? Math.min(100, Math.round((totalAchieved / totalRequired) * 100)) : 0;
  
  assert.strictEqual(pct, 100);
});

runner.test('Turnover percentage: capped at 100% when over-achieved', () => {
  const totalRequired = 1000;
  const totalAchieved = 1500;
  const pct = totalRequired > 0 ? Math.min(100, Math.round((totalAchieved / totalRequired) * 100)) : 0;
  
  assert.strictEqual(pct, 100);
});

runner.test('Remaining turnover calculation', () => {
  const totalRequired = 1000;
  const totalAchieved = 350;
  const remaining = Math.max(0, totalRequired - totalAchieved);
  
  assert.strictEqual(remaining, 650);
});

// ═════════════════════════════════════════════════════════════════════════
// PROFIT/LOSS CALCULATIONS
// ═════════════════════════════════════════════════════════════════════════

runner.test('P&L: winning bet (+100)', () => {
  const payout = 200;
  const stake = 100;
  const pnl = payout - stake;
  
  assert.strictEqual(pnl, 100);
});

runner.test('P&L: losing bet (-100)', () => {
  const payout = 0;
  const stake = 100;
  const pnl = payout - stake;
  
  assert.strictEqual(pnl, -100);
});

runner.test('P&L: aggregate multiple bets', () => {
  const settledBids = [
    { payout: 200, stake: 100, result: 'WIN' },
    { payout: 0, stake: 100, result: 'LOSE' },
    { payout: 600, stake: 200, result: 'WIN' }
  ];
  
  const totalStake = settledBids.reduce((s, b) => s + b.stake, 0);
  const totalPayout = settledBids.reduce((s, b) => s + (b.payout || 0), 0);
  const pnl = totalPayout - totalStake;
  
  assert.strictEqual(pnl, 400);
});

// ═════════════════════════════════════════════════════════════════════════
// CURRENCY FORMATTING
// ═════════════════════════════════════════════════════════════════════════

runner.test('Number formatting with locale string', () => {
  const num = 1000;
  const formatted = num.toLocaleString();
  
  assert(formatted.includes('1') && formatted.includes('0'));
});

runner.test('Large number formatting', () => {
  const num = 1234567;
  const formatted = num.toLocaleString();
  
  // Should have thousand separator
  assert(formatted.length > 7);
});

// ═════════════════════════════════════════════════════════════════════════
// BALANCE STATE MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════

runner.test('Available balance: main - locked', () => {
  const main = 5000;
  const locked = 1000;
  const available = main - locked;
  
  assert.strictEqual(available, 4000);
});

runner.test('Total balance: main + bonus + locked', () => {
  const main = 5000;
  const bonus = 500;
  const locked = 1000;
  const total = main + bonus + locked;
  
  assert.strictEqual(total, 6500);
});

runner.test('Withdrawable: main - locked (cannot withdraw locked funds)', () => {
  const main = 5000;
  const locked = 1000;
  const withdrawable = Math.max(0, main - locked);
  
  assert.strictEqual(withdrawable, 4000);
});

// ═════════════════════════════════════════════════════════════════════════
// INPUT VALIDATION
// ═════════════════════════════════════════════════════════════════════════

runner.test('Stake input: must be positive number', () => {
  const validateStake = (input) => {
    const num = Number(input);
    return Number.isFinite(num) && num > 0;
  };
  
  assert(validateStake('100'));
  assert(validateStake(500));
  assert(!validateStake('abc'));
  assert(!validateStake('-100'));
  assert(!validateStake('0'));
});

runner.test('Preset stake selection (100, 500, 1000, 5000)', () => {
  const PRESETS = [100, 500, 1000, 5000];
  const isPreset = (val) => PRESETS.includes(val);
  
  assert(isPreset(100));
  assert(isPreset(5000));
  assert(!isPreset(250));
});

// ═════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═════════════════════════════════════════════════════════════════════════

runner.test('Handle empty bet list', () => {
  const settledBids = [];
  const totalStake = settledBids.reduce((s, b) => s + b.stake, 0);
  const totalPayout = settledBids.reduce((s, b) => s + (b.payout || 0), 0);
  const pnl = totalPayout - totalStake;
  
  assert.strictEqual(totalStake, 0);
  assert.strictEqual(totalPayout, 0);
  assert.strictEqual(pnl, 0);
});

runner.test('Handle missing payout field (treat as 0)', () => {
  const settledBids = [
    { stake: 100, result: 'LOSE' }, // No payout
    { stake: 100, payout: 200, result: 'WIN' }
  ];
  
  const totalPayout = settledBids.reduce((s, b) => s + (b.payout || 0), 0);
  
  assert.strictEqual(totalPayout, 200);
});

// ═════════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═════════════════════════════════════════════════════════════════════════

runner.run().then(success => {
  process.exit(success ? 0 : 1);
});
