// Schneller visueller Check: Run starten, Screenshot speichern.
//   SHOT_PATH=/tmp/shot.png SHOT_MAP=valley node scripts/shot.mjs
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const URL = process.env.SMOKE_URL || 'http://localhost:5199/';
const OUT = process.env.SHOT_PATH || '/tmp/gothic-shot.png';
const MAP = process.env.SHOT_MAP || 'valley';
const HERO = process.env.SHOT_HERO || 'soldier';
const POS = process.env.SHOT_POS || ''; // 'x,z' -> nach Run-Start dorthin teleportieren
const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(existsSync);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const poll = async (fn, timeout = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn)) return true;
    await sleep(250);
  }
  return false;
};

await page.goto(URL + '?unlock', { waitUntil: 'domcontentloaded', timeout: 60000 });
await poll(() => window.__game && !document.getElementById('name-screen').classList.contains('hidden'), 30000);
await page.type('#player-name', 'Shot');
await page.click('#name-confirm');
await poll(() => !document.getElementById('start-screen').classList.contains('hidden'));
await page.evaluate((map, hero) => { window.__game._selHero = hero; window.__game.startRun(map, 'normal'); }, MAP, HERO);
await poll(() => window.__game.mode === 'play' && window.__game._introT === 0, 20000);
if (POS) {
  const [px, pz] = POS.split(',').map(Number);
  await page.evaluate((x, z) => {
    const g = window.__game;
    g.player.position.set(x, g.world.getHeight(x, z), z);
    g.camCtrl.snap(g.player.position);
  }, px, pz);
}
await sleep(2500); // Gegner/Effekte auflaufen lassen
await page.screenshot({ path: OUT });
console.log('Screenshot:', OUT);
await browser.close();
process.exit(0);
