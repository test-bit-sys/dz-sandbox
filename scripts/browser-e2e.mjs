import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { startSandboxRuntime } from '../packages/cli/dist/index.js';

function resolveChromiumExecutable() {
  if (process.env.DZ_CHROME_PATH && existsSync(process.env.DZ_CHROME_PATH)) {
    return process.env.DZ_CHROME_PATH;
  }

  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  const msPlaywrightDirs = [
    path.join(localAppData, 'ms-playwright'),
    path.join(os.homedir(), '.cache', 'ms-playwright'),
  ];

  for (const base of msPlaywrightDirs) {
    if (!existsSync(base)) continue;
    const entries = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse();
    for (const dir of entries) {
      const candidates = [
        path.join(base, dir, 'chrome-win64', 'chrome.exe'),
        path.join(base, dir, 'chrome-linux', 'chrome'),
        path.join(base, dir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      ];
      for (const c of candidates) {
        if (existsSync(c)) return c;
      }
    }
  }

  const systemCandidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];
  for (const c of systemCandidates) {
    if (existsSync(c)) return c;
  }

  return chromium.executablePath();
}

async function runAccessibilityAudit(page, label) {
  // If @axe-core/playwright is installed (e.g. online CI), run full axe-core first.
  try {
    const axeMod = await import('@axe-core/playwright');
    const AxeBuilder = axeMod.default ?? axeMod.AxeBuilder;
    if (AxeBuilder) {
      const results = await new AxeBuilder({ page }).analyze();
      const severe = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      assert.equal(
        severe.length,
        0,
        `${label}: axe-core found ${severe.length} critical/serious violations: ${JSON.stringify(severe.map((v) => v.id))}`,
      );
    }
  } catch (err) {
    if (!(err instanceof Error && 'code' in err && err.code === 'ERR_MODULE_NOT_FOUND')) {
      throw err;
    }
  }

  // Built-in offline Chromium WCAG 2.1 AA + ARIA + contrast audit (always runs).
  const report = await page.evaluate(() => {
    const issues = [];

    if (!document.querySelector('header')) issues.push('Missing <header> landmark');
    if (!document.querySelector('nav')) issues.push('Missing <nav> landmark');
    if (!document.querySelector('main')) issues.push('Missing <main> landmark');
    if (!document.querySelector('footer')) issues.push('Missing <footer> landmark');
    if (!document.querySelector('h1')) issues.push('Missing <h1>');

    // Interactive labels
    const controls = Array.from(document.querySelectorAll('button, input, select, textarea'));
    for (const el of controls) {
      if (el.offsetParent === null) continue;
      const ariaLabel = el.getAttribute('aria-label')?.trim() || '';
      const labelledBy = el.getAttribute('aria-labelledby')?.trim() || '';
      const wrappedLabel = el.closest('label')?.textContent?.trim() || '';
      const explicitLabel = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent?.trim() || '' : '';
      const text = el.tagName === 'BUTTON' ? el.textContent?.trim() || '' : '';
      const name = ariaLabel || labelledBy || wrappedLabel || explicitLabel || text;
      if (!name) {
        issues.push(`Unlabeled visible control: <${el.tagName.toLowerCase()} id="${el.id}">`);
      }
    }

    // Tablist / tabpanel ARIA pairing
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    for (const tab of tabs) {
      const targetId = tab.getAttribute('aria-controls');
      if (!targetId || !document.getElementById(targetId)) {
        issues.push(`Tab missing valid aria-controls: ${tab.id}`);
      }
    }

    // WCAG relative luminance contrast check on buttons & badges & body
    function parseRgb(str) {
      const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) return null;
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) };
    }
    function relLum({ r, g, b }) {
      const toLin = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
    }
    function contrast(c1, c2) {
      const l1 = relLum(c1);
      const l2 = relLum(c2);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }
    function effectiveBg(el) {
      let cur = el;
      while (cur && cur.nodeType === 1) {
        const c = parseRgb(getComputedStyle(cur).backgroundColor);
        if (c && c.a > 0.1) return c;
        cur = cur.parentElement;
      }
      return parseRgb(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    }

    const textChecks = Array.from(document.querySelectorAll('button, .btn, .badge, th, h1, h2, h3'));
    for (const el of textChecks) {
      if (el.offsetParent === null) continue;
      const fg = parseRgb(getComputedStyle(el).color);
      const bg = effectiveBg(el);
      if (fg && bg) {
        const ratio = contrast(fg, bg);
        if (ratio < 4.5) {
          issues.push(`Low contrast (${ratio.toFixed(2)}:1) on <${el.tagName.toLowerCase()} class="${el.className}"> ("${(el.textContent || '').trim().slice(0, 24)}")`);
        }
      }
    }

    return issues;
  });

  assert.deepEqual(report, [], `${label} accessibility issues: ${report.join('; ')}`);
}

async function main() {
  const receivedHooks = [];
  const hookServer = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      receivedHooks.push({
        url: req.url,
        sig: req.headers.signature,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });

  await new Promise((resolve) => hookServer.listen(0, '127.0.0.1', resolve));
  const hookAddr = hookServer.address();
  const webhookEndpoint = `http://127.0.0.1:${hookAddr.port}/chargily-hook`;

  const runtime = await startSandboxRuntime({
    controlPort: 0,
    chargilyPort: 0,
    satimPort: 0,
    yalidinePort: 0,
    watchScenarios: false,
  });

  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const externalRequests = [];
    const pageErrors = [];
    page.on('request', (req) => {
      const url = req.url();
      if (!url.startsWith('http://127.0.0.1:') && !url.startsWith('about:') && !url.startsWith('data:')) {
        externalRequests.push(url);
      }
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(runtime.urls.control, { waitUntil: 'networkidle' });

    // 1. Default Arabic RTL verification
    const htmlAttrsAr = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
    }));
    assert.deepEqual(htmlAttrsAr, { lang: 'ar', dir: 'rtl' });
    await runAccessibilityAudit(page, 'dark-ar-overview');

    // Switch to French LTR & English LTR
    await page.selectOption('#lang-select', 'fr');
    const htmlAttrsFr = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
    }));
    assert.deepEqual(htmlAttrsFr, { lang: 'fr', dir: 'ltr' });

    await page.selectOption('#lang-select', 'en');
    const htmlAttrsEn = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
    }));
    assert.deepEqual(htmlAttrsEn, { lang: 'en', dir: 'ltr' });

    // Toggle Light Theme & check WCAG contrast
    await page.click('#theme-btn');
    assert.equal(await page.getAttribute('html', 'data-theme'), 'light');
    await runAccessibilityAudit(page, 'light-en-overview');
    await page.click('#theme-btn'); // back to dark

    // 2. Make real Chargily checkout via API -> verify live Request Log updates
    const createRes = await fetch(`${runtime.urls.chargily}/checkouts`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test_sk_browser_e2e',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: 4500,
        currency: 'dzd',
        success_url: 'http://127.0.0.1:3000/ok',
        failure_url: 'http://127.0.0.1:3000/ko',
        webhook_endpoint: webhookEndpoint,
      }),
    });
    assert.equal(createRes.status, 201);
    const checkout = await createRes.json();

    // Keyboard ArrowRight navigation through tabs & check Requests tab shows /checkouts
    await page.focus('#tab-btn-overview');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.getElementById('tab-requests')?.textContent?.includes('/checkouts'));
    const reqText = await page.textContent('#tab-requests');
    assert.ok(reqText && reqText.includes('/checkouts'), 'Expected /checkouts request to appear in Requests tab');
    await runAccessibilityAudit(page, 'dark-en-requests');

    // 3. Payment Preview iframe loads hosted Chargily checkout page & pays it
    await page.click('#tab-btn-preview');
    await page.fill('#preview-url', checkout.checkout_url);
    await page.click('#tab-preview button');
    const frame = page.frameLocator('#preview-frame');
    await frame.locator('button[value="success"]').click();
    await page.waitForTimeout(300);
    assert.ok(receivedHooks.length >= 1, 'Expected hosted preview payment to deliver Chargily webhook');

    // 4. Webhooks tab shows delivered hook & Redeliver sends another webhook
    const beforeCount = receivedHooks.length;
    await page.click('#tab-btn-webhooks');
    await page.waitForSelector('#tab-webhooks table button');
    await runAccessibilityAudit(page, 'dark-en-webhooks');
    await page.click('#tab-webhooks table button');
    await page.waitForTimeout(300);
    assert.ok(receivedHooks.length > beforeCount, 'Expected Webhooks Redeliver button to resend webhook');

    // 5. Scenarios tab: switch Chargily scenario to declined & verify API request honors it
    await page.click('#tab-btn-scenarios');
    await runAccessibilityAudit(page, 'dark-en-scenarios');
    await page.selectOption('#scen-provider', 'chargily');
    await page.selectOption('#scen-name', 'declined');
    await page.click('#tab-scenarios .btn-accent');
    await page.waitForTimeout(200);

    const declinedCheckout = await fetch(`${runtime.urls.chargily}/checkouts`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test_sk_browser_e2e',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: 2000,
        currency: 'dzd',
        success_url: 'http://127.0.0.1:3000/ok',
      }),
    });
    assert.equal(declinedCheckout.status, 201);
    const decData = await declinedCheckout.json();
    const payDecRes = await fetch(`${decData.checkout_url}/action`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'success' }),
    });
    const payDecJson = await payDecRes.json();
    assert.equal(payDecJson.checkout.status, 'failed');

    // 6. Scenario Matrix tab reflects exercised failure scenario & can activate rate_limited
    await page.click('#tab-btn-matrix');
    await page.waitForFunction(() => {
      const text = document.getElementById('tab-matrix')?.textContent || '';
      return text.includes('declined') && !text.includes(': 0 / ');
    });
    const matrixText = await page.textContent('#tab-matrix');
    assert.ok(matrixText && matrixText.includes('declined'), 'Expected declined scenario in matrix');
    assert.ok(!matrixText.includes(': 0 / '), 'Expected tested failure scenario count > 0 in matrix');
    await runAccessibilityAudit(page, 'dark-en-matrix');

    // Activate rate_limited from Scenario Matrix button
    const rateBtn = page.locator('#tab-matrix tr:has-text("chargily"):has-text("rate_limited") button');
    await rateBtn.click();
    await page.waitForTimeout(200);
    const rateRes = await fetch(`${runtime.urls.chargily}/checkouts`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test_sk_browser_e2e', 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 1500, currency: 'dzd', success_url: 'http://127.0.0.1:3000/ok' }),
    });
    assert.equal(rateRes.status, 429, 'Expected Scenario Matrix activation of rate_limited to yield HTTP 429');

    // 7. Clock tab advance +1h updates virtual clock time
    await page.click('#tab-btn-clock');
    await runAccessibilityAudit(page, 'dark-en-clock');
    const beforeClock = await page.textContent('#tab-clock p code');
    await page.click('#tab-clock button:has-text("+1h")');
    await page.waitForTimeout(200);
    const afterClock = await page.textContent('#tab-clock p code');
    assert.notEqual(afterClock, beforeClock, 'Expected +1h clock advance button to advance virtual clock');

    // Assert zero external network requests and zero page JS errors
    assert.deepEqual(externalRequests, [], `Unexpected external network requests: ${externalRequests.join(', ')}`);
    assert.deepEqual(pageErrors, [], `Unexpected browser pageerrors: ${pageErrors.join(', ')}`);

    console.log(
      JSON.stringify({
        browserE2E: 'OK',
        executable: path.basename(executablePath),
        externalRequests: externalRequests.length,
        pageErrors: pageErrors.length,
        webhooksReceived: receivedHooks.length,
        clockBefore: beforeClock,
        clockAfter: afterClock,
      }),
    );
  } finally {
    await browser.close();
    await runtime.stop();
    await new Promise((resolve) => hookServer.close(resolve));
  }
}

await main();
