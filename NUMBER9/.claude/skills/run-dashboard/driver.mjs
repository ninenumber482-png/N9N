#!/usr/bin/env node
/**
 * NUMBER9 Dashboard Driver
 * Launches dev server and tests with Puppeteer
 */

import puppeteer from 'puppeteer';
import { execSync, spawn } from 'child_process';
import fs from 'fs';

const BASE_URL = 'http://localhost:5175';
const SCREENSHOT_DIR = '/tmp';
const TIMEOUT = 30000;

async function main() {
  let browser;
  let server;

  try {
    // Kill existing vite processes
    try {
      execSync('pkill -f "vite"');
      await sleep(1000);
    } catch {
      // No processes to kill
    }

    console.log('🚀 Starting dev server...');
    server = spawn('npm', ['run', 'dev:user'], {
      stdio: 'ignore',
      detached: true,
    });

    // Wait for server to be ready
    await waitForServer(BASE_URL, 10000);
    console.log('✅ Dev server ready');

    // Launch Puppeteer
    console.log('🌐 Launching Chromium...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(TIMEOUT);
    page.setDefaultNavigationTimeout(TIMEOUT);

    // Test Landing page
    console.log('📍 Testing landing page...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/dashboard-landing.png`,
      fullPage: true,
    });
    const landingTitle = await page.title();
    console.log(`✅ Landing page | Title: "${landingTitle}"`);

    // Test Login page
    console.log('📍 Testing login page...');
    await page.goto(`${BASE_URL}/#/login`, { waitUntil: 'networkidle0' });
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/dashboard-login.png`,
      fullPage: true,
    });
    const loginTitle = await page.title();
    console.log(`✅ Login page | Title: "${loginTitle}"`);

    // Verify UI elements
    console.log('📍 Checking UI elements...');
    const hasLoginForm = await page.$('input[type="text"], input[type="password"]');
    if (hasLoginForm) {
      console.log('✅ Login form detected');
    } else {
      console.log('⚠️  Login form not found');
    }

    console.log('\n📸 Screenshots saved to:');
    console.log(`  - ${SCREENSHOT_DIR}/dashboard-landing.png`);
    console.log(`  - ${SCREENSHOT_DIR}/dashboard-login.png`);

    await browser.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (browser) await browser.close();
    process.exit(1);
  } finally {
    // Cleanup
    if (server) {
      try {
        execSync('pkill -P ' + server.pid);
      } catch {
        // Process already terminated
      }
    }
  }
}

async function waitForServer(url, maxWait) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      execSync(`curl -s ${url} > /dev/null`, { stdio: 'ignore' });
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`Server did not respond within ${maxWait}ms`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
