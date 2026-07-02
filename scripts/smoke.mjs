// Headless-Smoke-Test: lädt das Spiel, startet einen Run und prüft die Kernsysteme.
// Voraussetzung: ein laufender Server (z. B. `npm run preview`) auf SMOKE_URL.
//   SMOKE_URL=http://localhost:5199  CHROME_PATH=/pfad/zu/chrome  node scripts/smoke.mjs
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const URL = process.env.SMOKE_URL || 'http://localhost:5199/';
const CHROME =
  process.env.CHROME_PATH ||
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);

if (!CHROME) {
  console.error('Kein Chrome gefunden. Setze CHROME_PATH.');
  process.exit(2);
}

const errors = [];
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') {
    const t = m.text();
    if (!/404|favicon|pointer ?lock|SwiftShader|GL Driver|ReadPixels/i.test(t)) errors.push('err: ' + t);
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const poll = async (fn, timeout = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn)) return true;
    await sleep(200);
  }
  return false;
};

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });

// Pflicht-Namens-Screen (frisches Profil hat keinen gespeicherten Namen)
const nameScreen = await poll(() => {
  const ns = document.getElementById('name-screen');
  return ns && !ns.classList.contains('hidden') && !!window.__game?.player;
}, 20000);
if (nameScreen) {
  await page.type('#player-name', 'SmokeTest');
  await page.click('#name-confirm');
}

const menuReady = await poll(() => {
  const ss = document.getElementById('start-screen');
  return ss && !ss.classList.contains('hidden') && !!window.__game?.player;
});
const heroClips = await page.evaluate(() => Object.keys(window.__game.player.actions));

await page.click('#start-button');
await poll(() => !document.getElementById('map-screen').classList.contains('hidden'), 4000);
await page.click('#map-start');
await sleep(600);
const started = await page.evaluate(() => window.__game.mode);

for (const k of ['d', 's', 'a', 'w']) {
  await page.keyboard.down(k);
  await sleep(1000);
  await page.keyboard.up(k);
}
// auf Gegner-Aktivität warten (SwiftShader ist langsam; lebend ODER bereits erlegt)
await poll(() => window.__game.enemies.aliveCount > 0 || window.__game.enemies.totalKills > 0, 25000);
const mid = await page.evaluate(() => ({
  mode: window.__game.mode,
  enemies: window.__game.enemies.aliveCount,
  enemyActivity: window.__game.enemies.aliveCount + window.__game.enemies.totalKills,
  weapons: window.__game.weapons.ownedList().length,
}));

const lvBefore = await page.evaluate(() => window.__game.player.level);
await page.evaluate(() => window.__game._collectXp(window.__game.player.xpToNext * 3 + 5, window.__game.player));
const lvlUp = await poll(() => window.__game.mode === 'levelup' && document.querySelectorAll('.lvl-choice').length > 0, 4000);
for (let i = 0; i < 15; i++) {
  if ((await page.evaluate(() => window.__game.mode)) !== 'levelup') break;
  await page.evaluate(() => document.querySelector('.lvl-choice')?.click());
  await sleep(250);
}
const after = await page.evaluate(() => ({ mode: window.__game.mode, level: window.__game.player.level }));
const glLost = await page.evaluate(() => window.__game.renderer.getContext().isContextLost());

console.log('menu/assets:', menuReady, '| hero clips:', heroClips.join(','));
console.log('started:', started, '| mid:', JSON.stringify(mid));
console.log('level-up:', lvlUp, '| level', lvBefore, '->', after.level, '| mode after:', after.mode);
console.log('gl lost:', glLost, '| errors:', errors.length ? errors : 'none');

await browser.close();
const pass =
  menuReady && heroClips.length > 0 && started === 'play' && mid.enemyActivity > 0 && mid.weapons >= 1 && lvlUp && after.mode === 'play' && after.level > lvBefore && !glLost && errors.length === 0;
console.log(pass ? 'RESULT: PASS' : 'RESULT: FAIL');
process.exit(pass ? 0 : 1);
