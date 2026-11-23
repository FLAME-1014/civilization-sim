import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createPreview } from '../dev-server.mjs';
import { fileURLToPath } from 'node:url';

let chromium;
try {
  chromium = createRequire(new URL('../../package.json', import.meta.url))('playwright').chromium;
} catch { /* Browser automation is an optional workspace-level tool. */ }

const executable = process.env.CHROME_PATH
  ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);

test('browser: desktop dashboard, map interactions, interventions, policies, and mobile layout', { skip: !chromium || !executable, timeout: 45_000 }, async (t) => {
  const server = createPreview();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: executable, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1130 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(4_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded', timeout: 12_000 });
    assert.equal(response?.status(), 200);
    assert.equal(await page.title(), '栖年 · 文明模拟');
    await page.waitForFunction(() => window.__LIVING_WORLD__?.world?.year === 2040);
    assert.equal(await page.locator('.map-city-group').count(), 12);
    assert.equal(await page.locator('.map-route').count(), await page.evaluate(() => window.__LIVING_WORLD__.world.links.length));
    assert.match(await page.locator('#metric-gdp').textContent(), /万亿/);
    assert.equal(await page.locator('#event-list .event-item').count(), 1);
    mkdirSync(fileURLToPath(new URL('../artifacts/', import.meta.url)), { recursive: true });
    await page.screenshot({ path: fileURLToPath(new URL('../artifacts/overview-desktop.png', import.meta.url)), fullPage: true, animations: 'disabled' });

    await page.locator('.map-city-group[data-city="8"]').click();
    assert.match(await page.locator('.city-title').textContent(), /林屿/);
    await page.locator('.map-layer[data-layer="environment"]').click();
    assert.equal(await page.locator('.map-layer[data-layer="environment"]').getAttribute('class').then((value) => value.includes('active')), true);
    await page.locator('.map-layer[data-layer="resources"]').click();
    assert.match(await page.locator('.map-city-group[data-city="8"] .map-city-subtitle').textContent(), /stock/);
    const reserveCityColorA = await page.locator('.map-city-group[data-city="0"] .map-city-core').getAttribute('style');
    const reserveCityColorB = await page.locator('.map-city-group[data-city="10"] .map-city-core').getAttribute('style');
    assert.notEqual(reserveCityColorA, reserveCityColorB, 'the resource map should render individual city stock levels');
    await page.locator('.chart-tab[data-series="environment"]').click();
    assert.match(await page.locator('#chart-unit').textContent(), /100/);

    await page.locator('.policy-button[data-policy="green"]').click();
    assert.ok(await page.evaluate(() => window.__LIVING_WORLD__.world.cities.every((city) => city.plan === 'green')));
    await page.locator('[data-event="scarcity"]').click();
    assert.equal(await page.evaluate(() => window.__LIVING_WORLD__.world.events[0].type), 'crisis');
    await page.locator('#step-forward').click();
    assert.equal(await page.locator('#year-display').textContent(), '2041');
    assert.equal(await page.evaluate(() => window.__LIVING_WORLD__.world.cities.every((city) => Number.isFinite(city.gdp) && Object.values(city.resources).every((value) => value >= 0))), true);

    await page.locator('#fullscreen-map').click();
    assert.equal(await page.locator('#map-modal .map-city-group').count(), 12);
    await page.locator('#modal-close').click();
    await page.locator('#scenario-select').selectOption('energy');
    assert.equal(await page.locator('#year-display').textContent(), '2040');
    assert.equal(await page.evaluate(() => window.__LIVING_WORLD__.world.scenario), 'energy');
    await page.locator('.speed-button[data-speed="5"]').click();
    await page.locator('#play-button').click();
    await page.waitForFunction(() => window.__LIVING_WORLD__.world.year > 2040, null, { timeout: 5_000 });
    await page.locator('#play-button').click();

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-button').click();
    const download = await downloadPromise;
    const downloaded = JSON.parse(readFileSync(await download.path(), 'utf8'));
    assert.equal(downloaded.version, '1.0.0');
    assert.equal(downloaded.year, 2041);
    assert.equal(downloaded.world.cities.length, 12);
    assert.equal(await page.locator('#toast').isVisible(), true);
    assert.deepEqual(errors, [], 'the browser console should contain no application runtime failures');

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    mobile.setDefaultTimeout(4_000);
    mobile.on('pageerror', (error) => errors.push(error.message));
    await mobile.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded', timeout: 12_000 });
    await mobile.waitForFunction(() => window.__LIVING_WORLD__?.world?.year === 2040);
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'the mobile layout should not cause horizontal scrolling');
    assert.equal(await mobile.locator('.map-city-group').count(), 12);
    await mobile.locator('.map-city-group[data-city="2"] .map-city-core').click();
    assert.match(await mobile.locator('.city-title').textContent(), /白沄/);
    await mobile.screenshot({ path: fileURLToPath(new URL('../artifacts/overview-mobile.png', import.meta.url)), fullPage: true, animations: 'disabled' });
    assert.deepEqual(errors, [], 'mobile must also have no application runtime failures');
    t.diagnostic(`Chrome smoke test passed; desktop and 390px mobile screenshots saved to artifacts/.`);
  } finally {
    await browser?.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
